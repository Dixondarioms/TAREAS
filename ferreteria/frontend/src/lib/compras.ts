import { AlicuotaIva } from './tipos';
import { MetodoPago } from './ventas';

export type MonedaCompra = 'BS' | 'USD';

export interface Compra {
  id: number;
  proveedor: { id: number; rif: string; razonSocial: string };
  fecha: string;
  numero: string;
  numeroControl: string | null;
  moneda: MonedaCompra;
  tasa: string;
  subtotal: string;
  iva: string;
  total: string;
  condicion: 'CONTADO' | 'CREDITO';
  vencimiento: string | null;
  retencionIva: string;
  saldo: string;
  actualizoCostos: boolean;
  estado: 'REGISTRADA' | 'ANULADA';
  anuladaEn: string | null;
  motivoAnulacion: string | null;
  ordenId: number | null;
  facturaCompraId: number | null;
  notas: string | null;
  usuario?: { nombre: string };
  creadoEn: string;
  lineas?: {
    id: number;
    codigo: string;
    descripcion: string;
    unidad: string;
    cantidad: string;
    costoUnitario: string;
    alicuotaIva: AlicuotaIva;
    subtotal: string;
  }[];
  pagos?: {
    id: number;
    fecha: string;
    metodo: MetodoPago;
    monto: string;
    referencia: string | null;
    usuario?: { nombre: string };
  }[];
}

export interface CuentaPorPagar {
  id: number;
  proveedor: { id: number; rif: string; razonSocial: string };
  fecha: string;
  numero: string;
  moneda: MonedaCompra;
  total: string;
  saldo: string;
  vencimiento: string;
  diasVencida: number;
}

export interface ResumenPorPagar {
  cuentas: CuentaPorPagar[];
  totales: { moneda: MonedaCompra; saldo: string; vencido: string }[];
}

export const simbolo = (m: MonedaCompra) => (m === 'USD' ? '$' : 'Bs');

export type EstadoOrden = 'PENDIENTE' | 'PARCIAL' | 'RECIBIDA' | 'CANCELADA';

export const ESTADOS_ORDEN: Record<EstadoOrden, { texto: string; color: 'gris' | 'verde' | 'ambar' | 'rojo' | 'azul' }> = {
  PENDIENTE: { texto: 'Pendiente', color: 'azul' },
  PARCIAL: { texto: 'Recibida en parte', color: 'ambar' },
  RECIBIDA: { texto: 'Recibida', color: 'verde' },
  CANCELADA: { texto: 'Cancelada', color: 'gris' },
};

export interface LineaOrden {
  id: number;
  productoId: number;
  codigo: string;
  descripcion: string;
  presentacionId: number | null;
  unidad: string;
  factor: string;
  cantidad: string;
  cantidadRecibida: string;
  costoUnitario: string;
}

export interface OrdenCompra {
  id: number;
  proveedor: { id: number; rif: string; razonSocial: string; telefono?: string | null };
  proveedorId: number;
  fecha: string;
  moneda: MonedaCompra;
  estado: EstadoOrden;
  subtotal: string;
  notas: string | null;
  usuario?: { nombre: string };
  creadoEn: string;
  lineas?: LineaOrden[];
  compras?: {
    id: number;
    fecha: string;
    numero: string;
    estado: 'REGISTRADA' | 'ANULADA';
    total: string;
    moneda: MonedaCompra;
  }[];
}

export interface LineaSugerida {
  productoId: number;
  codigo: string;
  descripcion: string;
  unidad: string;
  existencia: string;
  stockMinimo: string;
  stockMaximo: string | null;
  enCamino: string;
  cantidad: string;
  costoUnitario: string;
}
