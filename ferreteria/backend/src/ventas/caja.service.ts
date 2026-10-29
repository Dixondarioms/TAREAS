import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { UsuarioSesion } from '../comun/decoradores';
import { dec, Dec } from '../comun/dinero';
import { Pagina } from '../comun/paginacion';
import { Rol } from '../usuarios/rol.enum';
import { MovimientoCaja, TipoMovimientoCaja } from './entidades/movimiento-caja.entity';
import { EstadoCaja, MontosPorMetodo, SesionCaja } from './entidades/sesion-caja.entity';
import { MetodoPago, METODOS_FUERA_DE_CAJA, METODOS_PAGO } from './metodos-pago';
import { AbrirCajaDto, BuscarSesionesDto, CerrarCajaDto, MovimientoCajaDto } from './ventas.dto';

export interface ResumenCaja {
  sesion: SesionCaja;
  ventas: { cantidad: number; anuladas: number; totalBs: string; igtfBs: string; creditoBs: string; retencionesBs: string };
  /** Abonos de clientes a sus deudas, en la moneda del método. */
  abonos: MontosPorMetodo;
  /** Cobrado por método (sin restar vuelto), en la moneda del método. */
  cobrado: MontosPorMetodo;
  vuelto: MontosPorMetodo;
  /** Devuelto a clientes por notas de crédito, en la moneda del método. */
  reintegros: MontosPorMetodo;
  movimientos: MovimientoCaja[];
  /** Lo que debería haber por método: fondo + cobrado − vuelto ± movimientos. */
  esperado: MontosPorMetodo;
  /** Al cerrar: contado − esperado. */
  diferencias: MontosPorMetodo | null;
}

const SIGNO_MOVIMIENTO: Record<TipoMovimientoCaja, 1 | -1> = {
  [TipoMovimientoCaja.INGRESO]: 1,
  [TipoMovimientoCaja.RETIRO]: -1,
  [TipoMovimientoCaja.GASTO]: -1,
};

function sumar(destino: Record<string, Dec>, metodo: string, monto: Dec) {
  destino[metodo] = (destino[metodo] ?? dec(0)).plus(monto);
}

const aTextos = (montos: Record<string, Dec>): MontosPorMetodo =>
  Object.fromEntries(Object.entries(montos).map(([k, v]) => [k, v.toFixed(2)]));

@Injectable()
export class CajaService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /** Caja abierta del usuario, bloqueada hasta el fin de la transacción si se pide. */
  async abiertaDe(m: EntityManager, usuarioId: number, bloquear = false): Promise<SesionCaja | null> {
    return m.getRepository(SesionCaja).findOne({
      where: { usuarioId, estado: EstadoCaja.ABIERTA },
      ...(bloquear ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
  }

  async actual(usuario: UsuarioSesion): Promise<ResumenCaja | null> {
    const sesion = await this.abiertaDe(this.ds.manager, usuario.id);
    return sesion ? this.resumen(this.ds.manager, sesion) : null;
  }

  async abrir(dto: AbrirCajaDto, usuario: UsuarioSesion): Promise<ResumenCaja> {
    return this.ds.transaction(async (m) => {
      if (await this.abiertaDe(m, usuario.id, true)) throw new ConflictException('Ya tiene una caja abierta');
      const sesion = await m.save(
        m.create(SesionCaja, {
          usuarioId: usuario.id,
          fondoBs: dec(dto.fondoBs).toFixed(2),
          fondoUsd: dec(dto.fondoUsd).toFixed(2),
        }),
      );
      return this.resumen(m, sesion);
    });
  }

  async movimiento(dto: MovimientoCajaDto, usuario: UsuarioSesion): Promise<ResumenCaja> {
    return this.ds.transaction(async (m) => {
      const sesion = await this.abiertaDe(m, usuario.id, true);
      if (!sesion) throw new BadRequestException('Abra la caja primero');
      if (SIGNO_MOVIMIENTO[dto.tipo] < 0) {
        const { esperado } = await this.resumen(m, sesion);
        if (dec(esperado[dto.metodo] ?? '0').lt(dto.monto)) {
          throw new BadRequestException(
            `No hay suficiente ${METODOS_PAGO[dto.metodo].nombre} en caja: hay ${esperado[dto.metodo] ?? '0.00'}`,
          );
        }
      }
      await m.save(
        m.create(MovimientoCaja, {
          sesionId: sesion.id,
          tipo: dto.tipo,
          metodo: dto.metodo,
          monto: dec(dto.monto).toFixed(2),
          motivo: dto.motivo.trim(),
          usuarioId: usuario.id,
        }),
      );
      return this.resumen(m, sesion);
    });
  }

  /** Cierra la caja guardando lo esperado y lo contado; las diferencias quedan a la vista del gerente. */
  async cerrar(dto: CerrarCajaDto, usuario: UsuarioSesion): Promise<ResumenCaja> {
    return this.ds.transaction(async (m) => {
      const sesion = await this.abiertaDe(m, usuario.id, true);
      if (!sesion) throw new BadRequestException('No tiene una caja abierta');
      const contado: MontosPorMetodo = {};
      for (const [metodo, valor] of Object.entries(dto.contado ?? {})) {
        if (!(metodo in METODOS_PAGO)) throw new BadRequestException(`Método de pago desconocido: ${metodo}`);
        if (typeof valor !== 'string' || !/^\d+(\.\d{1,2})?$/.test(valor)) {
          throw new BadRequestException(`Monto contado inválido para ${METODOS_PAGO[metodo as MetodoPago].nombre}`);
        }
        contado[metodo] = dec(valor).toFixed(2);
      }
      const { esperado } = await this.resumen(m, sesion);
      for (const metodo of Object.keys(esperado)) contado[metodo] ??= '0.00';
      sesion.estado = EstadoCaja.CERRADA;
      sesion.cerradaEn = new Date();
      sesion.esperado = esperado;
      sesion.contado = contado;
      sesion.observaciones = dto.observaciones?.trim() || null;
      await m.save(sesion);
      return this.resumen(m, sesion);
    });
  }

  async sesiones(c: BuscarSesionesDto): Promise<Pagina<SesionCaja>> {
    const pagina = c.pagina ?? 1;
    const porPagina = c.porPagina ?? 50;
    const [datos, total] = await this.ds.getRepository(SesionCaja).findAndCount({
      relations: { usuario: true },
      order: { id: 'DESC' },
      skip: (pagina - 1) * porPagina,
      take: porPagina,
    });
    return { datos, total, pagina, porPagina };
  }

  async detalle(id: number, usuario: UsuarioSesion): Promise<ResumenCaja> {
    const sesion = await this.ds.getRepository(SesionCaja).findOne({ where: { id }, relations: { usuario: true } });
    if (!sesion) throw new NotFoundException('Caja no encontrada');
    if (sesion.usuarioId !== usuario.id && usuario.rol !== Rol.ADMIN && usuario.rol !== Rol.GERENTE) {
      throw new ForbiddenException('Solo puede ver sus propias cajas');
    }
    return this.resumen(this.ds.manager, sesion);
  }

  async resumen(m: EntityManager, sesion: SesionCaja): Promise<ResumenCaja> {
    const [ventas] = await m.query(
      `SELECT count(*) FILTER (WHERE estado = 'COMPLETADA') AS cantidad,
              count(*) FILTER (WHERE estado = 'ANULADA') AS anuladas,
              coalesce(sum(total_bs) FILTER (WHERE estado = 'COMPLETADA'), 0) AS total,
              coalesce(sum(igtf_bs) FILTER (WHERE estado = 'COMPLETADA'), 0) AS igtf
         FROM ventas WHERE sesion_id = $1`,
      [sesion.id],
    );
    const pagos: { metodo: string; monto: string }[] = await m.query(
      `SELECT p.metodo, sum(p.monto) AS monto
         FROM ventas_pagos p JOIN ventas v ON v.id = p.venta_id
        WHERE v.sesion_id = $1 AND v.estado = 'COMPLETADA'
        GROUP BY p.metodo`,
      [sesion.id],
    );
    const vueltos: { metodo: string; monto: string }[] = await m.query(
      `SELECT vuelto_metodo AS metodo, sum(vuelto_monto) AS monto
         FROM ventas
        WHERE sesion_id = $1 AND estado = 'COMPLETADA' AND vuelto_metodo IS NOT NULL
        GROUP BY vuelto_metodo`,
      [sesion.id],
    );
    const reintegrosNc: { metodo: string; monto: string }[] = await m.query(
      `SELECT reintegro_metodo AS metodo, sum(reintegro_monto) AS monto
         FROM notas_credito WHERE sesion_id = $1 GROUP BY reintegro_metodo`,
      [sesion.id],
    );
    const movimientos = await m.getRepository(MovimientoCaja).find({ where: { sesionId: sesion.id }, order: { id: 'ASC' } });

    const cobrado: Record<string, Dec> = {};
    const vuelto: Record<string, Dec> = {};
    const esperado: Record<string, Dec> = {
      [MetodoPago.EFECTIVO_BS]: dec(sesion.fondoBs),
      [MetodoPago.EFECTIVO_USD]: dec(sesion.fondoUsd),
    };
    let credito = dec(0);
    let retenciones = dec(0);
    for (const p of pagos) {
      // Lo fiado no entra a la caja: se informa aparte y no se cuenta al cerrar.
      if (METODOS_FUERA_DE_CAJA.includes(p.metodo as MetodoPago)) {
        if (p.metodo === MetodoPago.CREDITO) credito = credito.plus(p.monto);
        else retenciones = retenciones.plus(p.monto);
        continue;
      }
      sumar(cobrado, p.metodo, dec(p.monto));
      sumar(esperado, p.metodo, dec(p.monto));
    }
    const abonosCaja: { metodo: string; monto: string }[] = await m.query(
      `SELECT metodo, sum(monto) AS monto FROM abonos_cliente WHERE sesion_id = $1 GROUP BY metodo`,
      [sesion.id],
    );
    // Notas de débito cobradas en esta caja.
    const debitos: { metodo: string; monto: string }[] = await m.query(
      `SELECT metodo, sum(monto) AS monto FROM notas_debito WHERE sesion_id = $1 GROUP BY metodo`,
      [sesion.id],
    );
    for (const d of debitos) {
      sumar(cobrado, d.metodo, dec(d.monto));
      sumar(esperado, d.metodo, dec(d.monto));
    }
    const abonos: Record<string, Dec> = {};
    for (const a of abonosCaja) {
      sumar(abonos, a.metodo, dec(a.monto));
      sumar(esperado, a.metodo, dec(a.monto));
    }
    for (const v of vueltos) {
      sumar(vuelto, v.metodo, dec(v.monto));
      sumar(esperado, v.metodo, dec(v.monto).negated());
    }
    const reintegros: Record<string, Dec> = {};
    for (const r of reintegrosNc) {
      if (METODOS_FUERA_DE_CAJA.includes(r.metodo as MetodoPago)) continue;
      sumar(reintegros, r.metodo, dec(r.monto));
      sumar(esperado, r.metodo, dec(r.monto).negated());
    }
    for (const mov of movimientos) sumar(esperado, mov.metodo, dec(mov.monto).times(SIGNO_MOVIMIENTO[mov.tipo]));

    const esperadoTexto = sesion.esperado ?? aTextos(esperado);
    const diferencias = sesion.contado
      ? Object.fromEntries(
          Object.keys({ ...esperadoTexto, ...sesion.contado }).map((k) => [
            k,
            dec(sesion.contado![k] ?? '0')
              .minus(esperadoTexto[k] ?? '0')
              .toFixed(2),
          ]),
        )
      : null;
    return {
      sesion,
      ventas: {
        cantidad: Number(ventas.cantidad),
        anuladas: Number(ventas.anuladas),
        totalBs: dec(ventas.total).toFixed(2),
        igtfBs: dec(ventas.igtf).toFixed(2),
        creditoBs: credito.toFixed(2),
        retencionesBs: retenciones.toFixed(2),
      },
      abonos: aTextos(abonos),
      cobrado: aTextos(cobrado),
      vuelto: aTextos(vuelto),
      reintegros: aTextos(reintegros),
      movimientos,
      esperado: esperadoTexto,
      diferencias,
    };
  }
}
