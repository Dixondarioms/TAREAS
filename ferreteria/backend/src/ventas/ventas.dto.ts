import { PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ConsultaPaginada } from '../comun/paginacion';
import { EsDecimal, EsRif } from '../comun/validadores';
import { EstadoVenta } from './entidades/venta.entity';
import { TipoMovimientoCaja } from './entidades/movimiento-caja.entity';
import { TipoDocumento } from './entidades/talonario.entity';
import { METODOS_EFECTIVO, MetodoPago } from './metodos-pago';

// ------------------------------------------------------------------ clientes

export class CrearClienteDto {
  @EsRif()
  documento: string;

  @IsString()
  @MinLength(2)
  @MaxLength(150)
  nombre: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  direccion?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  telefono?: string | null;
}

export class ActualizarClienteDto extends PartialType(CrearClienteDto) {}

export class BuscarClientesDto extends ConsultaPaginada {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

// ------------------------------------------------------------------ talonarios

export class CrearTalonarioDto {
  @IsOptional()
  @IsEnum(TipoDocumento)
  tipo?: TipoDocumento;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9-]{0,10}$/, { message: 'serie: hasta 10 letras o números' })
  serie?: string;

  @IsInt()
  @Min(1)
  numeroDesde: number;

  @IsInt()
  @Min(1)
  numeroHasta: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  controlPrefijo?: string;

  @IsInt()
  @Min(1)
  controlDesde: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  digitos?: number;
}

export class AnularNumeroDto {
  @IsOptional()
  @IsEnum(TipoDocumento)
  tipo?: TipoDocumento;

  @IsString()
  @MinLength(3, { message: 'Indique por qué se anula la factura' })
  @MaxLength(200)
  motivo: string;
}

// ------------------------------------------------------------------ caja

export class AbrirCajaDto {
  @EsDecimal({ min: '0', decimales: 2 })
  fondoBs: string;

  @EsDecimal({ min: '0', decimales: 2 })
  fondoUsd: string;
}

export class MovimientoCajaDto {
  @IsEnum(TipoMovimientoCaja)
  tipo: TipoMovimientoCaja;

  @IsIn(METODOS_EFECTIVO, { message: 'Solo se registran movimientos de efectivo (EFECTIVO_BS o EFECTIVO_USD)' })
  metodo: MetodoPago;

  @EsDecimal({ min: '0.01', decimales: 2 })
  monto: string;

  @IsString()
  @MinLength(3, { message: 'Indique el motivo' })
  @MaxLength(200)
  motivo: string;
}

export class CerrarCajaDto {
  /** Lo contado por método de pago, en la moneda del método. */
  @IsObject()
  contado: Record<string, string>;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observaciones?: string;
}

export class BuscarSesionesDto extends ConsultaPaginada {}

// ------------------------------------------------------------------ ventas

export class LineaVentaDto {
  @IsInt()
  productoId: number;

  /** Si se vende por presentación (caja, rollo...). */
  @IsOptional()
  @IsInt()
  presentacionId?: number | null;

  @EsDecimal({ min: '0.001', decimales: 3 })
  cantidad: string;
}

export class PagoVentaDto {
  @IsEnum(MetodoPago)
  metodo: MetodoPago;

  @EsDecimal({ min: '0.01', decimales: 2 })
  monto: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  referencia?: string;
}

export class CrearVentaDto {
  @IsOptional()
  @IsInt()
  clienteId?: number | null;

  @IsOptional()
  @IsInt()
  listaId?: number;

  @IsArray()
  @ArrayMinSize(1, { message: 'Agregue al menos un producto' })
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => LineaVentaDto)
  lineas: LineaVentaDto[];

  @IsArray()
  @ArrayMinSize(1, { message: 'Registre al menos un pago' })
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => PagoVentaDto)
  pagos: PagoVentaDto[];

  /** Cómo se entrega el vuelto, si sobra dinero. Por defecto, efectivo en Bs. */
  @IsOptional()
  @IsEnum(MetodoPago)
  vueltoMetodo?: MetodoPago;
}

/** Igual que la venta, sin pagos obligatorios: para mostrar totales mientras se arma. */
export class CotizarVentaDto {
  @IsOptional()
  @IsInt()
  listaId?: number;

  @IsArray()
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => LineaVentaDto)
  lineas: LineaVentaDto[];

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => PagoVentaDto)
  pagos: PagoVentaDto[];

  @IsOptional()
  @IsEnum(MetodoPago)
  vueltoMetodo?: MetodoPago;
}

export class AnularVentaDto {
  @IsString()
  @MinLength(3, { message: 'Indique el motivo de la anulación' })
  @MaxLength(200)
  motivo: string;
}

const aEntero = ({ value }: { value: unknown }) => (value === undefined || value === '' ? undefined : Number(value));

export class BuscarVentasDto extends ConsultaPaginada {
  /** Fecha AAAA-MM-DD (hora de Venezuela). */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  desde?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  hasta?: string;

  @IsOptional()
  @Transform(aEntero)
  @IsInt()
  sesionId?: number;

  @IsOptional()
  @IsEnum(EstadoVenta)
  estado?: EstadoVenta;

  /** Número de factura o documento/nombre del cliente. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

// ------------------------------------------------------------------ notas de crédito

export class LineaNotaCreditoDto {
  @IsInt()
  ventaLineaId: number;

  /** En la unidad en que se vendió la línea. */
  @EsDecimal({ min: '0.001', decimales: 3 })
  cantidad: string;
}

export class CrearNotaCreditoDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Indique qué se devuelve' })
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => LineaNotaCreditoDto)
  lineas: LineaNotaCreditoDto[];

  @IsString()
  @MinLength(3, { message: 'Indique el motivo de la nota de crédito' })
  @MaxLength(200)
  motivo: string;

  /** false si la mercancía llegó dañada y no vuelve a la venta. */
  @IsBoolean()
  devolverInventario: boolean;

  @IsEnum(MetodoPago)
  reintegroMetodo: MetodoPago;
}
