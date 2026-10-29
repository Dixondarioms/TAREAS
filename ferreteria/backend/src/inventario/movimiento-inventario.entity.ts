import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Producto } from '../catalogo/entidades/producto.entity';
import { Usuario } from '../usuarios/usuario.entity';

export enum TipoMovimiento {
  /** Ajuste manual de entrada (mercancía encontrada, devolución a proveedor anulada, etc.). */
  ENTRADA = 'ENTRADA',
  /** Ajuste manual de salida (consumo interno, préstamo, etc.). */
  SALIDA = 'SALIDA',
  /** Mercancía dañada, vencida o extraviada. */
  MERMA = 'MERMA',
  /** Diferencia encontrada en un conteo físico (también la carga inicial). */
  CONTEO = 'CONTEO',
  /** Reservados para los módulos de compras y punto de venta. */
  COMPRA = 'COMPRA',
  VENTA = 'VENTA',
  DEVOLUCION = 'DEVOLUCION',
}

/**
 * Kardex: cada cambio de existencia queda registrado y nunca se modifica.
 * Una corrección es otro movimiento.
 */
@Entity('movimientos_inventario')
@Index('idx_movimientos_producto', ['productoId', 'id'])
export class MovimientoInventario {
  @PrimaryGeneratedColumn({ primaryKeyConstraintName: 'PK_movimientos_inventario' })
  id: number;

  @Column()
  productoId: number;

  @ManyToOne(() => Producto, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'producto_id', foreignKeyConstraintName: 'fk_movimientos_producto' })
  producto: Producto;

  @Column({ type: 'enum', enum: TipoMovimiento, enumName: 'tipo_movimiento' })
  tipo: TipoMovimiento;

  /** Positiva si entra mercancía, negativa si sale; en la unidad base del producto. */
  @Column({ type: 'numeric', precision: 18, scale: 3 })
  cantidad: string;

  /** Existencia del producto después de este movimiento. */
  @Column({ type: 'numeric', precision: 18, scale: 3 })
  existenciaResultante: string;

  /** Costo unitario en USD del producto al momento del movimiento (para valorizar). */
  @Column({ type: 'numeric', precision: 18, scale: 4 })
  costoUsd: string;

  @Column({ length: 200 })
  motivo: string;

  /** Documento relacionado: número de conteo, factura, etc. */
  @Column({ type: 'varchar', length: 60, nullable: true })
  referencia: string | null;

  @Column({ type: 'int', nullable: true })
  usuarioId: number | null;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'usuario_id', foreignKeyConstraintName: 'fk_movimientos_usuario' })
  usuario: Usuario | null;

  @CreateDateColumn({ type: 'timestamptz' })
  creadoEn: Date;
}
