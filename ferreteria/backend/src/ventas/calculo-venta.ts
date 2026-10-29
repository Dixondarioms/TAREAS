import { AlicuotaIva } from '../catalogo/entidades/producto.entity';
import { dec, Dec, DECIMALES_BS, DECIMALES_USD, montoIva, redondear } from '../comun/dinero';
import { AlicuotasIva } from '../configuracion/configuracion.service';
import { MetodoPago, METODOS_PAGO, PORCENTAJE_IGTF } from './metodos-pago';

export interface LineaACalcular {
  /** Precio unitario sin IVA en USD, ya multiplicado por el factor de la presentación. */
  precioUsd: string;
  cantidad: string;
  alicuotaIva: AlicuotaIva;
}

export interface PagoACalcular {
  metodo: MetodoPago;
  /** En la moneda del método. */
  monto: string;
}

export interface ContextoVenta {
  /** Bs por USD. */
  tasa: string;
  alicuotas: AlicuotasIva;
  /** Si es contribuyente especial cobra IGTF sobre lo pagado en divisas. */
  cobraIgtf: boolean;
}

export interface VentaCalculada {
  lineas: { precioUsd: string; precioBs: string; subtotalBs: string }[];
  baseExentaBs: string;
  baseGeneralBs: string;
  ivaGeneralBs: string;
  baseReducidaBs: string;
  ivaReducidaBs: string;
  totalBs: string;
  pagos: { metodo: MetodoPago; monto: string; montoBs: string }[];
  pagadoBs: string;
  baseIgtfBs: string;
  igtfBs: string;
  totalPagarBs: string;
  totalPagarUsd: string;
  /** Positivo si falta dinero. */
  faltanteBs: string;
  /** Excedente que se devuelve al cliente, en Bs. */
  vueltoBs: string;
  /** Vuelto expresado en la moneda del método elegido. */
  vueltoMonto: string;
}

const b2 = (v: Dec) => redondear(v, DECIMALES_BS);

/** Equivalente en Bs de un monto en la moneda del método. */
export function aBolivares(metodo: MetodoPago, monto: string, tasa: string): Dec {
  return METODOS_PAGO[metodo].moneda === 'USD' ? b2(dec(monto).times(tasa)) : b2(dec(monto));
}

/**
 * Calcula la factura en bolívares y cuadra los pagos.
 *
 * - Cada línea: precio en Bs = precio USD × tasa (2 decimales); subtotal = precio Bs × cantidad.
 * - IVA por alícuota sobre la suma de bases, redondeado a céntimos.
 * - IGTF (solo contribuyente especial): 3 % de la parte del total pagada en
 *   divisas, sin contar el vuelto que se entregue en divisas. No se cobra
 *   IGTF sobre el propio IGTF: la base nunca supera el total de la factura.
 */
export function calcularVenta(
  lineas: LineaACalcular[],
  pagos: PagoACalcular[],
  ctx: ContextoVenta,
  metodoVuelto: MetodoPago | null = null,
): VentaCalculada {
  const bases: Record<AlicuotaIva, Dec> = { EXENTO: dec(0), GENERAL: dec(0), REDUCIDA: dec(0) };
  const lineasCalculadas = lineas.map((l) => {
    const precioUsd = redondear(l.precioUsd, DECIMALES_USD);
    const precioBs = b2(precioUsd.times(ctx.tasa));
    const subtotalBs = b2(precioBs.times(l.cantidad));
    bases[l.alicuotaIva] = bases[l.alicuotaIva].plus(subtotalBs);
    return { precioUsd: precioUsd.toFixed(DECIMALES_USD), precioBs: precioBs.toFixed(2), subtotalBs: subtotalBs.toFixed(2) };
  });
  const ivaGeneral = b2(montoIva(bases.GENERAL, ctx.alicuotas.GENERAL));
  const ivaReducida = b2(montoIva(bases.REDUCIDA, ctx.alicuotas.REDUCIDA));
  const total = bases.EXENTO.plus(bases.GENERAL).plus(ivaGeneral).plus(bases.REDUCIDA).plus(ivaReducida);

  const pagosCalculados = pagos.map((p) => ({
    metodo: p.metodo,
    monto: b2(dec(p.monto)).toFixed(2),
    montoBs: aBolivares(p.metodo, p.monto, ctx.tasa),
  }));
  const pagado = pagosCalculados.reduce((s, p) => s.plus(p.montoBs), dec(0));
  const enDivisas = pagosCalculados
    .filter((p) => METODOS_PAGO[p.metodo].moneda === 'USD')
    .reduce((s, p) => s.plus(p.montoBs), dec(0));
  const vueltoEnDivisas = metodoVuelto !== null && METODOS_PAGO[metodoVuelto].moneda === 'USD';

  // El vuelto en divisas reduce la base del IGTF y el IGTF cambia el vuelto:
  // se repite hasta que ambos se estabilizan (dos o tres vueltas a lo sumo).
  let igtf = dec(0);
  let base = dec(0);
  for (let i = 0; i < 5; i++) {
    const excedente = Dec.max(0, pagado.minus(total).minus(igtf));
    const divisasNetas = vueltoEnDivisas ? Dec.max(0, enDivisas.minus(excedente)) : enDivisas;
    base = ctx.cobraIgtf ? Dec.min(total, divisasNetas) : dec(0);
    const nuevo = b2(base.times(PORCENTAJE_IGTF).div(100));
    if (nuevo.eq(igtf)) break;
    igtf = nuevo;
  }
  const totalPagar = total.plus(igtf);
  const diferencia = pagado.minus(totalPagar);
  const vuelto = Dec.max(0, diferencia);
  const vueltoMonto = metodoVuelto && METODOS_PAGO[metodoVuelto].moneda === 'USD' ? b2(vuelto.div(ctx.tasa)) : vuelto;

  return {
    lineas: lineasCalculadas,
    baseExentaBs: bases.EXENTO.toFixed(2),
    baseGeneralBs: bases.GENERAL.toFixed(2),
    ivaGeneralBs: ivaGeneral.toFixed(2),
    baseReducidaBs: bases.REDUCIDA.toFixed(2),
    ivaReducidaBs: ivaReducida.toFixed(2),
    totalBs: total.toFixed(2),
    pagos: pagosCalculados.map((p) => ({ ...p, montoBs: p.montoBs.toFixed(2) })),
    pagadoBs: pagado.toFixed(2),
    baseIgtfBs: base.toFixed(2),
    igtfBs: igtf.toFixed(2),
    totalPagarBs: totalPagar.toFixed(2),
    totalPagarUsd: b2(totalPagar.div(ctx.tasa)).toFixed(2),
    faltanteBs: Dec.max(0, diferencia.negated()).toFixed(2),
    vueltoBs: vuelto.toFixed(2),
    vueltoMonto: vueltoMonto.toFixed(2),
  };
}
