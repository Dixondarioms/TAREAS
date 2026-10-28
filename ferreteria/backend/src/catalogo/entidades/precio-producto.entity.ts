import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { ListaPrecio } from './lista-precio.entity';
import { Producto } from './producto.entity';

export enum ModoPrecio {
  /** El precio se recalcula solo cuando cambia el costo (costo × (1 + margen)). */
  MARGEN = 'MARGEN',
  /** El precio queda fijo aunque cambie el costo. */
  FIJO = 'FIJO',
}

/** Precio de venta en USD por unidad base, sin IVA, para una lista. */
@Entity('precios_producto')
@Unique(['productoId', 'listaId'])
export class PrecioProducto {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  productoId: number;

  @ManyToOne(() => Producto, (p) => p.precios, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'producto_id' })
  producto: Producto;

  @Column()
  listaId: number;

  @ManyToOne(() => ListaPrecio, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'lista_id' })
  lista: ListaPrecio;

  @Column({ type: 'enum', enum: ModoPrecio, enumName: 'modo_precio', default: ModoPrecio.MARGEN })
  modo: ModoPrecio;

  @Column({ type: 'numeric', precision: 9, scale: 4, nullable: true })
  margen: string | null;

  @Column({ type: 'numeric', precision: 18, scale: 4 })
  precioUsd: string;

  @UpdateDateColumn({ type: 'timestamptz' })
  actualizadoEn: Date;
}
