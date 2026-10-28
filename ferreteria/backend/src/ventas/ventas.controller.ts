import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles, UsuarioActual, UsuarioSesion } from '../comun/decoradores';
import { Rol } from '../usuarios/rol.enum';
import { CajaService } from './caja.service';
import { ClientesService } from './clientes.service';
import { TalonariosService } from './talonarios.service';
import {
  AbrirCajaDto,
  ActualizarClienteDto,
  AnularNumeroDto,
  AnularVentaDto,
  BuscarClientesDto,
  BuscarSesionesDto,
  BuscarVentasDto,
  CerrarCajaDto,
  CotizarVentaDto,
  CrearClienteDto,
  CrearTalonarioDto,
  CrearVentaDto,
  MovimientoCajaDto,
} from './ventas.dto';
import { VentasService } from './ventas.service';

@ApiTags('clientes')
@Controller('clientes')
@Roles(Rol.GERENTE, Rol.CAJERO)
export class ClientesController {
  constructor(private readonly servicio: ClientesService) {}

  @Get()
  buscar(@Query() c: BuscarClientesDto) {
    return this.servicio.buscar(c);
  }

  @Get('por-documento/:documento')
  porDocumento(@Param('documento') documento: string) {
    return this.servicio.porDocumento(documento);
  }

  @Post()
  crear(@Body() dto: CrearClienteDto) {
    return this.servicio.crear(dto);
  }

  @Put(':id')
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualizarClienteDto) {
    return this.servicio.actualizar(id, dto);
  }
}

@ApiTags('facturacion')
@Controller('talonarios')
@Roles(Rol.GERENTE, Rol.CAJERO)
export class TalonariosController {
  constructor(private readonly servicio: TalonariosService) {}

  @Get()
  listar() {
    return this.servicio.listar();
  }

  /** Próxima factura y cuántas quedan. */
  @Get('estado')
  estado() {
    return this.servicio.estado();
  }

  @Post()
  @Roles(Rol.GERENTE)
  crear(@Body() dto: CrearTalonarioDto, @UsuarioActual() u: UsuarioSesion) {
    return this.servicio.crear(dto, u);
  }

  @Post(':id/desactivar')
  @HttpCode(200)
  @Roles(Rol.GERENTE)
  desactivar(@Param('id', ParseIntPipe) id: number) {
    return this.servicio.desactivar(id);
  }

  /** Anula la próxima hoja del talonario (dañada o mal llenada). */
  @Post('anular-siguiente')
  anularSiguiente(@Body() dto: AnularNumeroDto, @UsuarioActual() u: UsuarioSesion) {
    return this.servicio.anularSiguiente(dto, u);
  }

  @Get('anuladas')
  @Roles(Rol.GERENTE)
  anuladas() {
    return this.servicio.anuladas();
  }
}

@ApiTags('caja')
@Controller('caja')
@Roles(Rol.GERENTE, Rol.CAJERO)
export class CajaController {
  constructor(private readonly servicio: CajaService) {}

  /** Caja abierta del usuario con sus totales, o { sesion: null } si no tiene. */
  @Get('actual')
  async actual(@UsuarioActual() u: UsuarioSesion) {
    return (await this.servicio.actual(u)) ?? { sesion: null };
  }

  @Post('abrir')
  abrir(@Body() dto: AbrirCajaDto, @UsuarioActual() u: UsuarioSesion) {
    return this.servicio.abrir(dto, u);
  }

  @Post('movimientos')
  movimiento(@Body() dto: MovimientoCajaDto, @UsuarioActual() u: UsuarioSesion) {
    return this.servicio.movimiento(dto, u);
  }

  @Post('cerrar')
  @HttpCode(200)
  cerrar(@Body() dto: CerrarCajaDto, @UsuarioActual() u: UsuarioSesion) {
    return this.servicio.cerrar(dto, u);
  }

  @Get('sesiones')
  @Roles(Rol.GERENTE)
  sesiones(@Query() c: BuscarSesionesDto) {
    return this.servicio.sesiones(c);
  }

  @Get('sesiones/:id')
  detalle(@Param('id', ParseIntPipe) id: number, @UsuarioActual() u: UsuarioSesion) {
    return this.servicio.detalle(id, u);
  }
}

@ApiTags('ventas')
@Controller('ventas')
@Roles(Rol.GERENTE, Rol.CAJERO)
export class VentasController {
  constructor(private readonly servicio: VentasService) {}

  /** Calcula totales, IGTF y vuelto sin guardar nada. */
  @Post('cotizar')
  @HttpCode(200)
  cotizar(@Body() dto: CotizarVentaDto) {
    return this.servicio.cotizar(dto);
  }

  @Post()
  crear(@Body() dto: CrearVentaDto, @UsuarioActual() u: UsuarioSesion) {
    return this.servicio.crear(dto, u);
  }

  @Get()
  buscar(@Query() c: BuscarVentasDto, @UsuarioActual() u: UsuarioSesion) {
    return this.servicio.buscar(c, u);
  }

  @Get(':id')
  detalle(@Param('id', ParseIntPipe) id: number, @UsuarioActual() u: UsuarioSesion) {
    return this.servicio.detalle(id, u);
  }

  @Post(':id/anular')
  @HttpCode(200)
  anular(@Param('id', ParseIntPipe) id: number, @Body() dto: AnularVentaDto, @UsuarioActual() u: UsuarioSesion) {
    return this.servicio.anular(id, dto, u);
  }
}
