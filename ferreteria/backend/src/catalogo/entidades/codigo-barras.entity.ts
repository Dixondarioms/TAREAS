import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Presentacion } from './presentacion.entity';
import { Producto } from './producto.entity';

@Entity('codigos_barras')
export class CodigoBarras {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 50, unique: true })
  codigo: string;

  @Column()
  productoId: number;

  @ManyToOne(() => Producto, (p) => p.codigosBarras, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'producto_id' })
  producto: Producto;

  /** Nulo = el código corresponde a la unidad base. */
  @Column({ type: 'int', nullable: true })
  presentacionId: number | null;

  @ManyToOne(() => Presentacion, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'presentacion_id' })
  presentacion: Presentacion | null;
}
