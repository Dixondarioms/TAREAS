import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles, UsuarioActual, UsuarioSesion } from '../comun/decoradores';
import { Rol } from '../usuarios/rol.enum';
import { BuscarComprasDto, CrearCompraDto, PagoProveedorDto } from './compras.dto';
import { ComprasService } from './compras.service';

@ApiTags('compras')
@Controller('compras')
@Roles(Rol.GERENTE, Rol.ALMACEN)
export class ComprasController {
  constructor(private readonly servicio: ComprasService) {}

  /** Recepción de mercancía: inventario, costos y libro de compras. */
  @Post()
  crear(@Body() dto: CrearCompraDto, @UsuarioActual() u: UsuarioSesion) {
    return this.servicio.crear(dto, u);
  }

  @Get()
  buscar(@Query() c: BuscarComprasDto) {
    return this.servicio.buscar(c);
  }

  /** Cuentas por pagar a proveedores. */
  @Get('por-pagar')
  @Roles(Rol.GERENTE)
  porPagar() {
    return this.servicio.porPagar();
  }

  @Get(':id')
  detalle(@Param('id', ParseIntPipe) id: number) {
    return this.servicio.detalle(id);
  }

  @Post(':id/pagos')
  @Roles(Rol.GERENTE)
  pagar(@Param('id', ParseIntPipe) id: number, @Body() dto: PagoProveedorDto, @UsuarioActual() u: UsuarioSesion) {
    return this.servicio.pagar(id, dto, u);
  }
}
