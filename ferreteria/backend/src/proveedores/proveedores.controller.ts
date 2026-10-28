import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../comun/decoradores';
import { Rol } from '../usuarios/rol.enum';
import { ActualizarProveedorDto, BuscarProveedoresDto, CrearProveedorDto } from './proveedores.dto';
import { ProveedoresService } from './proveedores.service';

@ApiTags('proveedores')
@Controller('proveedores')
@Roles(Rol.GERENTE, Rol.ALMACEN)
export class ProveedoresController {
  constructor(private readonly servicio: ProveedoresService) {}

  @Get()
  buscar(@Query() consulta: BuscarProveedoresDto) {
    return this.servicio.buscar(consulta);
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.servicio.obtener(id);
  }

  @Post()
  crear(@Body() dto: CrearProveedorDto) {
    return this.servicio.crear(dto);
  }

  @Put(':id')
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualizarProveedorDto) {
    return this.servicio.actualizar(id, dto);
  }
}
