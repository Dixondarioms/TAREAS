import { AlicuotaIva, UsuarioSesion } from './tipos';

export type MetodoPago = 'EFECTIVO_BS' | 'EFECTIVO_USD' | 'PAGO_MOVIL' | 'TRANSFERENCIA' | 'PUNTO_VENTA' | 'ZELLE' | 'BINANCE';

/** Igual que en la API (ventas/metodos-pago.ts). */
export const METODOS: Record<MetodoPago, { nombre: string; moneda: 'BS' | 'USD'; referencia: boolean; vuelto: boolean }> = {
  EFECTIVO_BS: { nombre: 'Efectivo Bs', moneda: 'BS', referencia: false, vuelto: true },
  EFECTIVO_USD: { nombre: 'Efectivo USD', moneda: 'USD', referencia: false, vuelto: true },
  PAGO_MOVIL: { nombre: 'Pago móvil', moneda: 'BS', referencia: true, vuelto: true },
  TRANSFERENCIA: { nombre: 'Transferencia', moneda: 'BS', referencia: true, vuelto: false },
  PUNTO_VENTA: { nombre: 'Punto de venta', moneda: 'BS', referencia: false, vuelto: false },
  ZELLE: { nombre: 'Zelle', moneda: 'USD', referencia: true, vuelto: false },
  BINANCE: { nombre: 'Binance (USDT)', moneda: 'USD', referencia: true, vuelto: false },
};

export const LISTA_METODOS = Object.keys(METODOS) as MetodoPago[];

/** «Bs 1.234,56» o «$ 12,00» según la moneda del método. */
export const simboloMoneda = (m: MetodoPago) => (METODOS[m].moneda === 'USD' ? '$' : 'Bs');

export interface Cliente {
  id: number;
  documento: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
}

export type TipoDocumento = 'FACTURA' | 'NOTA_CREDITO';

export interface Talonario {
  id: number;
  tipo: TipoDocumento;
  serie: string;
  numeroDesde: number;
  numeroHasta: number;
  controlPrefijo: string;
  controlDesde: number;
  digitos: number;
  siguiente: number;
  activo: boolean;
  restantes: number;
  creadoEn: string;
}

export interface EstadoFacturacion {
  proxima: { talonarioId: number; serie: string; numero: string; numeroControl: string } | null;
  restantes: number;
  pocas: boolean;
}

export interface FacturaAnulada {
  id: number;
  talonarioId: number;
  numero: number;
  numeroControl: string;
  motivo: string;
  usuario: { nombre: string } | null;
  creadoEn: string;
}

export interface Cotizacion {
  lineas: { precioUsd: string; precioBs: string; subtotalBs: string }[];
  detalle: { productoId: number; codigo: string; descripcion: string; unidad: string; cantidad: string }[];
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
  faltanteBs: string;
  vueltoBs: string;
  vueltoMonto: string;
  tasa: { valor: string; fechaValor: string };
  lista: { id: number; nombre: string };
  cobraIgtf: boolean;
}

export interface Venta {
  id: number;
  estado: 'COMPLETADA' | 'ANULADA';
  sesionId: number;
  usuario: UsuarioSesion;
  clienteDocumento: string | null;
  clienteNombre: string;
  clienteDireccion: string | null;
  serie: string;
  numeroFactura: number;
  numeroControl: string;
  talonario?: { digitos: number };
  tasa: string;
  baseExentaBs: string;
  baseGeneralBs: string;
  ivaGeneralBs: string;
  baseReducidaBs: string;
  ivaReducidaBs: string;
  porcentajeGeneral: string;
  porcentajeReducida: string;
  totalBs: string;
  baseIgtfBs: string;
  igtfBs: string;
  totalPagarBs: string;
  totalPagarUsd: string;
  vueltoMetodo: MetodoPago | null;
  vueltoMonto: string;
  vueltoBs: string;
  creadoEn: string;
  anuladaEn: string | null;
  anuladaPor: { nombre: string } | null;
  motivoAnulacion: string | null;
  lineas?: {
    id: number;
    codigo: string;
    descripcion: string;
    unidad: string;
    cantidad: string;
    alicuotaIva: AlicuotaIva;
    precioUsd: string;
    precioBs: string;
    subtotalBs: string;
  }[];
  pagos?: { id: number; metodo: MetodoPago; monto: string; montoBs: string; referencia: string | null }[];
}

export type MontosPorMetodo = Partial<Record<MetodoPago, string>>;

/** Respuesta de /caja/actual: el resumen, o { sesion: null } si el usuario no tiene caja abierta. */
export type CajaActual = ResumenCaja | { sesion: null };
export const cajaAbierta = (c: CajaActual | undefined): c is ResumenCaja => Boolean(c?.sesion);

export interface ResumenCaja {
  sesion: {
    id: number;
    estado: 'ABIERTA' | 'CERRADA';
    fondoBs: string;
    fondoUsd: string;
    abiertaEn: string;
    cerradaEn: string | null;
    contado: MontosPorMetodo | null;
    observaciones: string | null;
    usuario?: { nombre: string };
  };
  ventas: { cantidad: number; anuladas: number; totalBs: string; igtfBs: string };
  cobrado: MontosPorMetodo;
  vuelto: MontosPorMetodo;
  reintegros: MontosPorMetodo;
  movimientos: {
    id: number;
    tipo: 'RETIRO' | 'GASTO' | 'INGRESO';
    metodo: MetodoPago;
    monto: string;
    motivo: string;
    creadoEn: string;
  }[];
  esperado: MontosPorMetodo;
  diferencias: MontosPorMetodo | null;
}

export interface NotaCredito {
  id: number;
  serie: string;
  numero: number;
  numeroControl: string;
  talonario?: { digitos: number };
  motivo: string;
  devolverInventario: boolean;
  baseExentaBs: string;
  baseGeneralBs: string;
  ivaGeneralBs: string;
  baseReducidaBs: string;
  ivaReducidaBs: string;
  totalBs: string;
  reintegroMetodo: MetodoPago;
  reintegroMonto: string;
  creadoEn: string;
  usuario?: { nombre: string };
  lineas: {
    id: number;
    ventaLineaId: number;
    codigo: string;
    descripcion: string;
    unidad: string;
    cantidad: string;
    subtotalBs: string;
  }[];
}

/** Número de nota de crédito con ceros a la izquierda y serie. */
export function numeroNota(n: Pick<NotaCredito, 'serie' | 'numero'> & { talonario?: { digitos: number } }): string {
  const s = String(n.numero).padStart(n.talonario?.digitos ?? 6, '0');
  return n.serie ? `${n.serie}-${s}` : s;
}

/** Número de factura con ceros a la izquierda y serie: «A-000123». */
export function numeroFactura(v: Pick<Venta, 'serie' | 'numeroFactura'> & { talonario?: { digitos: number } }): string {
  const n = String(v.numeroFactura).padStart(v.talonario?.digitos ?? 6, '0');
  return v.serie ? `${v.serie}-${n}` : n;
}
