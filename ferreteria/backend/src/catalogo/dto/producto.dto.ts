import { PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ConsultaPaginada } from '../../comun/paginacion';
import { EsDecimal } from '../../comun/validadores';
import { ModoPrecio } from '../entidades/precio-producto.entity';
import { AlicuotaIva } from '../entidades/producto.entity';

const PATRON_CODIGO_BARRAS = /^[0-9A-Za-z.\-]{3,50}$/;
const MENSAJE_CODIGO_BARRAS = 'Código de barras inválido (3 a 50 letras, números, punto o guion)';

export class PresentacionDto {
  @IsInt()
  unidadId: number;

  @EsDecimal({ min: '0.000001', decimales: 6 })
  factor: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @Matches(PATRON_CODIGO_BARRAS, { each: true, message: MENSAJE_CODIGO_BARRAS })
  codigosBarras?: string[];
}

export class PrecioDto {
  @IsInt()
  listaId: number;

  @IsEnum(ModoPrecio)
  modo: ModoPrecio;

  /** Obligatorio en modo MARGEN. */
  @IsOptional()
  @EsDecimal({ min: '-99.9999', decimales: 4 })
  margen?: string;

  /** Obligatorio en modo FIJO (USD por unidad base, sin IVA). */
  @IsOptional()
  @EsDecimal({ min: '0', decimales: 4 })
  precioUsd?: string;
}

export class ProveedorDeProductoDto {
  @IsInt()
  proveedorId: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  codigoProveedor?: string | null;

  @IsOptional()
  @EsDecimal({ min: '0', decimales: 4 })
  costoUsd?: string | null;
}

export class CrearProductoDto {
  @IsString()
  @Matches(/^[0-9A-Za-z./\-_#]{1,40}$/, { message: 'codigo: 1 a 40 caracteres sin espacios' })
  codigo: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  descripcion: string;

  @IsOptional()
  @IsInt()
  categoriaId?: number | null;

  @IsOptional()
  @IsInt()
  marcaId?: number | null;

  @IsInt()
  unidadBaseId: number;

  @IsOptional()
  @EsDecimal({ min: '0', decimales: 4 })
  costoUsd?: string;

  @IsOptional()
  @IsEnum(AlicuotaIva)
  alicuotaIva?: AlicuotaIva;

  @IsOptional()
  @EsDecimal({ min: '0', decimales: 3 })
  stockMinimo?: string;

  @IsOptional()
  @EsDecimal({ min: '0', decimales: 3 })
  stockMaximo?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  ubicacion?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notas?: string | null;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  /** Códigos de barras de la unidad base. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @Matches(PATRON_CODIGO_BARRAS, { each: true, message: MENSAJE_CODIGO_BARRAS })
  codigosBarras?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => PresentacionDto)
  presentaciones?: PresentacionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrecioDto)
  precios?: PrecioDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ProveedorDeProductoDto)
  proveedores?: ProveedorDeProductoDto[];
}

export class ActualizarProductoDto extends PartialType(CrearProductoDto) {
  /** Se guarda en el historial cuando cambia el costo. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  motivoCambioCosto?: string;
}

const aEntero = ({ value }: { value: unknown }) => (value === undefined || value === '' ? undefined : Number(value));

export class BuscarProductosDto extends ConsultaPaginada {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Transform(aEntero)
  @IsInt()
  categoriaId?: number;

  @IsOptional()
  @Transform(aEntero)
  @IsInt()
  marcaId?: number;

  @IsOptional()
  @Transform(aEntero)
  @IsInt()
  proveedorId?: number;

  /** Lista de precios a mostrar (por defecto la primera activa). */
  @IsOptional()
  @Transform(aEntero)
  @IsInt()
  listaId?: number;

  @IsOptional()
  @IsIn(['activos', 'inactivos', 'todos'])
  estado?: 'activos' | 'inactivos' | 'todos';

  /** bajo-minimo: existencia igual o menor al mínimo (si tiene mínimo definido). */
  @IsOptional()
  @IsIn(['bajo-minimo', 'sin-existencia', 'con-existencia'])
  existencia?: 'bajo-minimo' | 'sin-existencia' | 'con-existencia';
}
