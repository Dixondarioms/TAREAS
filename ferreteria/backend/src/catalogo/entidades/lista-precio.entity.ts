import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Lista de precios: público, mayorista, contratista… */
@Entity('listas_precio')
export class ListaPrecio {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 20, unique: true })
  codigo: string;

  @Column({ length: 60 })
  nombre: string;

  /** Margen (%) sobre el costo que se asigna a productos nuevos. */
  @Column({ type: 'numeric', precision: 9, scale: 4 })
  margenPorDefecto: string;

  @Column({ type: 'int', default: 0 })
  orden: number;

  @Column({ default: true })
  activa: boolean;
}
