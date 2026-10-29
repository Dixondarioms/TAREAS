import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { dec } from '../comun/dinero';
import { ConfiguracionService, DatosEmpresa } from '../configuracion/configuracion.service';
import { FacturaCompra, TipoDocumentoCompra } from './factura-compra.entity';

export interface Comprobante {
  agente: DatosEmpresa;
  factura: FacturaCompra;
  periodo: string;
}

const TIPO_DOCUMENTO_TXT: Record<TipoDocumentoCompra, string> = {
  [TipoDocumentoCompra.FACTURA]: '01',
  [TipoDocumentoCompra.NOTA_DEBITO]: '02',
  [TipoDocumentoCompra.NOTA_CREDITO]: '03',
};

const sinGuiones = (rif: string) => rif.replace(/[^A-Z0-9]/gi, '').toUpperCase();

@Injectable()
export class RetencionesService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly configuracion: ConfiguracionService,
  ) {}

  private delPeriodo(mes: string, quincena?: 1 | 2): Promise<FacturaCompra[]> {
    const [a, m] = mes.split('-').map(Number);
    const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
    const desde = `${mes}-${quincena === 2 ? '16' : '01'}`;
    const hasta = `${mes}-${quincena === 1 ? '15' : String(ultimo).padStart(2, '0')}`;
    return this.ds
      .getRepository(FacturaCompra)
      .createQueryBuilder('f')
      .innerJoinAndSelect('f.proveedor', 'p')
      .where('f.numero_comprobante IS NOT NULL AND f.fecha_comprobante BETWEEN :desde AND :hasta', { desde, hasta })
      .orderBy('f.numero_comprobante', 'ASC')
      .getMany();
  }

  /** Comprobantes de retención emitidos en el mes. */
  listar(mes: string): Promise<FacturaCompra[]> {
    return this.delPeriodo(mes);
  }

  async comprobante(id: number): Promise<Comprobante> {
    const factura = await this.ds.getRepository(FacturaCompra).findOne({ where: { id }, relations: { proveedor: true } });
    if (!factura?.numeroComprobante) throw new NotFoundException('Esa factura no tiene comprobante de retención');
    const { empresa } = await this.configuracion.obtenerTodo();
    return { agente: empresa, factura, periodo: factura.numeroComprobante.slice(0, 6) };
  }

  /**
   * Archivo TXT de retenciones de IVA para el portal del SENIAT (una línea
   * por documento y alícuota, campos separados por tabulador). Revise el
   * formato con su contador antes de la primera declaración.
   */
  async txt(mes: string, quincena: 1 | 2): Promise<string> {
    const { empresa, alicuotasIva } = await this.configuracion.obtenerTodo();
    if (!empresa.rif) throw new BadRequestException('Registre el RIF de la empresa en Configuración');
    const facturas = await this.delPeriodo(mes, quincena);
    const lineas: string[] = [];
    for (const f of facturas) {
      const partes: [string, string, string][] = [];
      if (dec(f.ivaGeneralBs).gt(0)) partes.push([f.baseGeneralBs, f.ivaGeneralBs, alicuotasIva.GENERAL]);
      if (dec(f.ivaReducidaBs).gt(0)) partes.push([f.baseReducidaBs, f.ivaReducidaBs, alicuotasIva.REDUCIDA]);
      const iva = dec(f.ivaGeneralBs).plus(f.ivaReducidaBs);
      partes.forEach(([base, ivaParte, alicuota], i) => {
        // Si la factura tiene dos alícuotas, la retención se reparte en proporción al IVA de cada una.
        const retenido =
          i === partes.length - 1
            ? dec(f.ivaRetenidoBs).minus(
                partes
                  .slice(0, -1)
                  .reduce((s, [, ip]) => s.plus(dec(f.ivaRetenidoBs).times(ip).div(iva).toDecimalPlaces(2)), dec(0)),
              )
            : dec(f.ivaRetenidoBs).times(ivaParte).div(iva).toDecimalPlaces(2);
        lineas.push(
          [
            sinGuiones(empresa.rif),
            f.numeroComprobante!.slice(0, 6),
            f.fecha,
            'C',
            TIPO_DOCUMENTO_TXT[f.tipo],
            sinGuiones(f.proveedor.rif),
            f.numero,
            f.numeroControl,
            dec(f.totalBs).toFixed(2),
            dec(base).toFixed(2),
            retenido.toFixed(2),
            f.facturaAfectada ?? '0',
            f.numeroComprobante!,
            i === 0 ? dec(f.baseExentaBs).toFixed(2) : '0.00',
            dec(alicuota).toFixed(2),
            '0',
          ].join('\t'),
        );
      });
    }
    return lineas.join('\r\n') + (lineas.length ? '\r\n' : '');
  }
}
