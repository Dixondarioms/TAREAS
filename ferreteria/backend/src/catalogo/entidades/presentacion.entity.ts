import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Producto } from './producto.entity';
import { UnidadMedida } from './unidad-medida.entity';

/**
 * Otra forma de vender o comprar el producto, expresada en unidades base.
 * Ej.: tornillo (base UND) → CAJA con factor 100; cable (base M) → ROLLO con factor 100.
 */
@Entity('presentaciones')
@Unique(['productoId', 'unidadId'])
export class Presentacion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  productoId: number;

  @ManyToOne(() => Producto, (p) => p.presentaciones, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'producto_id' })
  producto: Producto;

  @Column()
  unidadId: number;

  @ManyToOne(() => UnidadMedida, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'unidad_id' })
  unidad: UnidadMedida;

  /** Cuántas unidades base contiene una unidad de esta presentación. */
  @Column({ type: 'numeric', precision: 18, scale: 6 })
  factor: string;
}
