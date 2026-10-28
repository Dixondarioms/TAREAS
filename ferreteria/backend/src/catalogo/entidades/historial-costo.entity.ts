import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Usuario } from '../../usuarios/usuario.entity';
import { Producto } from './producto.entity';

/** Registro de cada cambio de costo, para auditoría y análisis. */
@Entity('historial_costos')
@Index(['productoId', 'creadoEn'])
export class HistorialCosto {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  productoId: number;

  @ManyToOne(() => Producto, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'producto_id' })
  producto: Producto;

  @Column({ type: 'numeric', precision: 18, scale: 4 })
  costoAnterior: string;

  @Column({ type: 'numeric', precision: 18, scale: 4 })
  costoNuevo: string;

  @Column({ length: 200 })
  motivo: string;

  @Column({ type: 'int', nullable: true })
  usuarioId: number | null;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'usuario_id' })
  usuario: Usuario | null;

  @CreateDateColumn({ type: 'timestamptz' })
  creadoEn: Date;
}
