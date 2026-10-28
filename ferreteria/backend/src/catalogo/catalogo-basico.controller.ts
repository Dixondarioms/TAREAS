import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../comun/decoradores';
import { Rol } from '../usuarios/rol.enum';
import { CatalogoBasicoService } from './catalogo-basico.service';
import { CategoriaDto, ListaPrecioDto, MarcaDto, UnidadDto } from './dto/catalogo-basico.dto';

@ApiTags('catálogo')
@Controller('unidades')
export class UnidadesController {
  constructor(private readonly servicio: CatalogoBasicoService) {}

  @Get()
  listar() {
    return this.servicio.listarUnidades();
  }

  @Post()
  @Roles(Rol.GERENTE)
  crear(@Body() dto: UnidadDto) {
    return this.servicio.crearUnidad(dto);
  }

  @Put(':id')
  @Roles(Rol.GERENTE)
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: UnidadDto) {
    return this.servicio.actualizarUnidad(id, dto);
  }
}

@ApiTags('catálogo')
@Controller('categorias')
export class CategoriasController {
  constructor(private readonly servicio: CatalogoBasicoService) {}

  /** ?formato=arbol devuelve la jerarquía; por defecto, lista plana con la ruta. */
  @Get()
  listar(@Query('formato') formato?: string) {
    return formato === 'arbol' ? this.servicio.arbolCategorias() : this.servicio.listarCategoriasPlano();
  }

  @Post()
  @Roles(Rol.GERENTE, Rol.ALMACEN)
  crear(@Body() dto: CategoriaDto) {
    return this.servicio.crearCategoria(dto);
  }

  @Put(':id')
  @Roles(Rol.GERENTE, Rol.ALMACEN)
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: CategoriaDto) {
    return this.servicio.actualizarCategoria(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(Rol.GERENTE)
  eliminar(@Param('id', ParseIntPipe) id: number) {
    return this.servicio.eliminarCategoria(id);
  }
}

@ApiTags('catálogo')
@Controller('marcas')
export class MarcasController {
  constructor(private readonly servicio: CatalogoBasicoService) {}

  @Get()
  listar() {
    return this.servicio.listarMarcas();
  }

  @Post()
  @Roles(Rol.GERENTE, Rol.ALMACEN)
  crear(@Body() dto: MarcaDto) {
    return this.servicio.crearMarca(dto);
  }

  @Put(':id')
  @Roles(Rol.GERENTE, Rol.ALMACEN)
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: MarcaDto) {
    return this.servicio.actualizarMarca(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(Rol.GERENTE)
  eliminar(@Param('id', ParseIntPipe) id: number) {
    return this.servicio.eliminarMarca(id);
  }
}

@ApiTags('precios')
@Controller('listas-precio')
export class ListasPrecioController {
  constructor(private readonly servicio: CatalogoBasicoService) {}

  @Get()
  listar() {
    return this.servicio.listarListas();
  }

  @Post()
  @Roles(Rol.GERENTE)
  crear(@Body() dto: ListaPrecioDto) {
    return this.servicio.crearLista(dto);
  }

  @Put(':id')
  @Roles(Rol.GERENTE)
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: ListaPrecioDto) {
    return this.servicio.actualizarLista(id, dto);
  }
}
