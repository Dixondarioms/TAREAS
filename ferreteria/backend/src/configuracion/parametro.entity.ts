import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** Parámetros generales del sistema (clave → valor JSON). */
@Entity('parametros')
export class Parametro {
  @PrimaryColumn({ length: 60 })
  clave: string;

  @Column({ type: 'jsonb' })
  valor: unknown;

  @UpdateDateColumn({ type: 'timestamptz' })
  actualizadoEn: Date;
}
