import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AlicuotaIva } from '../../catalogo/entidades/producto.entity';
import { Usuario } from '../../usuarios/usuario.entity';
import { MetodoPago } from '../metodos-pago';
import { SesionCaja } from './sesion-caja.entity';
import { Talonario } from './talonario.entity';
import { Venta } from './venta.entity';

/**
 * Nota de débito sobre una factura: un cargo adicional (diferencia de
 * precio, flete, etc.) que se cobra en caja y va al libro de ventas.
 */
@Entity('notas_debito')
@Index('uq_notas_debito_numero', ['talonarioId', 'numero'], { unique: true })
@Index('idx_notas_debito_venta', ['ventaId'])
export class NotaDebito {
  @PrimaryGeneratedColumn({ primaryKeyConstraintName: 'PK_notas_debito' })
  id: number;

  @Column()
  ventaId: number;

  @ManyToOne(() => Venta, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'venta_id', foreignKeyConstraintName: 'fk_notas_debito_venta' })
  venta: Venta;

  /** Caja donde se cobró. */
  @Column()
  sesionId: number;

  @ManyToOne(() => SesionCaja, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sesion_id', foreignKeyConstraintName: 'fk_notas_debito_sesion' })
  sesion: SesionCaja;

  @Column()
  usuarioId: number;

  @ManyToOne(() => Usuario)
  @JoinColumn({ name: 'usuario_id', foreignKeyConstraintName: 'fk_notas_debito_usuario' })
  usuario: Usuario;

  @Column()
  talonarioId: number;

  @ManyToOne(() => Talonario, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'talonario_id', foreignKeyConstraintName: 'fk_notas_debito_talonario' })
  talonario: Talonario;

  @Column({ length: 10, default: '' })
  serie: string;

  @Column({ type: 'int' })
  numero: number;

  @Column({ length: 30 })
  numeroControl: string;

  @Column({ length: 200 })
  concepto: string;

  @Column({ type: 'enum', enum: AlicuotaIva, enumName: 'alicuota_iva' })
  alicuotaIva: AlicuotaIva;

  @Column({ type: 'numeric', precision: 5, scale: 2 })
  porcentajeIva: string;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  baseBs: string;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  ivaBs: string;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  totalBs: string;

  /** Tasa del día del cobro. */
  @Column({ type: 'numeric', precision: 18, scale: 8 })
  tasa: string;

  @Column({ length: 20 })
  metodo: MetodoPago;

  /** Cobrado, en la moneda del método. */
  @Column({ type: 'numeric', precision: 18, scale: 2 })
  monto: string;

  @Column({ type: 'varchar', length: 60, nullable: true })
  referencia: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  creadoEn: Date;
}
