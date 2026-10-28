import { Column, CreateDateColumn, Entity, Index, ManyToOne, JoinColumn, PrimaryGeneratedColumn } from 'typeorm';
import { Usuario } from '../usuarios/usuario.entity';

export enum Moneda {
  USD = 'USD',
  EUR = 'EUR',
}

export enum FuenteTasa {
  BCV = 'BCV',
  MANUAL = 'MANUAL',
}

/**
 * Tasa oficial de cambio (Bs por unidad de divisa). Los registros nunca se
 * modifican: una corrección se hace cargando una tasa nueva para la misma
 * fecha valor, que prevalece por ser más reciente.
 */
@Entity('tasas_cambio')
@Index(['moneda', 'fechaValor', 'creadoEn'])
export class TasaCambio {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: Moneda, enumName: 'moneda' })
  moneda: Moneda;

  /** Bolívares por 1 unidad de la divisa. */
  @Column({ type: 'numeric', precision: 20, scale: 8 })
  valor: string;

  /** Fecha a partir de la cual rige la tasa (la "fecha valor" del BCV). */
  @Column({ type: 'date' })
  fechaValor: string;

  @Column({ type: 'enum', enum: FuenteTasa, enumName: 'fuente_tasa' })
  fuente: FuenteTasa;

  @Column({ type: 'int', nullable: true })
  creadoPorId: number | null;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'creado_por_id' })
  creadoPor: Usuario | null;

  @CreateDateColumn({ type: 'timestamptz' })
  creadoEn: Date;
}
