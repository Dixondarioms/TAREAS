export enum MetodoPago {
  EFECTIVO_BS = 'EFECTIVO_BS',
  EFECTIVO_USD = 'EFECTIVO_USD',
  PAGO_MOVIL = 'PAGO_MOVIL',
  TRANSFERENCIA = 'TRANSFERENCIA',
  PUNTO_VENTA = 'PUNTO_VENTA',
  ZELLE = 'ZELLE',
  BINANCE = 'BINANCE',
  /** Venta fiada: queda como cuenta por cobrar del cliente, en USD. */
  CREDITO = 'CREDITO',
  /** El cliente es agente de retención: paga el IVA retenido con su comprobante. */
  RETENCION_IVA = 'RETENCION_IVA',
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
  [MetodoPago.CREDITO]: { nombre: 'Crédito (fiado)', moneda: 'BS', referencia: false, vuelto: false },
  [MetodoPago.RETENCION_IVA]: { nombre: 'Retención de IVA', moneda: 'BS', referencia: true, vuelto: false },
};

/** No mueven dinero en la caja: no cuentan en lo esperado ni en el arqueo. */
export const METODOS_FUERA_DE_CAJA: MetodoPago[] = [MetodoPago.CREDITO, MetodoPago.RETENCION_IVA];

/** Métodos en efectivo: los únicos que admiten retiros, gastos e ingresos de caja. */
export const METODOS_EFECTIVO = [MetodoPago.EFECTIVO_BS, MetodoPago.EFECTIVO_USD] as const;

/** IGTF sobre pagos en divisas cuando la empresa es contribuyente especial (Ley del IGTF, 3 %). */
export const PORCENTAJE_IGTF = '3';
