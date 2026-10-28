import { IsBoolean, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Rol } from './rol.enum';

export class CrearUsuarioDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9._-]{3,40}$/, { message: 'usuario: 3 a 40 caracteres (letras, números, punto, guion)' })
  usuario: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  nombre: string;

  @IsString()
  @MinLength(8, { message: 'La clave debe tener al menos 8 caracteres' })
  @MaxLength(72)
  clave: string;

  @IsEnum(Rol)
  rol: Rol;
}

export class ActualizarUsuarioDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  nombre?: string;

  @IsOptional()
  @IsEnum(Rol)
  rol?: Rol;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  /** Restablece la clave del usuario. */
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'La clave debe tener al menos 8 caracteres' })
  @MaxLength(72)
  clave?: string;
}

export class CambiarClaveDto {
  @IsString()
  claveActual: string;

  @IsString()
  @MinLength(8, { message: 'La clave nueva debe tener al menos 8 caracteres' })
  @MaxLength(72)
  claveNueva: string;
}
