export type TipoDocumentoCompra = 'FACTURA' | 'NOTA_CREDITO' | 'NOTA_DEBITO';

export const NOMBRE_DOCUMENTO: Record<string, string> = {
  FACTURA: 'Factura',
  NOTA_CREDITO: 'Nota de crédito',
  NOTA_DEBITO: 'Nota de débito',
};

interface MontosLibro {
  totalBs: string;
  exentoBs: string;
  baseGeneralBs: string;
  ivaGeneralBs: string;
  baseReducidaBs: string;
  ivaReducidaBs: string;
}

export interface FilaLibroVentas extends MontosLibro {
  fecha: string;
  documento: 'FACTURA' | 'NOTA_CREDITO' | 'NOTA_DEBITO';
  numero: string;
  numeroControl: string;
  facturaAfectada: string | null;
  tipoTransaccion: '01-REG' | '03-ANU';
  rif: string | null;
  nombre: string;
  igtfBs: string;
  ivaRetenidoBs: string;
  comprobanteRetencion: string | null;
}

export interface FilaLibroCompras extends MontosLibro {
  id: number;
  fecha: string;
  documento: TipoDocumentoCompra;
  numero: string;
  numeroControl: string;
  facturaAfectada: string | null;
  rif: string;
  nombre: string;
  ivaRetenidoBs: string;
  numeroComprobante: string | null;
}

export interface Libro<F> {
  mes: string;
  filas: F[];
  totales: Record<string, string>;
}

export interface ComprobanteRetencion {
  agente: { razonSocial: string; rif: string; direccion: string; telefono: string };
  periodo: string;
  factura: {
    id: number;
    tipo: TipoDocumentoCompra;
    fecha: string;
    numero: string;
    numeroControl: string;
    facturaAfectada: string | null;
    proveedor: { rif: string; razonSocial: string; direccion: string | null };
    totalBs: string;
    baseExentaBs: string;
    baseGeneralBs: string;
    ivaGeneralBs: string;
    baseReducidaBs: string;
    ivaReducidaBs: string;
    porcentajeRetencion: string;
    ivaRetenidoBs: string;
    numeroComprobante: string;
    fechaComprobante: string;
  };
}

export interface ResumenIva {
  mes: string;
  debitoFiscalBs: string;
  creditoFiscalBs: string;
  ivaRetenidoBs: string;
  retencionesRecibidasBs: string;
  diferenciaBs: string;
  igtfPercibidoBs: string;
}
