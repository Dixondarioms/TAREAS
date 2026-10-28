import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Rol } from './rol.enum';

@Entity('usuarios')
export class Usuario {
  @PrimaryGeneratedColumn()
  id: number;

  /** Nombre de inicio de sesión, siempre en minúsculas. */
  @Column({ length: 40, unique: true })
  usuario: string;

  @Column({ length: 100 })
  nombre: string;

  @Column({ length: 100, select: false })
  claveHash: string;

  @Column({ type: 'enum', enum: Rol, enumName: 'rol_usuario' })
  rol: Rol;

  @Column({ default: true })
  activo: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  ultimoAcceso: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  creadoEn: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  actualizadoEn: Date;
}
