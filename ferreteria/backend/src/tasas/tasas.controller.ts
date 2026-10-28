import { Body, Controller, Get, ParseEnumPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsDateString, IsEnum } from 'class-validator';
import { Roles, UsuarioActual, UsuarioSesion } from '../comun/decoradores';
import { EsDecimal } from '../comun/validadores';
import { Rol } from '../usuarios/rol.enum';
import { Moneda } from './tasa-cambio.entity';
import { TasasService } from './tasas.service';

class RegistrarTasaDto {
  @IsEnum(Moneda) moneda: Moneda;
  @EsDecimal({ min: '0.00000001', decimales: 8 }) valor: string;
  @IsDateString({ strict: true }) fechaValor: string;
}

@ApiTags('tasas de cambio')
@Controller('tasas')
export class TasasController {
  constructor(private readonly servicio: TasasService) {}

  /** Tasas vigentes hoy y, si ya se publicó, la del próximo día hábil. */
  @Get('estado')
  estado() {
    return this.servicio.estado();
  }

  @Get()
  historial(@Query('moneda', new ParseEnumPipe(Moneda, { optional: true })) moneda?: Moneda) {
    return this.servicio.historial(moneda ?? Moneda.USD);
  }

  @Post()
  @Roles(Rol.GERENTE)
  registrar(@Body() dto: RegistrarTasaDto, @UsuarioActual() u: UsuarioSesion) {
    return this.servicio.registrarManual(dto.moneda, dto.valor, dto.fechaValor.slice(0, 10), u.id);
  }

  @Post('actualizar-bcv')
  @Roles(Rol.GERENTE)
  actualizarBcv(@UsuarioActual() u: UsuarioSesion) {
    return this.servicio.actualizarDesdeBcv(u.id);
  }
}
