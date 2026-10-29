import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { IsOptional, Matches } from 'class-validator';
import { DataSource } from 'typeorm';
import { dec, Dec } from '../comun/dinero';
import { ZONA_HORARIA } from '../comun/fechas';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export class ConsultaPeriodoDto {
  @Matches(FECHA, { message: 'desde debe tener el formato AAAA-MM-DD' })
  desde: string;

  @Matches(FECHA, { message: 'hasta debe tener el formato AAAA-MM-DD' })
  hasta: string;

  @IsOptional()
  @Matches(/^\d{1,3}$/)
  limite?: string;
}

export interface ReporteVentas {
  desde: string;
  hasta: string;
  totales: {
    facturas: number;
    anuladas: number;
    /** Ventas con IVA, menos notas de crédito. */
    totalBs: string;
    /** Ventas sin IVA en USD (a la tasa de cada factura), menos notas de crédito. */
    ventaNetaUsd: string;
    ivaBs: string;
    igtfBs: string;
    notasCreditoBs: string;
    /** Costo de lo vendido en USD (solo líneas con costo registrado). */
    costoUsd: string;
    gananciaUsd: string;
    margenPorcentaje: string | null;
    ticketPromedioUsd: string;
    lineasSinCosto: number;
  };
  porDia: { fecha: string; facturas: number; totalBs: string; ventaUsd: string }[];
  porMetodo: { metodo: string; monto: string; montoBs: string }[];
  porCajero: { usuario: string; facturas: number; totalBs: string }[];
  productos: {
    productoId: number;
    codigo: string;
    descripcion: string;
    cantidadBase: string;
    ventaUsd: string;
    costoUsd: string | null;
    gananciaUsd: string | null;
  }[];
}

const MAX_DIAS = 366;
const f2 = (v: unknown) => dec((v as string) ?? '0').toFixed(2);

@Injectable()
export class ReportesService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /**
   * Ventas del período (fechas en hora de Venezuela). Los montos en USD usan
   * la tasa de cada factura, así que no cambian si la tasa sube después.
   */
  async ventas(c: ConsultaPeriodoDto): Promise<ReporteVentas> {
    const { desde, hasta } = c;
    if (hasta < desde) throw new BadRequestException('La fecha final es anterior a la inicial');
    const dias = (Date.parse(hasta) - Date.parse(desde)) / 86_400_000;
    if (dias > MAX_DIAS) throw new BadRequestException(`El período no puede pasar de ${MAX_DIAS} días`);
    const limite = Math.min(Number(c.limite ?? 20), 200);
    const enPeriodo = (col: string) => `(${col} AT TIME ZONE '${ZONA_HORARIA}')::date BETWEEN $1 AND $2`;
    const p = [desde, hasta];

    const [v] = await this.ds.query(
      `SELECT count(*) FILTER (WHERE estado = 'COMPLETADA') AS facturas,
              count(*) FILTER (WHERE estado = 'ANULADA') AS anuladas,
              coalesce(sum(total_bs) FILTER (WHERE estado = 'COMPLETADA'), 0) AS total,
              coalesce(sum(iva_general_bs + iva_reducida_bs) FILTER (WHERE estado = 'COMPLETADA'), 0) AS iva,
              coalesce(sum(igtf_bs) FILTER (WHERE estado = 'COMPLETADA'), 0) AS igtf,
              coalesce(sum((base_exenta_bs + base_general_bs + base_reducida_bs) / tasa) FILTER (WHERE estado = 'COMPLETADA'), 0) AS venta_usd
         FROM ventas WHERE ${enPeriodo('creado_en')}`,
      p,
    );
    const [nc] = await this.ds.query(
      `SELECT coalesce(sum(n.total_bs), 0) AS total,
              coalesce(sum(n.iva_general_bs + n.iva_reducida_bs), 0) AS iva,
              coalesce(sum((n.base_exenta_bs + n.base_general_bs + n.base_reducida_bs) / v.tasa), 0) AS venta_usd
         FROM notas_credito n JOIN ventas v ON v.id = n.venta_id
        WHERE ${enPeriodo('n.creado_en')}`,
      p,
    );
    // Costo de lo vendido menos lo devuelto que volvió al inventario.
    const productos: Record<string, string>[] = await this.ds.query(
      `WITH vendidos AS (
         SELECT l.producto_id, l.codigo, l.descripcion,
                l.cantidad * l.factor AS cantidad_base,
                l.subtotal_bs / v.tasa AS venta_usd,
                l.cantidad * l.factor * l.costo_usd AS costo_usd,
                (l.costo_usd IS NULL)::int AS sin_costo
           FROM ventas_lineas l JOIN ventas v ON v.id = l.venta_id
          WHERE v.estado = 'COMPLETADA' AND ${enPeriodo('v.creado_en')}
         UNION ALL
         SELECT nl.producto_id, nl.codigo, nl.descripcion,
                -(nl.cantidad * nl.factor),
                -(nl.subtotal_bs / v.tasa),
                CASE WHEN n.devolver_inventario THEN -(nl.cantidad * nl.factor * vl.costo_usd) ELSE 0 END,
                (vl.costo_usd IS NULL)::int
           FROM notas_credito_lineas nl
           JOIN notas_credito n ON n.id = nl.nota_id
           JOIN ventas v ON v.id = n.venta_id
           JOIN ventas_lineas vl ON vl.id = nl.venta_linea_id
          WHERE ${enPeriodo('n.creado_en')})
       SELECT producto_id, max(codigo) AS codigo, max(descripcion) AS descripcion,
              sum(cantidad_base) AS cantidad_base, sum(venta_usd) AS venta_usd,
              sum(costo_usd) AS costo_usd, sum(sin_costo) AS sin_costo
         FROM vendidos GROUP BY producto_id
        ORDER BY sum(venta_usd) DESC`,
      p,
    );
    const porDia: Record<string, string>[] = await this.ds.query(
      `SELECT to_char(creado_en AT TIME ZONE '${ZONA_HORARIA}', 'YYYY-MM-DD') AS fecha, count(*) AS facturas,
              sum(total_bs) AS total, sum((base_exenta_bs + base_general_bs + base_reducida_bs) / tasa) AS venta_usd
         FROM ventas WHERE estado = 'COMPLETADA' AND ${enPeriodo('creado_en')}
        GROUP BY 1 ORDER BY 1`,
      p,
    );
    const porMetodo: Record<string, string>[] = await this.ds.query(
      `SELECT pg.metodo, sum(pg.monto) AS monto, sum(pg.monto_bs) AS monto_bs
         FROM ventas_pagos pg JOIN ventas v ON v.id = pg.venta_id
        WHERE v.estado = 'COMPLETADA' AND ${enPeriodo('v.creado_en')}
        GROUP BY pg.metodo ORDER BY sum(pg.monto_bs) DESC`,
      p,
    );
    const porCajero: Record<string, string>[] = await this.ds.query(
      `SELECT u.nombre AS usuario, count(*) AS facturas, sum(v.total_bs) AS total
         FROM ventas v JOIN usuarios u ON u.id = v.usuario_id
        WHERE v.estado = 'COMPLETADA' AND ${enPeriodo('v.creado_en')}
        GROUP BY u.nombre ORDER BY sum(v.total_bs) DESC`,
      p,
    );

    let ventaConCosto = dec(0);
    let costo = dec(0);
    let sinCosto = 0;
    for (const x of productos) {
      sinCosto += Number(x.sin_costo);
      if (Number(x.sin_costo) === 0) {
        ventaConCosto = ventaConCosto.plus(x.venta_usd);
        costo = costo.plus(x.costo_usd ?? 0);
      }
    }
    const ventaNeta = dec(v.venta_usd).minus(nc.venta_usd);
    const ganancia = ventaConCosto.minus(costo);
    const facturas = Number(v.facturas);
    return {
      desde,
      hasta,
      totales: {
        facturas,
        anuladas: Number(v.anuladas),
        totalBs: dec(v.total).minus(nc.total).toFixed(2),
        ventaNetaUsd: ventaNeta.toFixed(2),
        ivaBs: dec(v.iva).minus(nc.iva).toFixed(2),
        igtfBs: f2(v.igtf),
        notasCreditoBs: f2(nc.total),
        costoUsd: costo.toFixed(2),
        gananciaUsd: ganancia.toFixed(2),
        margenPorcentaje: ventaConCosto.gt(0) ? ganancia.div(ventaConCosto).times(100).toFixed(1) : null,
        ticketPromedioUsd: facturas ? dec(v.venta_usd).div(facturas).toFixed(2) : '0.00',
        lineasSinCosto: sinCosto,
      },
      porDia: porDia.map((d) => ({
        fecha: d.fecha,
        facturas: Number(d.facturas),
        totalBs: f2(d.total),
        ventaUsd: f2(d.venta_usd),
      })),
      porMetodo: porMetodo.map((m) => ({ metodo: m.metodo, monto: f2(m.monto), montoBs: f2(m.monto_bs) })),
      porCajero: porCajero.map((x) => ({ usuario: x.usuario, facturas: Number(x.facturas), totalBs: f2(x.total) })),
      productos: productos.slice(0, limite).map((x) => {
        const conCosto = Number(x.sin_costo) === 0;
        const ventaUsd = dec(x.venta_usd);
        const costoUsd: Dec | null = conCosto ? dec(x.costo_usd ?? 0) : null;
        return {
          productoId: Number(x.producto_id),
          codigo: x.codigo,
          descripcion: x.descripcion,
          cantidadBase: dec(x.cantidad_base).toFixed(3),
          ventaUsd: ventaUsd.toFixed(2),
          costoUsd: costoUsd?.toFixed(2) ?? null,
          gananciaUsd: costoUsd ? ventaUsd.minus(costoUsd).toFixed(2) : null,
        };
      }),
    };
  }
}
