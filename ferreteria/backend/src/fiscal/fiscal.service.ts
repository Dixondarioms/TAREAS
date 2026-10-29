import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import ExcelJS from 'exceljs';
import { DataSource } from 'typeorm';
import { UsuarioSesion } from '../comun/decoradores';
import { dec, Dec, montoIva } from '../comun/dinero';
import { ZONA_HORARIA } from '../comun/fechas';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { Proveedor } from '../proveedores/proveedor.entity';
import { FacturaCompra, TipoDocumentoCompra } from './factura-compra.entity';
import { CrearFacturaCompraDto } from './fiscal.dto';
import { retenerIva } from './retenciones';

/** Tolerancia al comparar el IVA escrito con el calculado (redondeos por renglón en la factura del proveedor). */
const TOLERANCIA_IVA = dec('1.00');

export type TipoTransaccion = '01-REG' | '03-ANU';

export interface FilaLibroVentas {
  fecha: string;
  documento: 'FACTURA' | 'NOTA_CREDITO' | 'NOTA_DEBITO';
  numero: string;
  numeroControl: string;
  facturaAfectada: string | null;
  tipoTransaccion: TipoTransaccion;
  rif: string | null;
  nombre: string;
  totalBs: string;
  exentoBs: string;
  baseGeneralBs: string;
  ivaGeneralBs: string;
  baseReducidaBs: string;
  ivaReducidaBs: string;
  igtfBs: string;
  /** IVA que retuvo el comprador (agente de retención) y su comprobante. */
  ivaRetenidoBs: string;
  comprobanteRetencion: string | null;
}

export interface FilaLibroCompras {
  /** Id de la factura de compra (para corregir el registro). */
  id: number;
  fecha: string;
  documento: TipoDocumentoCompra;
  numero: string;
  numeroControl: string;
  facturaAfectada: string | null;
  rif: string;
  nombre: string;
  totalBs: string;
  exentoBs: string;
  baseGeneralBs: string;
  ivaGeneralBs: string;
  baseReducidaBs: string;
  ivaReducidaBs: string;
  ivaRetenidoBs: string;
  numeroComprobante: string | null;
}

type Montos = Pick<
  FilaLibroVentas,
  'totalBs' | 'exentoBs' | 'baseGeneralBs' | 'ivaGeneralBs' | 'baseReducidaBs' | 'ivaReducidaBs'
>;
const CAMPOS_MONTO = ['totalBs', 'exentoBs', 'baseGeneralBs', 'ivaGeneralBs', 'baseReducidaBs', 'ivaReducidaBs'] as const;

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
  /** IVA que le retuvieron sus clientes agentes de retención: se descuenta de la cuota. */
  retencionesRecibidasBs: string;
  /** Débito − crédito − retenciones recibidas: positivo = a pagar; negativo = excedente para el mes siguiente. */
  diferenciaBs: string;
  igtfPercibidoBs: string;
}

const pad = (n: number, d: number) => String(n).padStart(d, '0');

function rango(mes: string): { desde: string; hasta: string } {
  const [a, m] = mes.split('-').map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { desde: `${mes}-01`, hasta: `${mes}-${pad(ultimo, 2)}` };
}

/** Suma las columnas de monto de las filas. */
function totalizar(filas: object[], campos: readonly string[]): Record<string, string> {
  const t: Record<string, Dec> = Object.fromEntries(campos.map((c) => [c, dec(0)]));
  for (const f of filas) for (const c of campos) t[c] = t[c].plus(dec(((f as Record<string, unknown>)[c] as string) ?? '0'));
  return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v.toFixed(2)]));
}

const negar = (v: string) => dec(v).negated().toFixed(2);
const cero: Montos = {
  totalBs: '0.00',
  exentoBs: '0.00',
  baseGeneralBs: '0.00',
  ivaGeneralBs: '0.00',
  baseReducidaBs: '0.00',
  ivaReducidaBs: '0.00',
};

@Injectable()
export class FiscalService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly configuracion: ConfiguracionService,
  ) {}

  // ------------------------------------------------------------------ facturas de compra

  async crearCompra(dto: CrearFacturaCompraDto, usuario: UsuarioSesion): Promise<FacturaCompra> {
    const proveedor = await this.ds.getRepository(Proveedor).findOneBy({ id: dto.proveedorId });
    if (!proveedor) throw new NotFoundException('Proveedor no encontrado');
    const tipo = dto.tipo ?? TipoDocumentoCompra.FACTURA;
    if (tipo !== TipoDocumentoCompra.FACTURA && !dto.facturaAfectada?.trim()) {
      throw new BadRequestException('Indique el número de la factura que modifica la nota');
    }
    const { alicuotasIva, empresa } = await this.configuracion.obtenerTodo();
    const montos = {
      baseExentaBs: dec(dto.baseExentaBs ?? '0'),
      baseGeneralBs: dec(dto.baseGeneralBs ?? '0'),
      ivaGeneralBs: dec(dto.ivaGeneralBs ?? '0'),
      baseReducidaBs: dec(dto.baseReducidaBs ?? '0'),
      ivaReducidaBs: dec(dto.ivaReducidaBs ?? '0'),
    };
    for (const [base, iva, pct, nombre] of [
      [montos.baseGeneralBs, montos.ivaGeneralBs, alicuotasIva.GENERAL, 'general'],
      [montos.baseReducidaBs, montos.ivaReducidaBs, alicuotasIva.REDUCIDA, 'reducida'],
    ] as const) {
      const esperado = montoIva(base, pct);
      if (esperado.minus(iva).abs().gt(TOLERANCIA_IVA)) {
        throw new BadRequestException(
          `El IVA ${nombre} (${iva.toFixed(2)}) no corresponde al ${pct} % de la base (${esperado.toFixed(2)}). Revise los montos.`,
        );
      }
    }
    const total = Object.values(montos).reduce((s, v) => s.plus(v), dec(0));
    if (total.lte(0)) throw new BadRequestException('La factura no tiene montos');
    const numero = dto.numero.trim();
    const repo = this.ds.getRepository(FacturaCompra);
    if (await repo.existsBy({ proveedorId: proveedor.id, tipo, numero })) {
      throw new ConflictException(
        `Ya está registrada la ${tipo === 'FACTURA' ? 'factura' : 'nota'} ${numero} de ${proveedor.razonSocial}`,
      );
    }
    return this.ds.transaction(async (m) => {
      const factura = m.create(FacturaCompra, {
        proveedorId: proveedor.id,
        tipo,
        fecha: dto.fecha,
        numero,
        numeroControl: dto.numeroControl.trim(),
        facturaAfectada: dto.facturaAfectada?.trim() || null,
        baseExentaBs: montos.baseExentaBs.toFixed(2),
        baseGeneralBs: montos.baseGeneralBs.toFixed(2),
        ivaGeneralBs: montos.ivaGeneralBs.toFixed(2),
        baseReducidaBs: montos.baseReducidaBs.toFixed(2),
        ivaReducidaBs: montos.ivaReducidaBs.toFixed(2),
        totalBs: total.toFixed(2),
        notas: dto.notas?.trim() || null,
        usuarioId: usuario.id,
      });
      await retenerIva(m, factura, empresa.contribuyenteEspecial, dto.porcentajeRetencion ?? 75);
      return m.save(factura);
    });
  }

  async eliminarCompra(id: number): Promise<void> {
    const factura = await this.ds.getRepository(FacturaCompra).findOneBy({ id });
    if (!factura) throw new NotFoundException('Factura de compra no encontrada');
    if (factura.numeroComprobante) {
      throw new BadRequestException(
        `Tiene el comprobante de retención ${factura.numeroComprobante} emitido: no se puede eliminar; registre una nota de crédito del proveedor`,
      );
    }
    if (await this.ds.query(`SELECT 1 FROM compras WHERE factura_compra_id = $1`, [id]).then((r) => r.length)) {
      throw new BadRequestException('Esta factura viene de una compra registrada: corríjala desde Compras');
    }
    await this.ds.getRepository(FacturaCompra).delete({ id });
  }

  // ------------------------------------------------------------------ libros

  /**
   * Libro de ventas del mes (Reglamento de la Ley del IVA, art. 76): facturas,
   * notas de crédito (en negativo), facturas anuladas y hojas anuladas, en
   * orden de fecha y número.
   */
  async libroVentas(mes: string): Promise<Libro<FilaLibroVentas>> {
    const { desde, hasta } = rango(mes);
    const dia = (col: string) => `to_char(${col} AT TIME ZONE '${ZONA_HORARIA}', 'YYYY-MM-DD')`;
    const entre = (col: string) => `(${col} AT TIME ZONE '${ZONA_HORARIA}')::date BETWEEN $1 AND $2`;

    const ventas: Record<string, string>[] = await this.ds.query(
      `SELECT ${dia('v.creado_en')} AS fecha, v.serie, v.numero_factura, t.digitos, v.numero_control, v.estado,
              v.cliente_documento, v.cliente_nombre, v.total_bs, v.base_exenta_bs, v.base_general_bs, v.iva_general_bs,
              v.base_reducida_bs, v.iva_reducida_bs, v.igtf_bs,
              (SELECT coalesce(sum(p.monto_bs), 0) FROM ventas_pagos p WHERE p.venta_id = v.id AND p.metodo = 'RETENCION_IVA') AS retenido,
              (SELECT string_agg(p.referencia, ', ') FROM ventas_pagos p WHERE p.venta_id = v.id AND p.metodo = 'RETENCION_IVA') AS comprobante
         FROM ventas v JOIN talonarios t ON t.id = v.talonario_id
        WHERE ${entre('v.creado_en')}`,
      [desde, hasta],
    );
    const notas: Record<string, string>[] = await this.ds.query(
      `SELECT ${dia('n.creado_en')} AS fecha, n.serie, n.numero, t.digitos, n.numero_control,
              v.serie AS serie_factura, v.numero_factura, tv.digitos AS digitos_factura,
              v.cliente_documento, v.cliente_nombre, n.total_bs, n.base_exenta_bs, n.base_general_bs, n.iva_general_bs,
              n.base_reducida_bs, n.iva_reducida_bs
         FROM notas_credito n
         JOIN talonarios t ON t.id = n.talonario_id
         JOIN ventas v ON v.id = n.venta_id
         JOIN talonarios tv ON tv.id = v.talonario_id
        WHERE ${entre('n.creado_en')}`,
      [desde, hasta],
    );
    const debitos: Record<string, string>[] = await this.ds.query(
      `SELECT ${dia('d.creado_en')} AS fecha, d.serie, d.numero, t.digitos, d.numero_control, d.alicuota_iva,
              v.serie AS serie_factura, v.numero_factura, tv.digitos AS digitos_factura,
              v.cliente_documento, v.cliente_nombre, d.base_bs, d.iva_bs, d.total_bs
         FROM notas_debito d
         JOIN talonarios t ON t.id = d.talonario_id
         JOIN ventas v ON v.id = d.venta_id
         JOIN talonarios tv ON tv.id = v.talonario_id
        WHERE ${entre('d.creado_en')}`,
      [desde, hasta],
    );
    const hojas: Record<string, string>[] = await this.ds.query(
      `SELECT ${dia('a.creado_en')} AS fecha, t.tipo, t.serie, a.numero, t.digitos, a.numero_control
         FROM facturas_anuladas a JOIN talonarios t ON t.id = a.talonario_id
        WHERE ${entre('a.creado_en')}`,
      [desde, hasta],
    );

    const num = (serie: string, n: string | number, digitos: string | number) =>
      `${serie ? `${serie}-` : ''}${pad(Number(n), Number(digitos))}`;
    const filas: FilaLibroVentas[] = [
      ...ventas.map((v): FilaLibroVentas => {
        const anulada = v.estado === 'ANULADA';
        return {
          fecha: v.fecha,
          documento: 'FACTURA',
          numero: num(v.serie, v.numero_factura, v.digitos),
          numeroControl: v.numero_control,
          facturaAfectada: null,
          tipoTransaccion: anulada ? '03-ANU' : '01-REG',
          rif: v.cliente_documento,
          nombre: anulada ? 'ANULADA' : v.cliente_nombre,
          ...(anulada
            ? cero
            : {
                totalBs: v.total_bs,
                exentoBs: v.base_exenta_bs,
                baseGeneralBs: v.base_general_bs,
                ivaGeneralBs: v.iva_general_bs,
                baseReducidaBs: v.base_reducida_bs,
                ivaReducidaBs: v.iva_reducida_bs,
              }),
          igtfBs: anulada ? '0.00' : v.igtf_bs,
          ivaRetenidoBs: anulada ? '0.00' : dec(v.retenido).toFixed(2),
          comprobanteRetencion: anulada ? null : v.comprobante,
        };
      }),
      ...notas.map((n): FilaLibroVentas => ({
        fecha: n.fecha,
        documento: 'NOTA_CREDITO',
        numero: num(n.serie, n.numero, n.digitos),
        numeroControl: n.numero_control,
        facturaAfectada: num(n.serie_factura, n.numero_factura, n.digitos_factura),
        tipoTransaccion: '01-REG',
        rif: n.cliente_documento,
        nombre: n.cliente_nombre,
        totalBs: negar(n.total_bs),
        exentoBs: negar(n.base_exenta_bs),
        baseGeneralBs: negar(n.base_general_bs),
        ivaGeneralBs: negar(n.iva_general_bs),
        baseReducidaBs: negar(n.base_reducida_bs),
        ivaReducidaBs: negar(n.iva_reducida_bs),
        igtfBs: '0.00',
        ivaRetenidoBs: '0.00',
        comprobanteRetencion: null,
      })),
      ...debitos.map((d): FilaLibroVentas => {
        const exento = d.alicuota_iva === 'EXENTO';
        const reducida = d.alicuota_iva === 'REDUCIDA';
        return {
          fecha: d.fecha,
          documento: 'NOTA_DEBITO',
          numero: num(d.serie, d.numero, d.digitos),
          numeroControl: d.numero_control,
          facturaAfectada: num(d.serie_factura, d.numero_factura, d.digitos_factura),
          tipoTransaccion: '01-REG',
          rif: d.cliente_documento,
          nombre: d.cliente_nombre,
          totalBs: d.total_bs,
          exentoBs: exento ? d.base_bs : '0.00',
          baseGeneralBs: !exento && !reducida ? d.base_bs : '0.00',
          ivaGeneralBs: !exento && !reducida ? d.iva_bs : '0.00',
          baseReducidaBs: reducida ? d.base_bs : '0.00',
          ivaReducidaBs: reducida ? d.iva_bs : '0.00',
          igtfBs: '0.00',
          ivaRetenidoBs: '0.00',
          comprobanteRetencion: null,
        };
      }),
      ...hojas.map((h): FilaLibroVentas => ({
        fecha: h.fecha,
        documento: h.tipo as FilaLibroVentas['documento'],
        numero: num(h.serie, h.numero, h.digitos),
        numeroControl: h.numero_control,
        facturaAfectada: null,
        tipoTransaccion: '03-ANU',
        rif: null,
        nombre: 'ANULADA',
        ...cero,
        igtfBs: '0.00',
        ivaRetenidoBs: '0.00',
        comprobanteRetencion: null,
      })),
    ].sort(
      (a, b) => a.fecha.localeCompare(b.fecha) || a.documento.localeCompare(b.documento) || a.numero.localeCompare(b.numero),
    );
    return { mes, filas, totales: totalizar(filas, [...CAMPOS_MONTO, 'igtfBs', 'ivaRetenidoBs']) };
  }

  /** Libro de compras del mes: documentos de proveedores por fecha de emisión; las notas de crédito restan. */
  async libroCompras(mes: string): Promise<Libro<FilaLibroCompras>> {
    const { desde, hasta } = rango(mes);
    const docs = await this.ds
      .getRepository(FacturaCompra)
      .createQueryBuilder('f')
      .innerJoinAndSelect('f.proveedor', 'p')
      .where('f.fecha BETWEEN :desde AND :hasta', { desde, hasta })
      .orderBy('f.fecha', 'ASC')
      .addOrderBy('f.id', 'ASC')
      .getMany();
    const filas = docs.map((f): FilaLibroCompras => {
      const s = (v: string) => (f.tipo === TipoDocumentoCompra.NOTA_CREDITO ? negar(v) : dec(v).toFixed(2));
      return {
        id: f.id,
        fecha: f.fecha,
        documento: f.tipo,
        numero: f.numero,
        numeroControl: f.numeroControl,
        facturaAfectada: f.facturaAfectada,
        rif: f.proveedor.rif,
        nombre: f.proveedor.razonSocial,
        totalBs: s(f.totalBs),
        exentoBs: s(f.baseExentaBs),
        baseGeneralBs: s(f.baseGeneralBs),
        ivaGeneralBs: s(f.ivaGeneralBs),
        baseReducidaBs: s(f.baseReducidaBs),
        ivaReducidaBs: s(f.ivaReducidaBs),
        ivaRetenidoBs: s(f.ivaRetenidoBs),
        numeroComprobante: f.numeroComprobante,
      };
    });
    return { mes, filas, totales: totalizar(filas, [...CAMPOS_MONTO, 'ivaRetenidoBs']) };
  }

  /** Débito y crédito fiscal del mes, como apoyo para la declaración de IVA (forma 30). */
  async resumen(mes: string): Promise<ResumenIva> {
    const [ventas, compras] = await Promise.all([this.libroVentas(mes), this.libroCompras(mes)]);
    const debito = dec(ventas.totales.ivaGeneralBs).plus(ventas.totales.ivaReducidaBs);
    const credito = dec(compras.totales.ivaGeneralBs).plus(compras.totales.ivaReducidaBs);
    // Las retenciones que hace la ferretería las entera ella y no reducen su cuota; las que le hicieron sus clientes sí.
    const recibidas = dec(ventas.totales.ivaRetenidoBs);
    return {
      mes,
      debitoFiscalBs: debito.toFixed(2),
      creditoFiscalBs: credito.toFixed(2),
      ivaRetenidoBs: compras.totales.ivaRetenidoBs,
      retencionesRecibidasBs: recibidas.toFixed(2),
      diferenciaBs: debito.minus(credito).minus(recibidas).toFixed(2),
      igtfPercibidoBs: ventas.totales.igtfBs,
    };
  }

  // ------------------------------------------------------------------ Excel

  async excelVentas(mes: string): Promise<Buffer> {
    const libro = await this.libroVentas(mes);
    return this.excel(
      'Libro de ventas',
      mes,
      [
        ['Fecha', 'fecha', 11],
        ['Tipo de documento', 'documento', 14],
        ['N° de documento', 'numero', 13],
        ['N° de control', 'numeroControl', 14],
        ['Factura afectada', 'facturaAfectada', 13],
        ['Tipo de transacción', 'tipoTransaccion', 12],
        ['RIF / Cédula', 'rif', 14],
        ['Nombre o razón social', 'nombre', 32],
        ['Total ventas con IVA', 'totalBs', 16, true],
        ['Ventas exentas', 'exentoBs', 14, true],
        ['Base imponible alícuota general', 'baseGeneralBs', 16, true],
        ['IVA alícuota general', 'ivaGeneralBs', 14, true],
        ['Base imponible alícuota reducida', 'baseReducidaBs', 16, true],
        ['IVA alícuota reducida', 'ivaReducidaBs', 14, true],
        ['IGTF percibido', 'igtfBs', 13, true],
        ['IVA retenido por el comprador', 'ivaRetenidoBs', 14, true],
        ['N° comprobante de retención', 'comprobanteRetencion', 18],
      ],
      libro.filas as unknown as Record<string, unknown>[],
      libro.totales,
    );
  }

  async excelCompras(mes: string): Promise<Buffer> {
    const libro = await this.libroCompras(mes);
    return this.excel(
      'Libro de compras',
      mes,
      [
        ['Fecha', 'fecha', 11],
        ['Tipo de documento', 'documento', 14],
        ['N° de documento', 'numero', 13],
        ['N° de control', 'numeroControl', 14],
        ['Factura afectada', 'facturaAfectada', 13],
        ['RIF', 'rif', 14],
        ['Proveedor', 'nombre', 32],
        ['Total compras con IVA', 'totalBs', 16, true],
        ['Compras exentas', 'exentoBs', 14, true],
        ['Base imponible alícuota general', 'baseGeneralBs', 16, true],
        ['IVA alícuota general', 'ivaGeneralBs', 14, true],
        ['Base imponible alícuota reducida', 'baseReducidaBs', 16, true],
        ['IVA alícuota reducida', 'ivaReducidaBs', 14, true],
        ['IVA retenido', 'ivaRetenidoBs', 13, true],
      ],
      libro.filas as unknown as Record<string, unknown>[],
      libro.totales,
    );
  }

  private async excel(
    titulo: string,
    mes: string,
    columnas: [string, string, number, boolean?][],
    filas: Record<string, unknown>[],
    totales: Record<string, string>,
  ): Promise<Buffer> {
    const { empresa } = await this.configuracion.obtenerTodo();
    const [a, m] = mes.split('-').map(Number);
    const periodo = new Intl.DateTimeFormat('es-VE', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
      new Date(Date.UTC(a, m - 1, 1)),
    );
    const wb = new ExcelJS.Workbook();
    const hoja = wb.addWorksheet(titulo);
    hoja.addRow([empresa.razonSocial]).font = { bold: true, size: 12 };
    hoja.addRow([`RIF: ${empresa.rif || '(sin registrar)'}`]);
    hoja.addRow([`${titulo} — período ${periodo}`]).font = { bold: true };
    hoja.addRow([]);
    const encabezado = hoja.addRow(columnas.map(([t]) => t));
    encabezado.font = { bold: true };
    encabezado.alignment = { wrapText: true, vertical: 'middle' };
    for (const f of filas) {
      hoja.addRow(columnas.map(([, k, , monto]) => (monto ? Number(f[k]) : (f[k] ?? ''))));
    }
    const fila = hoja.addRow(columnas.map(([, k, , monto], i) => (i === 0 ? 'TOTALES' : monto ? Number(totales[k] ?? 0) : '')));
    fila.font = { bold: true };
    columnas.forEach(([, , ancho, monto], i) => {
      const c = hoja.getColumn(i + 1);
      c.width = ancho;
      if (monto) c.numFmt = '#,##0.00;-#,##0.00';
    });
    hoja.views = [{ state: 'frozen', ySplit: 5 }];
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}
