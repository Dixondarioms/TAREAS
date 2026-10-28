import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsObject, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Roles } from '../comun/decoradores';
import { Rol } from '../usuarios/rol.enum';
import { ConfiguracionService } from './configuracion.service';

class EmpresaDto {
  @IsOptional() @IsString() @MaxLength(150) razonSocial?: string;
  @IsOptional() @IsString() @MaxLength(15) rif?: string;
  @IsOptional() @IsString() @MaxLength(300) direccion?: string;
  @IsOptional() @IsString() @MaxLength(60) telefono?: string;
  @IsOptional() @IsBoolean() contribuyenteEspecial?: boolean;
}

class RedondeoDto {
  @IsOptional() @IsString() multiplo?: string;
  @IsOptional() @IsIn(['CERCANO', 'ARRIBA']) modo?: 'CERCANO' | 'ARRIBA';
}

class ActualizarConfiguracionDto {
  @IsOptional() @ValidateNested() @Type(() => EmpresaDto) empresa?: EmpresaDto;
  @IsOptional() @ValidateNested() @Type(() => RedondeoDto) redondeoBs?: RedondeoDto;
  @IsOptional() @IsObject() alicuotasIva?: Record<string, string>;
}

@ApiTags('configuración')
@Controller('configuracion')
export class ConfiguracionController {
  constructor(private readonly servicio: ConfiguracionService) {}

  @Get()
  obtener() {
    return this.servicio.obtenerTodo();
  }

  @Put()
  @Roles(Rol.ADMIN)
  actualizar(@Body() dto: ActualizarConfiguracionDto) {
    return this.servicio.actualizar(dto as never);
  }
}
