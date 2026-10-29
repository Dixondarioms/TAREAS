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
  saldo: string;
  actualizoCostos: boolean;
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
