import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { DataSource } from 'typeorm';
import { AlicuotaIva } from '../catalogo/entidades/producto.entity';
import { UsuarioSesion } from '../comun/decoradores';
import { dec, DECIMALES_BS, montoIva, redondear } from '../comun/dinero';
import { EsDecimal } from '../comun/validadores';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { Moneda } from '../tasas/tasa-cambio.entity';
import { TasasService } from '../tasas/tasas.service';
import { Rol } from '../usuarios/rol.enum';
import { CajaService } from './caja.service';
import { NotaDebito } from './entidades/nota-debito.entity';
import { TipoDocumento } from './entidades/talonario.entity';
import { EstadoVenta, Venta } from './entidades/venta.entity';
import { MetodoPago, METODOS_FUERA_DE_CAJA, METODOS_PAGO } from './metodos-pago';
import { TalonariosService } from './talonarios.service';

export class CrearNotaDebitoDto {
  @IsString()
  @MinLength(3, { message: 'Indique el concepto de la nota de débito' })
  @MaxLength(200)
  concepto: string;

  /** Monto sin IVA, en bolívares. */
  @EsDecimal({ min: '0.01', decimales: 2 })
  baseBs: string;

  @IsEnum(AlicuotaIva)
  alicuotaIva: AlicuotaIva;

  @IsEnum(MetodoPago)
  metodo: MetodoPago;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  referencia?: string;
}

const b2 = (v: ReturnType<typeof dec>) => redondear(v, DECIMALES_BS);

@Injectable()
export class NotasDebitoService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly configuracion: ConfiguracionService,
    private readonly tasas: TasasService,
    private readonly caja: CajaService,
    private readonly talonarios: TalonariosService,
  ) {}

  /** Cargo adicional sobre una factura, cobrado en la caja abierta de quien la emite. */
  async crear(ventaId: number, dto: CrearNotaDebitoDto, usuario: UsuarioSesion): Promise<NotaDebito> {
    if (METODOS_FUERA_DE_CAJA.includes(dto.metodo))
      throw new BadRequestException('La nota de débito se cobra en caja: elija cómo paga el cliente');
    if (METODOS_PAGO[dto.metodo].referencia && !dto.referencia?.trim()) {
      throw new BadRequestException(`Indique la referencia del pago por ${METODOS_PAGO[dto.metodo].nombre}`);
    }
    const tasa = await this.tasas.vigenteObligatoria(Moneda.USD);
    const { alicuotasIva } = await this.configuracion.obtenerTodo();
    const id = await this.ds.transaction(async (m) => {
      const venta = await m.getRepository(Venta).findOne({ where: { id: ventaId }, lock: { mode: 'pessimistic_read' } });
      if (!venta) throw new NotFoundException('Venta no encontrada');
      if (venta.estado !== EstadoVenta.COMPLETADA) throw new BadRequestException('La venta está anulada');
      const esGerente = usuario.rol === Rol.ADMIN || usuario.rol === Rol.GERENTE;
      if (!esGerente && venta.usuarioId !== usuario.id)
        throw new ForbiddenException('Solo puede hacer notas de débito de sus ventas');
      const sesion = await this.caja.abiertaDe(m, usuario.id, true);
      if (!sesion) throw new BadRequestException('Abra su caja: la nota de débito se cobra en ella');

      const base = b2(dec(dto.baseBs));
      const porcentaje = alicuotasIva[dto.alicuotaIva];
      const iva = b2(montoIva(base, porcentaje));
      const total = base.plus(iva);
      const monto = METODOS_PAGO[dto.metodo].moneda === 'USD' ? b2(total.div(tasa.valor)) : total;
      const documento = await this.talonarios.asignar(m, TipoDocumento.NOTA_DEBITO);
      const nota = await m.save(
        m.create(NotaDebito, {
          ventaId,
          sesionId: sesion.id,
          usuarioId: usuario.id,
          talonarioId: documento.talonario.id,
          serie: documento.talonario.serie,
          numero: documento.numero,
          numeroControl: documento.numeroControl,
          concepto: dto.concepto.trim(),
          alicuotaIva: dto.alicuotaIva,
          porcentajeIva: dec(porcentaje).toFixed(2),
          baseBs: base.toFixed(2),
          ivaBs: iva.toFixed(2),
          totalBs: total.toFixed(2),
          tasa: tasa.valor,
          metodo: dto.metodo,
          monto: monto.toFixed(2),
          referencia: dto.referencia?.trim() || null,
        }),
      );
      return nota.id;
    });
    return this.ds.getRepository(NotaDebito).findOneOrFail({ where: { id }, relations: { talonario: true, usuario: true } });
  }

  deVenta(ventaId: number): Promise<NotaDebito[]> {
    return this.ds
      .getRepository(NotaDebito)
      .find({ where: { ventaId }, relations: { talonario: true, usuario: true }, order: { id: 'ASC' } });
  }
}
