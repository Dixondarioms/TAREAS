import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Categoria } from './categoria.entity';
import { CodigoBarras } from './codigo-barras.entity';
import { Marca } from './marca.entity';
import { PrecioProducto } from './precio-producto.entity';
import { Presentacion } from './presentacion.entity';
import { UnidadMedida } from './unidad-medida.entity';

export enum AlicuotaIva {
  GENERAL = 'GENERAL',
  REDUCIDA = 'REDUCIDA',
  EXENTO = 'EXENTO',
}

@Entity('productos')
export class Producto {
  @PrimaryGeneratedColumn()
  id: number;

  /** Código interno de la ferretería (único). */
  @Column({ length: 40, unique: true })
  codigo: string;

  @Column({ length: 200 })
  descripcion: string;

  @Column({ type: 'int', nullable: true })
  categoriaId: number | null;

  @ManyToOne(() => Categoria, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'categoria_id' })
  categoria: Categoria | null;

  @Column({ type: 'int', nullable: true })
  marcaId: number | null;

  @ManyToOne(() => Marca, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'marca_id' })
  marca: Marca | null;

  /** Unidad en la que se lleva el inventario y se expresan costo y precios. */
  @Column()
  unidadBaseId: number;

  @ManyToOne(() => UnidadMedida, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'unidad_base_id' })
  unidadBase: UnidadMedida;

  /** Costo de reposición en USD por unidad base, sin IVA. */
  @Column({ type: 'numeric', precision: 18, scale: 4, default: 0 })
  costoUsd: string;

  @Column({ type: 'timestamptz', nullable: true })
  costoActualizadoEn: Date | null;

  @Column({ type: 'enum', enum: AlicuotaIva, enumName: 'alicuota_iva', default: AlicuotaIva.GENERAL })
  alicuotaIva: AlicuotaIva;

  /** Existencia en unidad base. Solo cambia con movimientos de inventario (kardex). */
  @Column({ type: 'numeric', precision: 18, scale: 3, default: 0 })
  existencia: string;

  @Column({ type: 'numeric', precision: 18, scale: 3, default: 0 })
  stockMinimo: string;

  @Column({ type: 'numeric', precision: 18, scale: 3, nullable: true })
  stockMaximo: string | null;

  /** Ubicación física: pasillo / estante / gaveta. */
  @Column({ type: 'varchar', length: 60, nullable: true })
  ubicacion: string | null;

  @Column({ type: 'text', nullable: true })
  notas: string | null;

  @Column({ default: true })
  activo: boolean;

  @OneToMany(() => CodigoBarras, (c) => c.producto)
  codigosBarras: CodigoBarras[];

  @OneToMany(() => Presentacion, (p) => p.producto)
  presentaciones: Presentacion[];

  @OneToMany(() => PrecioProducto, (p) => p.producto)
  precios: PrecioProducto[];

  @CreateDateColumn({ type: 'timestamptz' })
  creadoEn: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  actualizadoEn: Date;
}
