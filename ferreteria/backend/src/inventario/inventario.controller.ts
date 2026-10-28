import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles, UsuarioActual, UsuarioSesion } from '../comun/decoradores';
import { Rol } from '../usuarios/rol.enum';
import { AjusteInventarioDto, ConsultaMovimientosDto, ConteoDto } from './inventario.dto';
import { InventarioService } from './inventario.service';

@ApiTags('inventario')
@Controller('inventario')
export class InventarioController {
  constructor(private readonly servicio: InventarioService) {}

  /** Totales para el panel: productos bajo mínimo, sin existencia y valor del inventario. */
  @Get('resumen')
  resumen(@UsuarioActual() u: UsuarioSesion) {
    return this.servicio.resumen(u);
  }

  /** Kardex del producto, del más reciente al más antiguo. */
  @Get('productos/:id/movimientos')
  movimientos(@Param('id', ParseIntPipe) id: number, @Query() c: ConsultaMovimientosDto, @UsuarioActual() u: UsuarioSesion) {
    return this.servicio.movimientos(id, c, u);
  }

  @Post('ajustes')
  @Roles(Rol.GERENTE, Rol.ALMACEN)
  ajustar(@Body() dto: AjusteInventarioDto, @UsuarioActual() u: UsuarioSesion) {
    return this.servicio.ajustar(dto, u);
  }

  @Post('conteos')
  @Roles(Rol.GERENTE, Rol.ALMACEN)
  conteo(@Body() dto: ConteoDto, @UsuarioActual() u: UsuarioSesion) {
    return this.servicio.conteo(dto, u);
  }
}
