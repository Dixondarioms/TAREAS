import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { Producto } from '../catalogo/entidades/producto.entity';
import { Proveedor } from './proveedor.entity';

/** Qué proveedores surten un producto, con su código y último costo. */
@Entity('productos_proveedores')
@Unique(['productoId', 'proveedorId'])
@Index(['proveedorId', 'codigoProveedor'])
export class ProductoProveedor {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  productoId: number;

  @ManyToOne(() => Producto, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'producto_id' })
  producto: Producto;

  @Column()
  proveedorId: number;

  @ManyToOne(() => Proveedor, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'proveedor_id' })
  proveedor: Proveedor;

  @Column({ type: 'varchar', length: 60, nullable: true })
  codigoProveedor: string | null;

  @Column({ type: 'numeric', precision: 18, scale: 4, nullable: true })
  costoUsd: string | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  actualizadoEn: Date;
}
