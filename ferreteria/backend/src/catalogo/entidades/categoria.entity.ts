import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

@Entity('categorias')
export class Categoria {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 100 })
  nombre: string;

  @Column({ type: 'int', nullable: true })
  padreId: number | null;

  @ManyToOne(() => Categoria, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'padre_id' })
  padre: Categoria | null;
}
