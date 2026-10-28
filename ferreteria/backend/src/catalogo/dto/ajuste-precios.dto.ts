import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { EsDecimal } from '../../comun/validadores';

export class FiltroAjusteDto {
  @IsOptional() @IsInt() categoriaId?: number;
  @IsOptional() @IsInt() marcaId?: number;
  @IsOptional() @IsInt() proveedorId?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(5000) @IsInt({ each: true }) productoIds?: number[];
}

export class AjustePreciosDto {
  @ValidateNested()
  @Type(() => FiltroAjusteDto)
  filtro: FiltroAjusteDto;

  /**
   * COSTO: sube/baja el costo (los precios por margen se recalculan solos).
   * PRECIO: sube/baja directamente el precio de venta de una o todas las listas.
   */
  @IsIn(['COSTO', 'PRECIO'])
  objetivo: 'COSTO' | 'PRECIO';

  /** Porcentaje de ajuste: "12.5" sube 12,5 %, "-5" baja 5 %. */
  @EsDecimal({ min: '-90', max: '1000', decimales: 4 })
  porcentaje: string;

  /** Solo para objetivo PRECIO; si se omite, se ajustan todas las listas. */
  @IsOptional()
  @IsInt()
  listaId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  motivo?: string;

  /** Si es verdadero solo calcula y devuelve la vista previa, sin guardar. */
  @IsOptional()
  @IsBoolean()
  simular?: boolean;
}
