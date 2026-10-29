import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
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
import { ConsultaPaginada } from '../comun/paginacion';
import { EsDecimal } from '../comun/validadores';
import { MetodoPago } from '../ventas/metodos-pago';
import { CondicionCompra } from './compra.entity';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export class LineaCompraDto {
  @IsInt()
  productoId: number;

  /** Si llega por presentación (caja, rollo...). */
  @IsOptional()
  @IsInt()
  presentacionId?: number | null;

  @EsDecimal({ min: '0.001', decimales: 3 })
  cantidad: string;

  /** Sin IVA, en la moneda de la compra, por la unidad recibida. */
  @EsDecimal({ min: '0', decimales: 4 })
  costoUnitario: string;
}

export class CrearCompraDto {
  @IsInt()
  proveedorId: number;

  @Matches(FECHA, { message: 'fecha debe tener el formato AAAA-MM-DD' })
  fecha: string;

  @IsString()
  @MinLength(1)
  @MaxLength(30)
  numero: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  numeroControl?: string;

  @IsIn(['BS', 'USD'])
  moneda: 'BS' | 'USD';

  /** Bs por USD. Si se omite, se usa la tasa BCV vigente. */
  @IsOptional()
  @EsDecimal({ min: '0.00000001', decimales: 8 })
  tasa?: string;

  @IsEnum(CondicionCompra)
  condicion: CondicionCompra;

  @IsOptional()
  @Matches(FECHA, { message: 'vencimiento debe tener el formato AAAA-MM-DD' })
  vencimiento?: string;

  /** Registrar el documento en el libro de compras (false para notas de entrega sin factura). */
  @IsBoolean()
  facturaFiscal: boolean;

  /** Actualizar el costo de reposición de los productos (solo gerencia). */
  @IsBoolean()
  actualizarCostos: boolean;

  @IsArray()
  @ArrayMinSize(1, { message: 'Agregue al menos un producto' })
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => LineaCompraDto)
  lineas: LineaCompraDto[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notas?: string;
}

export class PagoProveedorDto {
  @Matches(FECHA, { message: 'fecha debe tener el formato AAAA-MM-DD' })
  fecha: string;

  @IsEnum(MetodoPago)
  metodo: MetodoPago;

  /** En la moneda de la compra. */
  @EsDecimal({ min: '0.01', decimales: 2 })
  monto: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  referencia?: string;
}

const aEntero = ({ value }: { value: unknown }) => (value === undefined || value === '' ? undefined : Number(value));

export class BuscarComprasDto extends ConsultaPaginada {
  @IsOptional()
  @Transform(aEntero)
  @IsInt()
  proveedorId?: number;

  /** pendientes: con saldo por pagar. */
  @IsOptional()
  @IsIn(['pendientes', 'pagadas'])
  pago?: 'pendientes' | 'pagadas';

  /** Número de documento o proveedor. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}
