import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ConsultaPaginada } from '../comun/paginacion';
import { EsDecimal } from '../comun/validadores';
import { TipoMovimiento } from './movimiento-inventario.entity';

export const TIPOS_AJUSTE = [TipoMovimiento.ENTRADA, TipoMovimiento.SALIDA, TipoMovimiento.MERMA] as const;
export type TipoAjuste = (typeof TIPOS_AJUSTE)[number];

export class AjusteInventarioDto {
  @IsInt()
  productoId: number;

  @IsIn(TIPOS_AJUSTE, { message: 'tipo debe ser ENTRADA, SALIDA o MERMA' })
  tipo: TipoAjuste;

  /** Siempre positiva; el tipo indica si entra o sale. */
  @EsDecimal({ min: '0.001', decimales: 3 })
  cantidad: string;

  @IsString()
  @MinLength(3, { message: 'Indique el motivo del ajuste' })
  @MaxLength(200)
  motivo: string;
}

export class LineaConteoDto {
  @IsInt()
  productoId: number;

  /** Cantidad contada físicamente, en unidad base. */
  @EsDecimal({ min: '0', decimales: 3 })
  contado: string;
}

export class ConteoDto {
  /** Por ejemplo «Conteo pasillo 3». Si se omite, se genera con la fecha y hora. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  referencia?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Agregue al menos un producto al conteo' })
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => LineaConteoDto)
  lineas: LineaConteoDto[];
}

export class ConsultaMovimientosDto extends ConsultaPaginada {}
