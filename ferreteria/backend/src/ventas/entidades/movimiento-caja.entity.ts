import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Usuario } from '../../usuarios/usuario.entity';
import { SesionCaja } from './sesion-caja.entity';

export enum TipoMovimientoCaja {
  /** Dinero que se saca de la caja (depósito al banco, entrega al dueño). */
  RETIRO = 'RETIRO',
  /** Pago de un gasto menor con dinero de la caja. */
  GASTO = 'GASTO',
  /** Dinero que se agrega a la caja (más sencillo para vuelto). */
  INGRESO = 'INGRESO',
}

/** Entradas y salidas de efectivo que no son ventas. */
@Entity('movimientos_caja')
export class MovimientoCaja {
  @PrimaryGeneratedColumn({ primaryKeyConstraintName: 'PK_movimientos_caja' })
  id: number;

  @Column()
  sesionId: number;

  @ManyToOne(() => SesionCaja, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sesion_id', foreignKeyConstraintName: 'fk_movimientos_caja_sesion' })
  sesion: SesionCaja;

  @Column({ type: 'enum', enum: TipoMovimientoCaja, enumName: 'tipo_movimiento_caja' })
  tipo: TipoMovimientoCaja;

  /** Solo efectivo: EFECTIVO_BS o EFECTIVO_USD. */
  @Column({ length: 20 })
  metodo: string;

  /** Siempre positivo; el tipo indica si entra o sale. */
  @Column({ type: 'numeric', precision: 18, scale: 2 })
  monto: string;

  @Column({ length: 200 })
  motivo: string;

  @Column()
  usuarioId: number;

  @ManyToOne(() => Usuario)
  @JoinColumn({ name: 'usuario_id', foreignKeyConstraintName: 'fk_movimientos_caja_usuario' })
  usuario: Usuario;

  @CreateDateColumn({ type: 'timestamptz' })
  creadoEn: Date;
}
