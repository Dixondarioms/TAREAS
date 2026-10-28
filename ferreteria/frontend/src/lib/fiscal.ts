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
  documento: 'FACTURA' | 'NOTA_CREDITO';
  numero: string;
  numeroControl: string;
  facturaAfectada: string | null;
  tipoTransaccion: '01-REG' | '03-ANU';
  rif: string | null;
  nombre: string;
  igtfBs: string;
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
}

export interface Libro<F> {
  mes: string;
  filas: F[];
  totales: Record<string, string>;
}

export interface ResumenIva {
  mes: string;
  debitoFiscalBs: string;
  creditoFiscalBs: string;
  ivaRetenidoBs: string;
  diferenciaBs: string;
  igtfPercibidoBs: string;
}
