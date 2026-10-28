import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('marcas')
export class Marca {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 100, unique: true })
  nombre: string;
}
