import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles, UsuarioActual, UsuarioSesion } from '../comun/decoradores';
import { Rol } from '../usuarios/rol.enum';
import { CajaService } from './caja.service';
import { TipoDocumento } from './entidades/talonario.entity';
import { ClientesService } from './clientes.service';
import { CobranzaService } from './cobranza.service';
import { NotasCreditoService } from './notas-credito.service';
import { CrearNotaDebitoDto, NotasDebitoService } from './notas-debito.service';
import { TalonariosService } from './talonarios.service';
import {
  AbonoClienteDto,
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
  CrearNotaCreditoDto,
  CrearTalonarioDto,
  CrearVentaDto,
  MovimientoCajaDto,
} from './ventas.dto';
import { VentasService } from './ventas.service';

@ApiTags('clientes')
@Controller('clientes')
@Roles(Rol.GERENTE, Rol.CAJERO)
export class ClientesController {
  constructor(
    private readonly servicio: ClientesService,
    private readonly cobranza: CobranzaService,
  ) {}

  @Get()
  buscar(@Query() c: BuscarClientesDto) {
    return this.servicio.buscar(c);
  }

  @Get('por-documento/:documento')
  porDocumento(@Param('documento') documento: string) {
    return this.servicio.porDocumento(documento);
  }

  @Post()
  crear(@Body() dto: CrearClienteDto, @UsuarioActual() u: UsuarioSesion) {
    return this.servicio.crear(dto, u);
  }

  @Put(':id')
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualizarClienteDto, @UsuarioActual() u: UsuarioSesion) {
    return this.servicio.actualizar(id, dto, u);
  }

  /** Clientes que deben, del más atrasado al más al día. */
  @Get('por-cobrar')
  @Roles(Rol.GERENTE)
  porCobrar() {
    return this.cobranza.porCobrar();
  }

  /** Deuda, cuentas y abonos del cliente. */
  @Get(':id/estado-cuenta')
  estadoCuenta(@Param('id', ParseIntPipe) id: number) {
    return this.cobranza.estadoCuenta(id);
  }

  /** Abono a la deuda: el dinero entra a la caja abierta de quien lo recibe. */
  @Post(':id/abonos')
  abonar(@Param('id', ParseIntPipe) id: number, @Body() dto: AbonoClienteDto, @UsuarioActual() u: UsuarioSesion) {
    return this.cobranza.abonar(id, dto, u);
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

  /** Próxima factura (o nota de crédito con ?tipo=NOTA_CREDITO) y cuántas quedan. */
  @Get('estado')
  estado(@Query('tipo') tipo?: string) {
    const tipos = Object.values(TipoDocumento) as string[];
    return this.servicio.estado(tipo && tipos.includes(tipo) ? (tipo as TipoDocumento) : TipoDocumento.FACTURA);
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
  constructor(
    private readonly servicio: VentasService,
    private readonly notas: NotasCreditoService,
    private readonly debitos: NotasDebitoService,
  ) {}

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

  /** Devolución total o parcial: nota de crédito con reintegro desde la caja abierta. */
  @Post(':id/notas-credito')
  notaCredito(@Param('id', ParseIntPipe) id: number, @Body() dto: CrearNotaCreditoDto, @UsuarioActual() u: UsuarioSesion) {
    return this.notas.crear(id, dto, u);
  }

  /** Cargo adicional sobre la factura, cobrado en la caja abierta. */
  @Post(':id/notas-debito')
  notaDebito(@Param('id', ParseIntPipe) id: number, @Body() dto: CrearNotaDebitoDto, @UsuarioActual() u: UsuarioSesion) {
    return this.debitos.crear(id, dto, u);
  }

  @Get(':id/notas-debito')
  async notasDebitoDeVenta(@Param('id', ParseIntPipe) id: number, @UsuarioActual() u: UsuarioSesion) {
    await this.servicio.detalle(id, u);
    return this.debitos.deVenta(id);
  }

  @Get(':id/notas-credito')
  async notasDeVenta(@Param('id', ParseIntPipe) id: number, @UsuarioActual() u: UsuarioSesion) {
    await this.servicio.detalle(id, u); // valida que pueda ver la venta
    return this.notas.deVenta(id);
  }
}
