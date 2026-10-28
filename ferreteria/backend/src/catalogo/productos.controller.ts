import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Post,
  Put,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Roles, UsuarioActual, UsuarioSesion } from '../comun/decoradores';
import { Rol } from '../usuarios/rol.enum';
import { AjustePreciosDto } from './dto/ajuste-precios.dto';
import { ActualizarProductoDto, BuscarProductosDto, CrearProductoDto } from './dto/producto.dto';
import { ImportacionService } from './importacion.service';
import { PreciosService } from './precios.service';
import { ProductosService } from './productos.service';

const TAMANO_MAXIMO_ARCHIVO = 10 * 1024 * 1024;

@ApiTags('productos')
@Controller('productos')
export class ProductosController {
  constructor(
    private readonly productos: ProductosService,
    private readonly importacion: ImportacionService,
  ) {}

  @Get()
  buscar(@Query() consulta: BuscarProductosDto, @UsuarioActual() u: UsuarioSesion) {
    return this.productos.buscar(consulta, u);
  }

  @Get('importacion/plantilla')
  @Roles(Rol.GERENTE)
  async plantilla() {
    return new StreamableFile(await this.importacion.plantilla(), {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="plantilla-productos.xlsx"',
    });
  }

  @Post('importacion')
  @Roles(Rol.GERENTE)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: TAMANO_MAXIMO_ARCHIVO, files: 1 } }))
  importar(
    @UploadedFile() archivo: Express.Multer.File | undefined,
    @Query('simular', new ParseBoolPipe({ optional: true })) simular: boolean | undefined,
    @UsuarioActual() u: UsuarioSesion,
  ) {
    if (!archivo) throw new BadRequestException('Adjunte el archivo en el campo "archivo"');
    return this.importacion.importar(archivo.originalname, archivo.buffer, simular ?? false, u);
  }

  /** Búsqueda exacta por código de barras o código interno (lector de mostrador). */
  @Get('por-codigo/:codigo')
  porCodigo(@Param('codigo') codigo: string, @UsuarioActual() u: UsuarioSesion) {
    return this.productos.porCodigo(codigo, u);
  }

  @Get(':id')
  detalle(@Param('id', ParseIntPipe) id: number, @UsuarioActual() u: UsuarioSesion) {
    return this.productos.detalle(id, u);
  }

  @Get(':id/historial-costos')
  @Roles(Rol.GERENTE, Rol.ALMACEN)
  historialCostos(@Param('id', ParseIntPipe) id: number) {
    return this.productos.historialCostos(id);
  }

  @Post()
  @Roles(Rol.GERENTE, Rol.ALMACEN)
  crear(@Body() dto: CrearProductoDto, @UsuarioActual() u: UsuarioSesion) {
    return this.productos.crear(dto, u);
  }

  @Put(':id')
  @Roles(Rol.GERENTE, Rol.ALMACEN)
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualizarProductoDto, @UsuarioActual() u: UsuarioSesion) {
    return this.productos.actualizar(id, dto, u);
  }
}

@ApiTags('precios')
@Controller('precios')
export class PreciosController {
  constructor(private readonly precios: PreciosService) {}

  @Post('ajuste-masivo')
  @Roles(Rol.GERENTE)
  ajusteMasivo(@Body() dto: AjustePreciosDto, @UsuarioActual() u: UsuarioSesion) {
    return this.precios.ajusteMasivo(dto, u);
  }
}
