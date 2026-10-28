import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('proveedores')
export class Proveedor {
  @PrimaryGeneratedColumn()
  id: number;

  /** RIF normalizado (J-12345678-9). */
  @Column({ length: 15, unique: true })
  rif: string;

  @Column({ length: 150 })
  razonSocial: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  contacto: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  telefono: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  correo: string | null;

  @Column({ type: 'text', nullable: true })
  direccion: string | null;

  @Column({ type: 'text', nullable: true })
  notas: string | null;

  @Column({ default: true })
  activo: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  creadoEn: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  actualizadoEn: Date;
}
