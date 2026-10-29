import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { dec, DECIMALES_BS, redondear } from '../comun/dinero';
import { hoyEnCaracas } from '../comun/fechas';
import { FacturaCompra } from './factura-compra.entity';

/** Porcentajes de retención de IVA (Providencia SNAT/2015/0049): 75 % general, 100 % en los casos especiales. */
export const PORCENTAJES_RETENCION = [75, 100] as const;
export type PorcentajeRetencion = (typeof PORCENTAJES_RETENCION)[number];

/**
 * Si la ferretería es agente de retención, calcula el IVA retenido al
 * proveedor y asigna el número de comprobante: AAAAMM + 8 dígitos
 * consecutivos dentro del mes en que se emite. Debe llamarse dentro de una
 * transacción, antes de guardar la factura.
 */
export async function retenerIva(
  m: EntityManager,
  factura: FacturaCompra,
  agente: boolean,
  porcentaje: PorcentajeRetencion = 75,
): Promise<void> {
  const iva = dec(factura.ivaGeneralBs).plus(factura.ivaReducidaBs);
  if (!agente || iva.lte(0)) {
    factura.porcentajeRetencion = '0.00';
    factura.ivaRetenidoBs = '0.00';
    factura.numeroComprobante = null;
    factura.fechaComprobante = null;
    return;
  }
  if (!PORCENTAJES_RETENCION.includes(porcentaje)) throw new BadRequestException('El porcentaje de retención debe ser 75 o 100');
  const fecha = hoyEnCaracas();
  const periodo = fecha.slice(0, 7).replace('-', '');
  // Un solo correlativo para toda la empresa: dos registros simultáneos no pueden tomar el mismo número.
  await m.query(`SELECT pg_advisory_xact_lock(hashtext('comprobantes_retencion_iva'))`);
  const [{ ultimo }] = await m.query(
    `SELECT max(numero_comprobante) AS ultimo FROM facturas_compra WHERE numero_comprobante LIKE $1`,
    [`${periodo}%`],
  );
  const siguiente = ultimo ? Number(String(ultimo).slice(6)) + 1 : 1;
  factura.porcentajeRetencion = dec(porcentaje).toFixed(2);
  factura.ivaRetenidoBs = redondear(iva.times(porcentaje).div(100), DECIMALES_BS).toFixed(2);
  factura.numeroComprobante = `${periodo}${String(siguiente).padStart(8, '0')}`;
  factura.fechaComprobante = fecha;
}
