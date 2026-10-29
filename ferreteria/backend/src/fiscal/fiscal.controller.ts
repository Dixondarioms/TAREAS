import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Query, StreamableFile } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles, UsuarioActual, UsuarioSesion } from '../comun/decoradores';
import { Rol } from '../usuarios/rol.enum';
import { ConsultaMesDto, ConsultaQuincenaDto, CrearFacturaCompraDto } from './fiscal.dto';
import { FiscalService } from './fiscal.service';
import { RetencionesService } from './retenciones.service';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@ApiTags('fiscal')
@Controller('fiscal')
@Roles(Rol.GERENTE)
export class FiscalController {
  constructor(
    private readonly servicio: FiscalService,
    private readonly retencionesIva: RetencionesService,
  ) {}

  @Post('compras')
  crearCompra(@Body() dto: CrearFacturaCompraDto, @UsuarioActual() u: UsuarioSesion) {
    return this.servicio.crearCompra(dto, u);
  }

  @Delete('compras/:id')
  @HttpCode(204)
  eliminarCompra(@Param('id', ParseIntPipe) id: number) {
    return this.servicio.eliminarCompra(id);
  }

  /** Comprobantes de retención de IVA emitidos en el mes. */
  @Get('retenciones')
  retenciones(@Query() c: ConsultaMesDto) {
    return this.retencionesIva.listar(c.mes);
  }

  @Get('retenciones/txt')
  async txtRetenciones(@Query() c: ConsultaQuincenaDto) {
    const q = c.quincena === '2' ? 2 : 1;
    return new StreamableFile(Buffer.from(await this.retencionesIva.txt(c.mes, q), 'utf8'), {
      type: 'text/plain; charset=utf-8',
      disposition: `attachment; filename="retenciones-iva-${c.mes}-q${q}.txt"`,
    });
  }

  @Get('compras/:id/comprobante')
  comprobante(@Param('id', ParseIntPipe) id: number) {
    return this.retencionesIva.comprobante(id);
  }

  @Get('libro-ventas')
  libroVentas(@Query() c: ConsultaMesDto) {
    return this.servicio.libroVentas(c.mes);
  }

  @Get('libro-compras')
  libroCompras(@Query() c: ConsultaMesDto) {
    return this.servicio.libroCompras(c.mes);
  }

  @Get('resumen')
  resumen(@Query() c: ConsultaMesDto) {
    return this.servicio.resumen(c.mes);
  }

  @Get('libro-ventas/excel')
  async excelVentas(@Query() c: ConsultaMesDto) {
    return new StreamableFile(await this.servicio.excelVentas(c.mes), {
      type: XLSX,
      disposition: `attachment; filename="libro-ventas-${c.mes}.xlsx"`,
    });
  }

  @Get('libro-compras/excel')
  async excelCompras(@Query() c: ConsultaMesDto) {
    return new StreamableFile(await this.servicio.excelCompras(c.mes), {
      type: XLSX,
      disposition: `attachment; filename="libro-compras-${c.mes}.xlsx"`,
    });
  }
}
