import { Body, Controller, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles, UsuarioActual, UsuarioSesion } from '../comun/decoradores';
import { Rol } from './rol.enum';
import { ActualizarUsuarioDto, CrearUsuarioDto } from './usuarios.dto';
import { UsuariosService } from './usuarios.service';

@ApiTags('usuarios')
@Controller('usuarios')
@Roles(Rol.ADMIN)
export class UsuariosController {
  constructor(private readonly servicio: UsuariosService) {}

  @Get()
  listar() {
    return this.servicio.listar();
  }

  @Post()
  crear(@Body() dto: CrearUsuarioDto) {
    return this.servicio.crear(dto);
  }

  @Put(':id')
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualizarUsuarioDto, @UsuarioActual() yo: UsuarioSesion) {
    return this.servicio.actualizar(id, dto, yo.id);
  }
}
