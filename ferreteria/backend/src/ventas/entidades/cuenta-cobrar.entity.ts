import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Usuario } from '../../usuarios/usuario.entity';
import { Cliente } from './cliente.entity';
import { NotaCredito } from './nota-credito.entity';
import { SesionCaja } from './sesion-caja.entity';
import { Venta } from './venta.entity';

/**
 * Deuda de un cliente por una venta a crédito. Se lleva en USD (a la tasa de
 * la factura) para que la inflación no la reduzca mientras se paga.
 */
@Entity('cuentas_cobrar')
@Index('idx_cuentas_cobrar_cliente', ['clienteId'])
export class CuentaCobrar {
  @PrimaryGeneratedColumn({ primaryKeyConstraintName: 'PK_cuentas_cobrar' })
  id: number;

  @Column({ unique: true })
  ventaId: number;

  @ManyToOne(() => Venta, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'venta_id', foreignKeyConstraintName: 'fk_cuentas_cobrar_venta' })
  venta: Venta;

  @Column()
  clienteId: number;

  @ManyToOne(() => Cliente, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cliente_id', foreignKeyConstraintName: 'fk_cuentas_cobrar_cliente' })
  cliente: Cliente;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  montoUsd: string;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  saldoUsd: string;

  @Column({ type: 'date' })
  vencimiento: string;

  @CreateDateColumn({ type: 'timestamptz' })
  creadoEn: Date;
}

/**
 * Pago de un cliente a su deuda: dinero recibido en una caja, o una nota de
 * crédito que se descuenta de la deuda. Se reparte entre sus cuentas, de la
 * que vence primero a la última.
 */
@Entity('abonos_cliente')
@Index('idx_abonos_cliente_cliente', ['clienteId'])
export class AbonoCliente {
  @PrimaryGeneratedColumn({ primaryKeyConstraintName: 'PK_abonos_cliente' })
  id: number;

  @Column()
  clienteId: number;

  @ManyToOne(() => Cliente, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cliente_id', foreignKeyConstraintName: 'fk_abonos_cliente_cliente' })
  cliente: Cliente;

  /** Caja donde entró el dinero; null si es una nota de crédito. */
  @Column({ type: 'int', nullable: true })
  sesionId: number | null;

  @ManyToOne(() => SesionCaja, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sesion_id', foreignKeyConstraintName: 'fk_abonos_cliente_sesion' })
  sesion: SesionCaja | null;

  @Column({ type: 'int', nullable: true })
  notaCreditoId: number | null;

  @ManyToOne(() => NotaCredito, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'nota_credito_id', foreignKeyConstraintName: 'fk_abonos_cliente_nota_credito' })
  notaCredito: NotaCredito | null;

  /** Método de pago, o NOTA_CREDITO. */
  @Column({ length: 20 })
  metodo: string;

  /** En la moneda del método. */
  @Column({ type: 'numeric', precision: 18, scale: 2 })
  monto: string;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  montoBs: string;

  /** Tasa del día del abono (o de la factura, en notas de crédito). */
  @Column({ type: 'numeric', precision: 18, scale: 8 })
  tasa: string;

  /** Lo que se descontó de la deuda. */
  @Column({ type: 'numeric', precision: 18, scale: 2 })
  montoUsd: string;

  @Column({ type: 'varchar', length: 60, nullable: true })
  referencia: string | null;

  @Column()
  usuarioId: number;

  @ManyToOne(() => Usuario)
  @JoinColumn({ name: 'usuario_id', foreignKeyConstraintName: 'fk_abonos_cliente_usuario' })
  usuario: Usuario;

  @CreateDateColumn({ type: 'timestamptz' })
  creadoEn: Date;

  @OneToMany(() => AplicacionAbono, (a) => a.abono)
  aplicaciones: AplicacionAbono[];
}

/** Parte de un abono aplicada a una cuenta. */
@Entity('aplicaciones_abono')
@Index('idx_aplicaciones_abono_cuenta', ['cuentaId'])
export class AplicacionAbono {
  @PrimaryGeneratedColumn({ primaryKeyConstraintName: 'PK_aplicaciones_abono' })
  id: number;

  @Column()
  abonoId: number;

  @ManyToOne(() => AbonoCliente, (a) => a.aplicaciones, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'abono_id', foreignKeyConstraintName: 'fk_aplicaciones_abono_abono' })
  abono: AbonoCliente;

  @Column()
  cuentaId: number;

  @ManyToOne(() => CuentaCobrar, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cuenta_id', foreignKeyConstraintName: 'fk_aplicaciones_abono_cuenta' })
  cuenta: CuentaCobrar;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  montoUsd: string;
}
