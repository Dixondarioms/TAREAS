import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AlicuotaIva } from '../catalogo/entidades/producto.entity';
import { UnidadMedida } from '../catalogo/entidades/unidad-medida.entity';
import { UsuarioSesion } from '../comun/decoradores';
import { dec, Dec, DECIMALES_BS, montoIva, redondear } from '../comun/dinero';
import { InventarioService } from '../inventario/inventario.service';
import { TipoMovimiento } from '../inventario/movimiento-inventario.entity';
import { Rol } from '../usuarios/rol.enum';
import { CajaService } from './caja.service';
import { NotaCredito, NotaCreditoLinea } from './entidades/nota-credito.entity';
import { TipoDocumento } from './entidades/talonario.entity';
import { EstadoVenta, Venta } from './entidades/venta.entity';
import { METODOS_PAGO } from './metodos-pago';
import { formatoNumero, TalonariosService } from './talonarios.service';
import { CrearNotaCreditoDto } from './ventas.dto';

const b2 = (v: Dec) => redondear(v, DECIMALES_BS);

@Injectable()
export class NotasCreditoService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly caja: CajaService,
    private readonly talonarios: TalonariosService,
    private readonly inventario: InventarioService,
  ) {}

  /**
   * Devolución total o parcial de una factura. El dinero sale de la caja
   * abierta de quien emite la nota; la mercancía vuelve al inventario salvo
   * que se indique lo contrario.
   */
  async crear(ventaId: number, dto: CrearNotaCreditoDto, usuario: UsuarioSesion): Promise<NotaCredito> {
    if (!METODOS_PAGO[dto.reintegroMetodo].vuelto) {
      throw new BadRequestException(`No se puede reintegrar por ${METODOS_PAGO[dto.reintegroMetodo].nombre}`);
    }
    const id = await this.ds.transaction(async (m) => {
      const [fila] = await m.query(`SELECT id FROM ventas WHERE id = $1 FOR UPDATE`, [ventaId]);
      if (!fila) throw new NotFoundException('Venta no encontrada');
      const venta = (await m.getRepository(Venta).findOne({ where: { id: ventaId }, relations: { lineas: true } }))!;
      if (venta.estado !== EstadoVenta.COMPLETADA) throw new BadRequestException('La venta está anulada');
      const esGerente = usuario.rol === Rol.ADMIN || usuario.rol === Rol.GERENTE;
      if (!esGerente && venta.usuarioId !== usuario.id)
        throw new ForbiddenException('Solo puede hacer notas de crédito de sus ventas');

      const sesion = await this.caja.abiertaDe(m, usuario.id, true);
      if (!sesion) throw new BadRequestException('Abra su caja: el reintegro sale de ella');

      const devueltas = new Map<number, Dec>(
        (
          (await m.query(
            `SELECT l.venta_linea_id AS id, sum(l.cantidad) AS cantidad
               FROM notas_credito_lineas l JOIN notas_credito n ON n.id = l.nota_id
              WHERE n.venta_id = $1 GROUP BY l.venta_linea_id`,
            [ventaId],
          )) as { id: number; cantidad: string }[]
        ).map((r) => [r.id, dec(r.cantidad)]),
      );
      const unidades = new Map((await m.getRepository(UnidadMedida).find()).map((u) => [u.codigo, u]));

      const ids = dto.lineas.map((l) => l.ventaLineaId);
      if (new Set(ids).size !== ids.length) throw new BadRequestException('Una línea de la factura aparece dos veces');
      const bases: Record<AlicuotaIva, Dec> = { EXENTO: dec(0), GENERAL: dec(0), REDUCIDA: dec(0) };
      const lineas = dto.lineas.map((l) => {
        const original = venta.lineas.find((x) => x.id === l.ventaLineaId);
        if (!original) throw new BadRequestException(`La línea ${l.ventaLineaId} no pertenece a esta factura`);
        const restante = dec(original.cantidad).minus(devueltas.get(original.id) ?? 0);
        const cantidad = dec(l.cantidad);
        if (cantidad.gt(restante)) {
          throw new BadRequestException(
            `${original.codigo}: solo quedan ${restante.toString()} ${original.unidad} por devolver de esta factura`,
          );
        }
        if (unidades.get(original.unidad)?.permiteDecimales === false && !cantidad.isInteger()) {
          throw new BadRequestException(`${original.codigo} se vendió por ${original.unidad}: la cantidad debe ser entera`);
        }
        const subtotal = b2(dec(original.precioBs).times(cantidad));
        bases[original.alicuotaIva] = bases[original.alicuotaIva].plus(subtotal);
        return { original, cantidad, subtotal };
      });
      const ivaGeneral = b2(montoIva(bases.GENERAL, venta.porcentajeGeneral));
      const ivaReducida = b2(montoIva(bases.REDUCIDA, venta.porcentajeReducida));
      const total = bases.EXENTO.plus(bases.GENERAL).plus(ivaGeneral).plus(bases.REDUCIDA).plus(ivaReducida);
      const enUsd = METODOS_PAGO[dto.reintegroMetodo].moneda === 'USD';
      const reintegro = enUsd ? b2(total.div(venta.tasa)) : total;

      if (dto.reintegroMetodo.startsWith('EFECTIVO')) {
        const { esperado } = await this.caja.resumen(m, sesion);
        if (dec(esperado[dto.reintegroMetodo] ?? '0').lt(reintegro)) {
          throw new BadRequestException(
            `No hay suficiente ${METODOS_PAGO[dto.reintegroMetodo].nombre} en caja para el reintegro de ${reintegro.toFixed(2)}: hay ${esperado[dto.reintegroMetodo] ?? '0.00'}`,
          );
        }
      }

      const documento = await this.talonarios.asignar(m, TipoDocumento.NOTA_CREDITO);
      const nota = await m.save(
        m.create(NotaCredito, {
          ventaId,
          sesionId: sesion.id,
          usuarioId: usuario.id,
          talonarioId: documento.talonario.id,
          serie: documento.talonario.serie,
          numero: documento.numero,
          numeroControl: documento.numeroControl,
          motivo: dto.motivo.trim(),
          devolverInventario: dto.devolverInventario,
          baseExentaBs: bases.EXENTO.toFixed(2),
          baseGeneralBs: bases.GENERAL.toFixed(2),
          ivaGeneralBs: ivaGeneral.toFixed(2),
          baseReducidaBs: bases.REDUCIDA.toFixed(2),
          ivaReducidaBs: ivaReducida.toFixed(2),
          totalBs: total.toFixed(2),
          reintegroMetodo: dto.reintegroMetodo,
          reintegroMonto: reintegro.toFixed(2),
        }),
      );
      await m.save(
        lineas.map(({ original, cantidad, subtotal }) =>
          m.create(NotaCreditoLinea, {
            notaId: nota.id,
            ventaLineaId: original.id,
            productoId: original.productoId,
            codigo: original.codigo,
            descripcion: original.descripcion,
            unidad: original.unidad,
            factor: original.factor,
            cantidad: cantidad.toFixed(3),
            alicuotaIva: original.alicuotaIva,
            precioBs: original.precioBs,
            subtotalBs: subtotal.toFixed(2),
          }),
        ),
      );

      if (dto.devolverInventario) {
        const porProducto = new Map<number, Dec>();
        for (const { original, cantidad } of lineas) {
          porProducto.set(
            original.productoId,
            (porProducto.get(original.productoId) ?? dec(0)).plus(cantidad.times(original.factor)),
          );
        }
        const referencia = `Nota de crédito ${documento.talonario.serie ? `${documento.talonario.serie}-` : ''}${formatoNumero(documento.talonario, documento.numero)}`;
        for (const [productoId, cantidad] of [...porProducto.entries()].sort(([a], [b]) => a - b)) {
          await this.inventario.registrar(m, {
            productoId,
            tipo: TipoMovimiento.DEVOLUCION,
            cantidad: cantidad.toDecimalPlaces(3),
            motivo: `Devolución: ${nota.motivo}`.slice(0, 200),
            referencia,
            usuarioId: usuario.id,
          });
        }
      }
      return nota.id;
    });
    return this.detalle(id);
  }

  async detalle(id: number): Promise<NotaCredito> {
    const nota = await this.ds.getRepository(NotaCredito).findOne({
      where: { id },
      relations: { lineas: true, usuario: true, talonario: true },
      order: { lineas: { id: 'ASC' } },
    });
    if (!nota) throw new NotFoundException('Nota de crédito no encontrada');
    return nota;
  }

  deVenta(ventaId: number): Promise<NotaCredito[]> {
    return this.ds.getRepository(NotaCredito).find({
      where: { ventaId },
      relations: { lineas: true, usuario: true, talonario: true },
      order: { id: 'ASC', lineas: { id: 'ASC' } },
    });
  }
}
