export type Rol = 'ADMIN' | 'GERENTE' | 'ALMACEN' | 'CAJERO';
export type AlicuotaIva = 'GENERAL' | 'REDUCIDA' | 'EXENTO';
export type ModoPrecio = 'MARGEN' | 'FIJO';
export type Moneda = 'USD' | 'EUR';

export interface UsuarioSesion {
  id: number;
  usuario: string;
  nombre: string;
  rol: Rol;
}

export interface Usuario extends UsuarioSesion {
  activo: boolean;
  ultimoAcceso: string | null;
  creadoEn: string;
}

export interface Pagina<T> {
  datos: T[];
  total: number;
  pagina: number;
  porPagina: number;
}

export interface Unidad {
  id: number;
  codigo: string;
  nombre: string;
  permiteDecimales: boolean;
}

export interface Categoria {
  id: number;
  nombre: string;
  padreId: number | null;
  ruta: string;
}

export interface Marca {
  id: number;
  nombre: string;
}

export interface ListaPrecio {
  id: number;
  codigo: string;
  nombre: string;
  margenPorDefecto: string;
  orden: number;
  activa: boolean;
}

export interface VistaPrecio {
  precioUsd: string;
  precioUsdConIva: string;
  precioBs: string | null;
  precioBsConIva: string | null;
}

export interface ProductoListado {
  id: number;
  codigo: string;
  descripcion: string;
  marca: string | null;
  categoria: string | null;
  unidad: string;
  alicuotaIva: AlicuotaIva;
  ubicacion: string | null;
  activo: boolean;
  existencia: string;
  stockMinimo: string;
  costoUsd?: string;
  precio: (VistaPrecio & { listaId: number; margen?: string | null; modo?: ModoPrecio }) | null;
}

export type TipoMovimiento = 'ENTRADA' | 'SALIDA' | 'MERMA' | 'CONTEO' | 'COMPRA' | 'VENTA' | 'DEVOLUCION';

export interface MovimientoInventario {
  id: number;
  tipo: TipoMovimiento;
  cantidad: string;
  existenciaResultante: string;
  costoUsd?: string;
  motivo: string;
  referencia: string | null;
  usuario: string | null;
  creadoEn: string;
}

export interface ResumenInventario {
  productosActivos: number;
  bajoMinimo: number;
  sinExistencia: number;
  valorUsd?: string;
}

export interface ResultadoConteo {
  referencia: string;
  ajustados: number;
  lineas: { productoId: number; codigo: string; descripcion: string; anterior: string; contado: string; diferencia: string }[];
}

export interface ResultadoBusqueda extends Pagina<ProductoListado> {
  busquedaAproximada: boolean;
  lista: Pick<ListaPrecio, 'id' | 'codigo' | 'nombre'>;
  tasa: { valor: string; fechaValor: string } | null;
}

export interface ProductoDetalle {
  id: number;
  codigo: string;
  descripcion: string;
  categoria: { id: number; nombre: string } | null;
  marca: { id: number; nombre: string } | null;
  unidadBase: Unidad;
  alicuotaIva: AlicuotaIva;
  porcentajeIva: string;
  existencia: string;
  stockMinimo: string;
  stockMaximo: string | null;
  ubicacion: string | null;
  notas: string | null;
  activo: boolean;
  costoUsd?: string;
  costoActualizadoEn?: string | null;
  codigosBarras: string[];
  precios: (VistaPrecio & { lista: Pick<ListaPrecio, 'id' | 'codigo' | 'nombre'>; modo?: ModoPrecio; margen?: string | null })[];
  presentaciones: {
    id: number;
    unidad: Unidad;
    factor: string;
    codigosBarras: string[];
    precios: (VistaPrecio & { listaId: number })[];
  }[];
  proveedores: {
    proveedor: { id: number; rif: string; razonSocial: string };
    codigoProveedor: string | null;
    costoUsd: string | null;
  }[];
  tasa: string | null;
  creadoEn: string;
  actualizadoEn: string;
}

export interface HistorialCosto {
  id: number;
  costoAnterior: string;
  costoNuevo: string;
  motivo: string;
  creadoEn: string;
  usuario: { nombre: string } | null;
}

export interface Proveedor {
  id: number;
  rif: string;
  razonSocial: string;
  contacto: string | null;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  notas: string | null;
  activo: boolean;
}

export interface TasaCambio {
  id: number;
  moneda: Moneda;
  valor: string;
  fechaValor: string;
  fuente: 'BCV' | 'MANUAL';
  creadoEn: string;
  creadoPor?: { nombre: string } | null;
}

export interface EstadoMoneda {
  vigente: TasaCambio | null;
  diasDesdeFechaValor: number | null;
  proxima: TasaCambio | null;
}

export interface EstadoTasas {
  hoy: string;
  USD: EstadoMoneda;
  EUR: EstadoMoneda;
}

export interface Configuracion {
  empresa: {
    razonSocial: string;
    rif: string;
    direccion: string;
    telefono: string;
    contribuyenteEspecial: boolean;
  };
  redondeoBs: { multiplo: string; modo: 'CERCANO' | 'ARRIBA' };
  alicuotasIva: Record<AlicuotaIva, string>;
}

export interface ResultadoImportacion {
  simulado: boolean;
  filasLeidas: number;
  creados: number;
  actualizados: number;
  categoriasCreadas: number;
  marcasCreadas: number;
  errores: { fila: number; codigo?: string; mensaje: string }[];
}

export interface ResultadoAjuste {
  simulado: boolean;
  productosAfectados: number;
  listaMuestra: Pick<ListaPrecio, 'id' | 'codigo' | 'nombre'> | null;
  muestra: {
    productoId: number;
    codigo: string;
    descripcion: string;
    costoAnterior: string;
    costoNuevo: string;
    precioAnterior: string | null;
    precioNuevo: string | null;
  }[];
}
