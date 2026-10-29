import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { UsuarioSesion } from '../comun/decoradores';
import { dec, Dec, DECIMALES_BS, redondear } from '../comun/dinero';
import { hoyEnCaracas } from '../comun/fechas';
import { Moneda } from '../tasas/tasa-cambio.entity';
import { TasasService } from '../tasas/tasas.service';
import { CajaService } from './caja.service';
import { aBolivares } from './calculo-venta';
import { Cliente } from './entidades/cliente.entity';
import { AbonoCliente, AplicacionAbono, CuentaCobrar } from './entidades/cuenta-cobrar.entity';
import { METODOS_FUERA_DE_CAJA, METODOS_PAGO } from './metodos-pago';
import { AbonoClienteDto } from './ventas.dto';

const b2 = (v: Dec) => redondear(v, DECIMALES_BS);
/** Diferencia de redondeo aceptada al pagar todo el saldo. */
const TOLERANCIA_USD = dec('0.01');

export interface EstadoCuenta {
  cliente: Cliente;
  saldoUsd: string;
  disponibleUsd: string;
  vencidoUsd: string;
  cuentas: {
    id: number;
    ventaId: number;
    factura: string;
    fecha: Date;
    vencimiento: string;
    montoUsd: string;
    saldoUsd: string;
    diasVencida: number;
  }[];
  abonos: AbonoCliente[];
}

export interface ClientePorCobrar {
  cliente: { id: number; documento: string; nombre: string; telefono: string | null };
  saldoUsd: string;
  vencidoUsd: string;
  /** Días de la cuenta más vencida (negativo: aún no vence ninguna). */
  diasVencida: number;
}

const dias = (desde: string, hasta: string) =>
  Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);

function sumarDias(fecha: string, n: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class CobranzaService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly tasas: TasasService,
    private readonly caja: CajaService,
  ) {}

  /** Bloquea al cliente (para que dos ventas no pasen juntas el límite) y devuelve su deuda en USD. */
  private async saldoBloqueado(m: EntityManager, clienteId: number): Promise<{ cliente: Cliente; saldo: Dec }> {
    const cliente = await m.getRepository(Cliente).findOne({ where: { id: clienteId }, lock: { mode: 'pessimistic_write' } });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');
    const [{ saldo }] = await m.query(`SELECT coalesce(sum(saldo_usd), 0) AS saldo FROM cuentas_cobrar WHERE cliente_id = $1`, [
      clienteId,
    ]);
    return { cliente, saldo: dec(saldo) };
  }

  /** Abre la cuenta por cobrar de una venta a crédito, dentro de su transacción. */
  async abrirCuenta(m: EntityManager, ventaId: number, clienteId: number, montoUsd: Dec): Promise<CuentaCobrar> {
    const { cliente, saldo } = await this.saldoBloqueado(m, clienteId);
    const limite = dec(cliente.limiteCreditoUsd);
    if (limite.lte(0)) throw new BadRequestException(`${cliente.nombre} no tiene crédito aprobado`);
    if (saldo.plus(montoUsd).gt(limite)) {
      throw new BadRequestException(
        `La venta supera el crédito de ${cliente.nombre}: debe $ ${saldo.toFixed(2)}, límite $ ${limite.toFixed(2)}, disponible $ ${Dec.max(0, limite.minus(saldo)).toFixed(2)}`,
      );
    }
    return m.save(
      m.create(CuentaCobrar, {
        ventaId,
        clienteId,
        montoUsd: montoUsd.toFixed(2),
        saldoUsd: montoUsd.toFixed(2),
        vencimiento: sumarDias(hoyEnCaracas(), cliente.diasCredito),
      }),
    );
  }

  /** Al anular una venta a crédito se elimina su cuenta, siempre que no tenga abonos. */
  async anularDeVenta(m: EntityManager, ventaId: number): Promise<void> {
    const cuenta = await m.getRepository(CuentaCobrar).findOne({ where: { ventaId }, lock: { mode: 'pessimistic_write' } });
    if (!cuenta) return;
    if (!dec(cuenta.saldoUsd).eq(cuenta.montoUsd)) {
      throw new BadRequestException('La venta a crédito ya tiene abonos: haga una nota de crédito en lugar de anularla');
    }
    await m.delete(CuentaCobrar, { id: cuenta.id });
  }

  /** Reparte un monto entre las cuentas indicadas, de la que vence primero a la última. */
  private async aplicar(m: EntityManager, abono: AbonoCliente, cuentas: CuentaCobrar[], montoUsd: Dec): Promise<void> {
    let resto = montoUsd;
    for (const cuenta of cuentas) {
      if (resto.lte(0)) break;
      const aplicado = Dec.min(resto, cuenta.saldoUsd);
      if (aplicado.lte(0)) continue;
      await m.save(m.create(AplicacionAbono, { abonoId: abono.id, cuentaId: cuenta.id, montoUsd: aplicado.toFixed(2) }));
      await m.update(CuentaCobrar, { id: cuenta.id }, { saldoUsd: dec(cuenta.saldoUsd).minus(aplicado).toFixed(2) });
      resto = resto.minus(aplicado);
    }
  }

  /** Abono en dinero: entra a la caja abierta del usuario y se convierte a USD con la tasa del día. */
  async abonar(clienteId: number, dto: AbonoClienteDto, usuario: UsuarioSesion): Promise<EstadoCuenta> {
    if (METODOS_FUERA_DE_CAJA.includes(dto.metodo)) throw new BadRequestException('Elija cómo paga el cliente');
    if (METODOS_PAGO[dto.metodo].referencia && !dto.referencia?.trim()) {
      throw new BadRequestException(`Indique la referencia del pago por ${METODOS_PAGO[dto.metodo].nombre}`);
    }
    const tasa = await this.tasas.vigenteObligatoria(Moneda.USD);
    await this.ds.transaction(async (m) => {
      const sesion = await this.caja.abiertaDe(m, usuario.id, true);
      if (!sesion) throw new BadRequestException('Abra su caja: el abono entra en ella');
      const { cliente, saldo } = await this.saldoBloqueado(m, clienteId);
      const montoBs = aBolivares(dto.metodo, dto.monto, tasa.valor);
      let montoUsd = METODOS_PAGO[dto.metodo].moneda === 'USD' ? dec(dto.monto) : b2(montoBs.div(tasa.valor));
      if (montoUsd.gt(saldo.plus(TOLERANCIA_USD))) {
        throw new BadRequestException(
          `El abono ($ ${montoUsd.toFixed(2)}) supera la deuda de ${cliente.nombre} ($ ${saldo.toFixed(2)})`,
        );
      }
      montoUsd = Dec.min(montoUsd, saldo);
      const abono = await m.save(
        m.create(AbonoCliente, {
          clienteId,
          sesionId: sesion.id,
          metodo: dto.metodo,
          monto: dec(dto.monto).toFixed(2),
          montoBs: montoBs.toFixed(2),
          tasa: tasa.valor,
          montoUsd: montoUsd.toFixed(2),
          referencia: dto.referencia?.trim() || null,
          usuarioId: usuario.id,
        }),
      );
      const cuentas = await m
        .getRepository(CuentaCobrar)
        .createQueryBuilder('c')
        .where('c.cliente_id = :clienteId AND c.saldo_usd > 0', { clienteId })
        .orderBy('c.vencimiento', 'ASC')
        .addOrderBy('c.id', 'ASC')
        .getMany();
      await this.aplicar(m, abono, cuentas, montoUsd);
    });
    return this.estadoCuenta(clienteId);
  }

  /**
   * Nota de crédito de una venta fiada: se descuenta de la deuda de esa venta
   * en lugar de devolver dinero.
   */
  async descontarNotaCredito(
    m: EntityManager,
    datos: { ventaId: number; notaCreditoId: number; totalBs: Dec; tasa: string; usuarioId: number },
  ): Promise<Dec> {
    const cuenta = await m
      .getRepository(CuentaCobrar)
      .findOne({ where: { ventaId: datos.ventaId }, lock: { mode: 'pessimistic_write' } });
    if (!cuenta) throw new BadRequestException('Esta venta no fue a crédito: elija cómo devolver el dinero');
    const montoUsd = b2(datos.totalBs.div(datos.tasa));
    if (montoUsd.gt(dec(cuenta.saldoUsd).plus(TOLERANCIA_USD))) {
      throw new BadRequestException(
        `La nota ($ ${montoUsd.toFixed(2)}) supera lo que se debe de esta venta ($ ${cuenta.saldoUsd}): devuelva la diferencia por otro método`,
      );
    }
    const aplicado = Dec.min(montoUsd, cuenta.saldoUsd);
    const abono = await m.save(
      m.create(AbonoCliente, {
        clienteId: cuenta.clienteId,
        sesionId: null,
        notaCreditoId: datos.notaCreditoId,
        metodo: 'NOTA_CREDITO',
        monto: datos.totalBs.toFixed(2),
        montoBs: datos.totalBs.toFixed(2),
        tasa: datos.tasa,
        montoUsd: aplicado.toFixed(2),
        referencia: null,
        usuarioId: datos.usuarioId,
      }),
    );
    await this.aplicar(m, abono, [cuenta], aplicado);
    return aplicado;
  }

  async estadoCuenta(clienteId: number): Promise<EstadoCuenta> {
    const cliente = await this.ds.getRepository(Cliente).findOneBy({ id: clienteId });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');
    const filas: Record<string, string>[] = await this.ds.query(
      `SELECT c.id, c.venta_id, c.vencimiento::text AS vencimiento, c.monto_usd, c.saldo_usd, v.creado_en, v.serie, v.numero_factura, t.digitos
         FROM cuentas_cobrar c JOIN ventas v ON v.id = c.venta_id JOIN talonarios t ON t.id = v.talonario_id
        WHERE c.cliente_id = $1
        ORDER BY (c.saldo_usd > 0) DESC, c.vencimiento ASC, c.id ASC`,
      [clienteId],
    );
    const hoy = hoyEnCaracas();
    const cuentas = filas.map((f) => ({
      id: Number(f.id),
      ventaId: Number(f.venta_id),
      factura: `${f.serie ? `${f.serie}-` : ''}${String(f.numero_factura).padStart(Number(f.digitos), '0')}`,
      fecha: new Date(f.creado_en),
      vencimiento: f.vencimiento,
      montoUsd: f.monto_usd,
      saldoUsd: f.saldo_usd,
      diasVencida: dias(f.vencimiento, hoy),
    }));
    const saldo = cuentas.reduce((s, c) => s.plus(c.saldoUsd), dec(0));
    const vencido = cuentas.filter((c) => c.diasVencida > 0).reduce((s, c) => s.plus(c.saldoUsd), dec(0));
    const abonos = await this.ds.getRepository(AbonoCliente).find({
      where: { clienteId },
      relations: { usuario: true },
      order: { id: 'DESC' },
      take: 100,
    });
    return {
      cliente,
      saldoUsd: saldo.toFixed(2),
      disponibleUsd: Dec.max(0, dec(cliente.limiteCreditoUsd).minus(saldo)).toFixed(2),
      vencidoUsd: vencido.toFixed(2),
      cuentas,
      abonos,
    };
  }

  /** Clientes que deben, del más atrasado al más al día. */
  async porCobrar(): Promise<{ clientes: ClientePorCobrar[]; totalUsd: string; vencidoUsd: string }> {
    const hoy = hoyEnCaracas();
    const filas: Record<string, string>[] = await this.ds.query(
      `SELECT cl.id, cl.documento, cl.nombre, cl.telefono,
              sum(c.saldo_usd) AS saldo,
              coalesce(sum(c.saldo_usd) FILTER (WHERE c.vencimiento < $1::date), 0) AS vencido,
              min(c.vencimiento)::text AS primer_vencimiento
         FROM cuentas_cobrar c JOIN clientes cl ON cl.id = c.cliente_id
        WHERE c.saldo_usd > 0
        GROUP BY cl.id
        ORDER BY min(c.vencimiento) ASC`,
      [hoy],
    );
    const clientes = filas.map((f): ClientePorCobrar => ({
      cliente: { id: Number(f.id), documento: f.documento, nombre: f.nombre, telefono: f.telefono },
      saldoUsd: dec(f.saldo).toFixed(2),
      vencidoUsd: dec(f.vencido).toFixed(2),
      diasVencida: dias(f.primer_vencimiento, hoy),
    }));
    return {
      clientes,
      totalUsd: clientes.reduce((s, c) => s.plus(c.saldoUsd), dec(0)).toFixed(2),
      vencidoUsd: clientes.reduce((s, c) => s.plus(c.vencidoUsd), dec(0)).toFixed(2),
    };
  }
}
