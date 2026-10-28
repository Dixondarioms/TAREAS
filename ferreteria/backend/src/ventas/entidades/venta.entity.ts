import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { AlicuotaIva } from '../../catalogo/entidades/producto.entity';
import { Usuario } from '../../usuarios/usuario.entity';
import { MetodoPago } from '../metodos-pago';
import { Cliente } from './cliente.entity';
import { SesionCaja } from './sesion-caja.entity';
import { Talonario } from './talonario.entity';

export enum EstadoVenta {
  COMPLETADA = 'COMPLETADA',
  ANULADA = 'ANULADA',
}

/**
 * Venta facturada. Los montos de la factura están en bolívares, calculados a
 * la tasa BCV guardada en la venta; los datos del cliente y de cada producto
 * se copian para que la factura no cambie si luego se editan.
 */
@Entity('ventas')
@Index('uq_ventas_factura', ['talonarioId', 'numeroFactura'], { unique: true })
export class Venta {
  @PrimaryGeneratedColumn({ primaryKeyConstraintName: 'PK_ventas' })
  id: number;

  @Column({ type: 'enum', enum: EstadoVenta, enumName: 'estado_venta', default: EstadoVenta.COMPLETADA })
  estado: EstadoVenta;

  @Column()
  sesionId: number;

  @ManyToOne(() => SesionCaja, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sesion_id', foreignKeyConstraintName: 'fk_ventas_sesion' })
  sesion: SesionCaja;

  @Column()
  usuarioId: number;

  @ManyToOne(() => Usuario)
  @JoinColumn({ name: 'usuario_id', foreignKeyConstraintName: 'fk_ventas_usuario' })
  usuario: Usuario;

  @Column({ type: 'int', nullable: true })
  clienteId: number | null;

  @ManyToOne(() => Cliente, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cliente_id', foreignKeyConstraintName: 'fk_ventas_cliente' })
  cliente: Cliente | null;

  /** Copia del cliente al facturar; «Consumidor final» si no se indicó. */
  @Column({ type: 'varchar', length: 15, nullable: true })
  clienteDocumento: string | null;

  @Column({ length: 150 })
  clienteNombre: string;

  @Column({ type: 'text', nullable: true })
  clienteDireccion: string | null;

  @Column()
  talonarioId: number;

  @ManyToOne(() => Talonario, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'talonario_id', foreignKeyConstraintName: 'fk_ventas_talonario' })
  talonario: Talonario;

  @Column({ length: 10, default: '' })
  serie: string;

  @Column({ type: 'int' })
  numeroFactura: number;

  @Column({ length: 30 })
  numeroControl: string;

  /** Bs por USD usada en toda la factura. */
  @Column({ type: 'numeric', precision: 18, scale: 8 })
  tasa: string;

  @Column()
  listaId: number;

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

  /** Porcentajes vigentes al facturar (para reconstruir la factura). */
  @Column({ type: 'numeric', precision: 5, scale: 2 })
  porcentajeGeneral: string;

  @Column({ type: 'numeric', precision: 5, scale: 2 })
  porcentajeReducida: string;

  /** Total de la factura (bases + IVA), sin IGTF. */
  @Column({ type: 'numeric', precision: 18, scale: 2 })
  totalBs: string;

  /** Base del IGTF: parte del total pagada en divisas. */
  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0 })
  baseIgtfBs: string;

  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0 })
  igtfBs: string;

  /** totalBs + igtfBs: lo que paga el cliente. */
  @Column({ type: 'numeric', precision: 18, scale: 2 })
  totalPagarBs: string;

  /** Equivalente en USD de totalPagarBs, a la tasa de la venta. */
  @Column({ type: 'numeric', precision: 18, scale: 2 })
  totalPagarUsd: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  vueltoMetodo: MetodoPago | null;

  /** Vuelto en la moneda del método. */
  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0 })
  vueltoMonto: string;

  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0 })
  vueltoBs: string;

  @CreateDateColumn({ type: 'timestamptz' })
  creadoEn: Date;

  @Column({ type: 'timestamptz', nullable: true })
  anuladaEn: Date | null;

  @Column({ type: 'int', nullable: true })
  anuladaPorId: number | null;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'anulada_por_id', foreignKeyConstraintName: 'fk_ventas_anulada_por' })
  anuladaPor: Usuario | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  motivoAnulacion: string | null;

  @OneToMany(() => VentaLinea, (l) => l.venta)
  lineas: VentaLinea[];

  @OneToMany(() => VentaPago, (p) => p.venta)
  pagos: VentaPago[];
}

@Entity('ventas_lineas')
export class VentaLinea {
  @PrimaryGeneratedColumn({ primaryKeyConstraintName: 'PK_ventas_lineas' })
  id: number;

  @Column()
  ventaId: number;

  @ManyToOne(() => Venta, (v) => v.lineas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'venta_id', foreignKeyConstraintName: 'fk_ventas_lineas_venta' })
  venta: Venta;

  @Column()
  productoId: number;

  @Column({ length: 40 })
  codigo: string;

  @Column({ length: 200 })
  descripcion: string;

  @Column({ type: 'int', nullable: true })
  presentacionId: number | null;

  /** Unidad en que se vendió (UND, M, CAJA...). */
  @Column({ length: 10 })
  unidad: string;

  /** Unidades base por unidad vendida (1 si es la unidad base). */
  @Column({ type: 'numeric', precision: 18, scale: 6 })
  factor: string;

  @Column({ type: 'numeric', precision: 18, scale: 3 })
  cantidad: string;

  @Column({ type: 'enum', enum: AlicuotaIva, enumName: 'alicuota_iva' })
  alicuotaIva: AlicuotaIva;

  /** Precio unitario sin IVA en USD (de la lista de precios). */
  @Column({ type: 'numeric', precision: 18, scale: 4 })
  precioUsd: string;

  /** Precio unitario sin IVA en Bs a la tasa de la venta. */
  @Column({ type: 'numeric', precision: 18, scale: 2 })
  precioBs: string;

  /** precioBs × cantidad, sin IVA. */
  @Column({ type: 'numeric', precision: 18, scale: 2 })
  subtotalBs: string;
}

@Entity('ventas_pagos')
export class VentaPago {
  @PrimaryGeneratedColumn({ primaryKeyConstraintName: 'PK_ventas_pagos' })
  id: number;

  @Column()
  ventaId: number;

  @ManyToOne(() => Venta, (v) => v.pagos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'venta_id', foreignKeyConstraintName: 'fk_ventas_pagos_venta' })
  venta: Venta;

  @Column({ length: 20 })
  metodo: MetodoPago;

  /** En la moneda del método. */
  @Column({ type: 'numeric', precision: 18, scale: 2 })
  monto: string;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  montoBs: string;

  @Column({ type: 'varchar', length: 60, nullable: true })
  referencia: string | null;
}
