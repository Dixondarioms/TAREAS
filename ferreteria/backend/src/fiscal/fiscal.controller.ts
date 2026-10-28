import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Query, StreamableFile } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles, UsuarioActual, UsuarioSesion } from '../comun/decoradores';
import { Rol } from '../usuarios/rol.enum';
import { ConsultaMesDto, CrearFacturaCompraDto } from './fiscal.dto';
import { FiscalService } from './fiscal.service';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@ApiTags('fiscal')
@Controller('fiscal')
@Roles(Rol.GERENTE)
export class FiscalController {
  constructor(private readonly servicio: FiscalService) {}

  @Post('compras')
  crearCompra(@Body() dto: CrearFacturaCompraDto, @UsuarioActual() u: UsuarioSesion) {
    return this.servicio.crearCompra(dto, u);
  }

  @Delete('compras/:id')
  @HttpCode(204)
  eliminarCompra(@Param('id', ParseIntPipe) id: number) {
    return this.servicio.eliminarCompra(id);
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
