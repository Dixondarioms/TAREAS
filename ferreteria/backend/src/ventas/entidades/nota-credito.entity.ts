import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { AlicuotaIva } from '../../catalogo/entidades/producto.entity';
import { Usuario } from '../../usuarios/usuario.entity';
import { MetodoPago } from '../metodos-pago';
import { SesionCaja } from './sesion-caja.entity';
import { Talonario } from './talonario.entity';
import { Venta, VentaLinea } from './venta.entity';

/**
 * Nota de crédito sobre una factura: devolución total o parcial. Los montos
 * se calculan con la tasa y las alícuotas de la factura original.
 */
@Entity('notas_credito')
@Index('uq_notas_credito_numero', ['talonarioId', 'numero'], { unique: true })
export class NotaCredito {
  @PrimaryGeneratedColumn({ primaryKeyConstraintName: 'PK_notas_credito' })
  id: number;

  @Column()
  ventaId: number;

  @ManyToOne(() => Venta, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'venta_id', foreignKeyConstraintName: 'fk_notas_credito_venta' })
  venta: Venta;

  /** Caja de la que salió el reintegro. */
  @Column()
  sesionId: number;

  @ManyToOne(() => SesionCaja, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sesion_id', foreignKeyConstraintName: 'fk_notas_credito_sesion' })
  sesion: SesionCaja;

  @Column()
  usuarioId: number;

  @ManyToOne(() => Usuario)
  @JoinColumn({ name: 'usuario_id', foreignKeyConstraintName: 'fk_notas_credito_usuario' })
  usuario: Usuario;

  @Column()
  talonarioId: number;

  @ManyToOne(() => Talonario, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'talonario_id', foreignKeyConstraintName: 'fk_notas_credito_talonario' })
  talonario: Talonario;

  @Column({ length: 10, default: '' })
  serie: string;

  @Column({ type: 'int' })
  numero: number;

  @Column({ length: 30 })
  numeroControl: string;

  @Column({ length: 200 })
  motivo: string;

  /** Si la mercancía devuelta volvió al inventario (no, si llegó dañada). */
  @Column()
  devolverInventario: boolean;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  baseExentaBs: string;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  baseGeneralBs: string;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  ivaGeneralBs: string;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  baseReducidaBs: string;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  ivaReducidaBs: string;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  totalBs: string;

  /** Cómo se devolvió el dinero al cliente. */
  @Column({ length: 20 })
  reintegroMetodo: MetodoPago;

  /** En la moneda del método (USD a la tasa de la factura). */
  @Column({ type: 'numeric', precision: 18, scale: 2 })
  reintegroMonto: string;

  @CreateDateColumn({ type: 'timestamptz' })
  creadoEn: Date;

  @OneToMany(() => NotaCreditoLinea, (l) => l.nota)
  lineas: NotaCreditoLinea[];
}

@Entity('notas_credito_lineas')
export class NotaCreditoLinea {
  @PrimaryGeneratedColumn({ primaryKeyConstraintName: 'PK_notas_credito_lineas' })
  id: number;

  @Column()
  notaId: number;

  @ManyToOne(() => NotaCredito, (n) => n.lineas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'nota_id', foreignKeyConstraintName: 'fk_notas_credito_lineas_nota' })
  nota: NotaCredito;

  @Column()
  ventaLineaId: number;

  @ManyToOne(() => VentaLinea, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'venta_linea_id', foreignKeyConstraintName: 'fk_notas_credito_lineas_venta_linea' })
  ventaLinea: VentaLinea;

  @Column()
  productoId: number;

  @Column({ length: 40 })
  codigo: string;

  @Column({ length: 200 })
  descripcion: string;

  @Column({ length: 10 })
  unidad: string;

  @Column({ type: 'numeric', precision: 18, scale: 6 })
  factor: string;

  @Column({ type: 'numeric', precision: 18, scale: 3 })
  cantidad: string;

  @Column({ type: 'enum', enum: AlicuotaIva, enumName: 'alicuota_iva' })
  alicuotaIva: AlicuotaIva;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  precioBs: string;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  subtotalBs: string;
}
