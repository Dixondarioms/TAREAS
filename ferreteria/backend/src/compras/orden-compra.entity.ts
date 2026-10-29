import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Proveedor } from '../proveedores/proveedor.entity';
import { Usuario } from '../usuarios/usuario.entity';
import { MonedaCompra } from './compra.entity';

export enum EstadoOrden {
  PENDIENTE = 'PENDIENTE',
  PARCIAL = 'PARCIAL',
  RECIBIDA = 'RECIBIDA',
  CANCELADA = 'CANCELADA',
}

/** Pedido a un proveedor antes de que llegue la mercancía. */
@Entity('ordenes_compra')
@Index('idx_ordenes_compra_proveedor', ['proveedorId'])
export class OrdenCompra {
  @PrimaryGeneratedColumn({ primaryKeyConstraintName: 'PK_ordenes_compra' })
  id: number;

  @Column()
  proveedorId: number;

  @ManyToOne(() => Proveedor, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'proveedor_id', foreignKeyConstraintName: 'fk_ordenes_compra_proveedor' })
  proveedor: Proveedor;

  @Column({ type: 'date' })
  fecha: string;

  @Column({ length: 3 })
  moneda: MonedaCompra;

  @Column({ type: 'enum', enum: EstadoOrden, enumName: 'estado_orden', default: EstadoOrden.PENDIENTE })
  estado: EstadoOrden;

  /** Estimado sin IVA, en la moneda de la orden. */
  @Column({ type: 'numeric', precision: 18, scale: 2 })
  subtotal: string;

  @Column({ type: 'text', nullable: true })
  notas: string | null;

  @Column()
  usuarioId: number;

  @ManyToOne(() => Usuario)
  @JoinColumn({ name: 'usuario_id', foreignKeyConstraintName: 'fk_ordenes_compra_usuario' })
  usuario: Usuario;

  @CreateDateColumn({ type: 'timestamptz' })
  creadoEn: Date;

  @OneToMany(() => OrdenCompraLinea, (l) => l.orden)
  lineas: OrdenCompraLinea[];
}

@Entity('ordenes_compra_lineas')
@Index('idx_ordenes_compra_lineas_orden', ['ordenId'])
export class OrdenCompraLinea {
  @PrimaryGeneratedColumn({ primaryKeyConstraintName: 'PK_ordenes_compra_lineas' })
  id: number;

  @Column()
  ordenId: number;

  @ManyToOne(() => OrdenCompra, (o) => o.lineas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orden_id', foreignKeyConstraintName: 'fk_ordenes_compra_lineas_orden' })
  orden: OrdenCompra;

  @Column()
  productoId: number;

  @Column({ length: 40 })
  codigo: string;

  @Column({ length: 200 })
  descripcion: string;

  @Column({ type: 'int', nullable: true })
  presentacionId: number | null;

  @Column({ length: 10 })
  unidad: string;

  @Column({ type: 'numeric', precision: 18, scale: 6 })
  factor: string;

  @Column({ type: 'numeric', precision: 18, scale: 3 })
  cantidad: string;

  /** Recibido hasta ahora, en la misma unidad. */
  @Column({ type: 'numeric', precision: 18, scale: 3, default: 0 })
  cantidadRecibida: string;

  /** Sin IVA, en la moneda de la orden, por la unidad pedida. */
  @Column({ type: 'numeric', precision: 18, scale: 4 })
  costoUnitario: string;
}
