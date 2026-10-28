import Decimal from 'decimal.js';

/**
 * Aritmética decimal exacta para montos, tasas y cantidades.
 * Nunca se usa `number` (coma flotante) para dinero: los valores viajan como
 * cadenas ("12.5000") entre la base de datos, la API y el frontend.
 */
export const Dec = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type Dec = Decimal;
export type Decimalizable = string | number | Decimal;

export const DECIMALES_USD = 4;
export const DECIMALES_BS = 2;
export const DECIMALES_TASA = 8;

export function dec(valor: Decimalizable): Decimal {
  return new Dec(valor);
}

export function esDecimalValido(valor: unknown): boolean {
  if (typeof valor !== 'string' && typeof valor !== 'number') return false;
  try {
    const d = new Dec(valor);
    return d.isFinite();
  } catch {
    return false;
  }
}

/** Redondeo "comercial" (mitad hacia arriba) a N decimales. */
export function redondear(valor: Decimalizable, decimales: number): Decimal {
  return dec(valor).toDecimalPlaces(decimales, Decimal.ROUND_HALF_UP);
}

export function aTexto(valor: Decimalizable, decimales: number): string {
  return redondear(valor, decimales).toFixed(decimales);
}

/** precio = costo × (1 + margen/100) */
export function precioDesdeMargen(costo: Decimalizable, margenPorcentaje: Decimalizable): Decimal {
  return dec(costo).times(dec(1).plus(dec(margenPorcentaje).div(100)));
}

/** margen % = (precio / costo − 1) × 100. Sin costo no hay margen calculable. */
export function margenDesdePrecio(costo: Decimalizable, precio: Decimalizable): Decimal | null {
  const c = dec(costo);
  if (c.isZero()) return null;
  return dec(precio).div(c).minus(1).times(100);
}

export function aplicarPorcentaje(valor: Decimalizable, porcentaje: Decimalizable): Decimal {
  return dec(valor).times(dec(1).plus(dec(porcentaje).div(100)));
}

export function montoIva(base: Decimalizable, alicuotaPorcentaje: Decimalizable): Decimal {
  return dec(base).times(dec(alicuotaPorcentaje)).div(100);
}

export function conIva(base: Decimalizable, alicuotaPorcentaje: Decimalizable): Decimal {
  return dec(base).plus(montoIva(base, alicuotaPorcentaje));
}

export type ModoRedondeo = 'CERCANO' | 'ARRIBA';

/**
 * Redondea a un múltiplo (p. ej. 0.01, 0.50, 1, 10). Útil para precios en
 * bolívares de etiqueta, donde el negocio puede preferir cifras "redondas".
 */
export function redondearAMultiplo(valor: Decimalizable, multiplo: Decimalizable, modo: ModoRedondeo = 'CERCANO'): Decimal {
  const m = dec(multiplo);
  if (m.lte(0)) throw new Error('El múltiplo de redondeo debe ser mayor que cero');
  const cociente = dec(valor).div(m);
  const entero =
    modo === 'ARRIBA' ? cociente.toDecimalPlaces(0, Decimal.ROUND_CEIL) : cociente.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  return entero.times(m);
}

/** Convierte un monto en divisa a bolívares usando la tasa indicada. */
export function convertirABs(montoDivisa: Decimalizable, tasa: Decimalizable): Decimal {
  return dec(montoDivisa).times(dec(tasa));
}
