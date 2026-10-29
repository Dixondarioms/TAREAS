import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Usuario } from '../../usuarios/usuario.entity';

export enum EstadoCaja {
  ABIERTA = 'ABIERTA',
  CERRADA = 'CERRADA',
}

/** Montos por método de pago, en la moneda del método: { EFECTIVO_BS: "120.50", ZELLE: "40.00" }. */
export type MontosPorMetodo = Record<string, string>;

/** Turno de un cajero: desde que abre la caja con un fondo hasta que la cierra con el arqueo. */
@Entity('sesiones_caja')
export class SesionCaja {
  @PrimaryGeneratedColumn({ primaryKeyConstraintName: 'PK_sesiones_caja' })
  id: number;

  @Column()
  usuarioId: number;

  @ManyToOne(() => Usuario)
  @JoinColumn({ name: 'usuario_id', foreignKeyConstraintName: 'fk_sesiones_caja_usuario' })
  usuario: Usuario;

  @Column({ type: 'enum', enum: EstadoCaja, enumName: 'estado_caja', default: EstadoCaja.ABIERTA })
  estado: EstadoCaja;

  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0 })
  fondoBs: string;

  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0 })
  fondoUsd: string;

  @CreateDateColumn({ type: 'timestamptz' })
  abiertaEn: Date;

  @Column({ type: 'timestamptz', nullable: true })
  cerradaEn: Date | null;

  /** Lo que el sistema esperaba al cerrar, por método. */
  @Column({ type: 'jsonb', nullable: true })
  esperado: MontosPorMetodo | null;

  /** Lo que contó el cajero al cerrar, por método. */
  @Column({ type: 'jsonb', nullable: true })
  contado: MontosPorMetodo | null;

  @Column({ type: 'text', nullable: true })
  observaciones: string | null;
}
