export enum MetodoPago {
  EFECTIVO_BS = 'EFECTIVO_BS',
  EFECTIVO_USD = 'EFECTIVO_USD',
  PAGO_MOVIL = 'PAGO_MOVIL',
  TRANSFERENCIA = 'TRANSFERENCIA',
  PUNTO_VENTA = 'PUNTO_VENTA',
  ZELLE = 'ZELLE',
  BINANCE = 'BINANCE',
}

export type MonedaPago = 'BS' | 'USD';

export interface DefinicionMetodo {
  nombre: string;
  moneda: MonedaPago;
  /** Exige número de referencia (pagos electrónicos). */
  referencia: boolean;
  /** Puede usarse para dar vuelto. */
  vuelto: boolean;
}

export const METODOS_PAGO: Record<MetodoPago, DefinicionMetodo> = {
  [MetodoPago.EFECTIVO_BS]: { nombre: 'Efectivo Bs', moneda: 'BS', referencia: false, vuelto: true },
  [MetodoPago.EFECTIVO_USD]: { nombre: 'Efectivo USD', moneda: 'USD', referencia: false, vuelto: true },
  [MetodoPago.PAGO_MOVIL]: { nombre: 'Pago móvil', moneda: 'BS', referencia: true, vuelto: true },
  [MetodoPago.TRANSFERENCIA]: { nombre: 'Transferencia', moneda: 'BS', referencia: true, vuelto: false },
  [MetodoPago.PUNTO_VENTA]: { nombre: 'Punto de venta', moneda: 'BS', referencia: false, vuelto: false },
  [MetodoPago.ZELLE]: { nombre: 'Zelle', moneda: 'USD', referencia: true, vuelto: false },
  [MetodoPago.BINANCE]: { nombre: 'Binance (USDT)', moneda: 'USD', referencia: true, vuelto: false },
};

/** Métodos en efectivo: los únicos que admiten retiros, gastos e ingresos de caja. */
export const METODOS_EFECTIVO = [MetodoPago.EFECTIVO_BS, MetodoPago.EFECTIVO_USD] as const;

/** IGTF sobre pagos en divisas cuando la empresa es contribuyente especial (Ley del IGTF, 3 %). */
export const PORCENTAJE_IGTF = '3';
