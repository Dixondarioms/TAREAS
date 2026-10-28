import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ConsultaPaginada } from '../comun/paginacion';
import { EsRif } from '../comun/validadores';

export class CrearProveedorDto {
  @EsRif()
  rif: string;

  @IsString()
  @MinLength(2)
  @MaxLength(150)
  razonSocial: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  contacto?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  telefono?: string | null;

  @IsOptional()
  @IsEmail({}, { message: 'Correo inválido' })
  @MaxLength(120)
  correo?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  direccion?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notas?: string | null;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class ActualizarProveedorDto extends PartialType(CrearProveedorDto) {}

export class BuscarProveedoresDto extends ConsultaPaginada {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}
