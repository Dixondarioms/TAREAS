import { IsBoolean, IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { EsDecimal } from '../../comun/validadores';

export class UnidadDto {
  @IsString()
  @Matches(/^[A-Za-z0-9]{1,10}$/, { message: 'codigo: hasta 10 letras o números' })
  codigo: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  nombre: string;

  @IsOptional()
  @IsBoolean()
  permiteDecimales?: boolean;
}

export class CategoriaDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  nombre: string;

  @IsOptional()
  @IsInt()
  padreId?: number | null;
}

export class MarcaDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  nombre: string;
}

export class ListaPrecioDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_]{1,20}$/, { message: 'codigo: hasta 20 letras, números o _' })
  codigo: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  nombre: string;

  @EsDecimal({ min: '-99.9999', decimales: 4 })
  margenPorDefecto: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  orden?: number;

  @IsOptional()
  @IsBoolean()
  activa?: boolean;
}
