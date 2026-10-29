import { IsEnum, IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { EsDecimal } from '../comun/validadores';
import { TipoDocumentoCompra } from './factura-compra.entity';

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

export class ConsultaMesDto {
  /** AAAA-MM */
  @Matches(MES, { message: 'mes debe tener el formato AAAA-MM' })
  mes: string;
}

export class CrearFacturaCompraDto {
  @IsInt()
  proveedorId: number;

  @IsOptional()
  @IsEnum(TipoDocumentoCompra)
  tipo?: TipoDocumentoCompra;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fecha debe tener el formato AAAA-MM-DD' })
  fecha: string;

  @IsString()
  @MinLength(1)
  @MaxLength(30)
  numero: string;

  @IsString()
  @MinLength(1)
  @MaxLength(30)
  numeroControl: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  facturaAfectada?: string;

  @IsOptional()
  @EsDecimal({ min: '0', decimales: 2 })
  baseExentaBs?: string;

  @IsOptional()
  @EsDecimal({ min: '0', decimales: 2 })
  baseGeneralBs?: string;

  @IsOptional()
  @EsDecimal({ min: '0', decimales: 2 })
  ivaGeneralBs?: string;

  @IsOptional()
  @EsDecimal({ min: '0', decimales: 2 })
  baseReducidaBs?: string;

  @IsOptional()
  @EsDecimal({ min: '0', decimales: 2 })
  ivaReducidaBs?: string;

  /** Solo si la empresa es agente de retención: 75 (general) o 100. */
  @IsOptional()
  @IsIn([75, 100])
  porcentajeRetencion?: 75 | 100;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notas?: string;
}

export class ConsultaQuincenaDto extends ConsultaMesDto {
  /** 1: del 1 al 15; 2: del 16 al fin de mes. */
  @IsOptional()
  @IsIn(['1', '2'], { message: 'quincena debe ser 1 o 2' })
  quincena?: '1' | '2';
}
