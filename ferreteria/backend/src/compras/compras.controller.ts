import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles, UsuarioActual, UsuarioSesion } from '../comun/decoradores';
import { Rol } from '../usuarios/rol.enum';
import {
  AnularCompraDto,
  BuscarComprasDto,
  BuscarOrdenesDto,
  CrearCompraDto,
  CrearOrdenDto,
  PagoProveedorDto,
  SugerenciaOrdenDto,
} from './compras.dto';
import { ComprasService } from './compras.service';
import { OrdenesService } from './ordenes.service';

@ApiTags('compras')
@Controller('compras')
@Roles(Rol.GERENTE, Rol.ALMACEN)
export class ComprasController {
  constructor(
    private readonly servicio: ComprasService,
    private readonly ordenes: OrdenesService,
  ) {}

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

  // Órdenes de compra: van antes de ':id' para que no las tome esa ruta.

  @Post('ordenes')
  crearOrden(@Body() dto: CrearOrdenDto, @UsuarioActual() u: UsuarioSesion) {
    return this.ordenes.crear(dto, u);
  }

  @Get('ordenes')
  buscarOrdenes(@Query() c: BuscarOrdenesDto) {
    return this.ordenes.buscar(c);
  }

  /** Productos del proveedor bajo el mínimo, con la cantidad a pedir. */
  @Get('ordenes/sugerencia')
  sugerencia(@Query() c: SugerenciaOrdenDto) {
    return this.ordenes.sugerencia(c);
  }

  @Get('ordenes/:id')
  detalleOrden(@Param('id', ParseIntPipe) id: number) {
    return this.ordenes.detalle(id);
  }

  @Post('ordenes/:id/cancelar')
  cancelarOrden(@Param('id', ParseIntPipe) id: number) {
    return this.ordenes.cancelar(id);
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

  /** Compra registrada por error: revierte inventario, costos, libro y orden. */
  @Post(':id/anular')
  @Roles(Rol.GERENTE)
  anular(@Param('id', ParseIntPipe) id: number, @Body() dto: AnularCompraDto, @UsuarioActual() u: UsuarioSesion) {
    return this.servicio.anular(id, dto.motivo, u);
  }
}
