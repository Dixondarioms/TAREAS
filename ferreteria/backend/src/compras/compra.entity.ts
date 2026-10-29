import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { AlicuotaIva } from '../catalogo/entidades/producto.entity';
import { FacturaCompra } from '../fiscal/factura-compra.entity';
import { Proveedor } from '../proveedores/proveedor.entity';
import { Usuario } from '../usuarios/usuario.entity';
import { OrdenCompra } from './orden-compra.entity';

export type MonedaCompra = 'BS' | 'USD';

export enum EstadoCompra {
  REGISTRADA = 'REGISTRADA',
  ANULADA = 'ANULADA',
}

export enum CondicionCompra {
  CONTADO = 'CONTADO',
  CREDITO = 'CREDITO',
}

/**
 * Recepción de mercancía de un proveedor. Los montos van en la moneda de la
 * factura del proveedor (Bs o USD); la tasa guardada convierte entre ambas.
 */
@Entity('compras')
@Index('idx_compras_proveedor', ['proveedorId'])
/** Una compra anulada no impide registrar de nuevo el mismo documento. */
@Index('uq_compras_documento', ['proveedorId', 'numero'], { unique: true, where: `estado <> 'ANULADA'` })
export class Compra {
  @PrimaryGeneratedColumn({ primaryKeyConstraintName: 'PK_compras' })
  id: number;

  @Column()
  proveedorId: number;

  @ManyToOne(() => Proveedor, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'proveedor_id', foreignKeyConstraintName: 'fk_compras_proveedor' })
  proveedor: Proveedor;

  /** Fecha del documento del proveedor (AAAA-MM-DD). */
  @Column({ type: 'date' })
  fecha: string;

  /** Número de factura o de nota de entrega del proveedor. */
  @Column({ length: 30 })
  numero: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  numeroControl: string | null;

  @Column({ length: 3 })
  moneda: MonedaCompra;

  /** Bs por USD usada para convertir costos y montos fiscales. */
  @Column({ type: 'numeric', precision: 18, scale: 8 })
  tasa: string;

  /** Sin IVA, en la moneda de la compra. */
  @Column({ type: 'numeric', precision: 18, scale: 2 })
  subtotal: string;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  iva: string;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  total: string;

  @Column({ type: 'enum', enum: CondicionCompra, enumName: 'condicion_compra' })
  condicion: CondicionCompra;

  @Column({ type: 'date', nullable: true })
  vencimiento: string | null;

  /** IVA retenido al proveedor (se paga al SENIAT), en la moneda de la compra. */
  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0 })
  retencionIva: string;

  /** Lo que falta pagar al proveedor (total − retención − abonos), en la moneda de la compra. */
  @Column({ type: 'numeric', precision: 18, scale: 2 })
  saldo: string;

  @Column({ type: 'enum', enum: EstadoCompra, enumName: 'estado_compra', default: EstadoCompra.REGISTRADA })
  estado: EstadoCompra;

  @Column({ type: 'timestamptz', nullable: true })
  anuladaEn: Date | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  motivoAnulacion: string | null;

  /** Orden de compra que se recibió con esta compra. */
  @Column({ type: 'int', nullable: true })
  ordenId: number | null;

  @ManyToOne(() => OrdenCompra, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orden_id', foreignKeyConstraintName: 'fk_compras_orden' })
  orden: OrdenCompra | null;

  /** Si se actualizó el costo de reposición de los productos. */
  @Column()
  actualizoCostos: boolean;

  /** Factura registrada en el libro de compras (null si fue nota de entrega sin factura). */
  @Column({ type: 'int', nullable: true })
  facturaCompraId: number | null;

  @ManyToOne(() => FacturaCompra, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'factura_compra_id', foreignKeyConstraintName: 'fk_compras_factura_compra' })
  facturaCompra: FacturaCompra | null;

  @Column({ type: 'text', nullable: true })
  notas: string | null;

  @Column()
  usuarioId: number;

  @ManyToOne(() => Usuario)
  @JoinColumn({ name: 'usuario_id', foreignKeyConstraintName: 'fk_compras_usuario' })
  usuario: Usuario;

  @CreateDateColumn({ type: 'timestamptz' })
  creadoEn: Date;

  @OneToMany(() => CompraLinea, (l) => l.compra)
  lineas: CompraLinea[];

  @OneToMany(() => PagoProveedor, (p) => p.compra)
  pagos: PagoProveedor[];
}

@Entity('compras_lineas')
@Index('idx_compras_lineas_compra', ['compraId'])
export class CompraLinea {
  @PrimaryGeneratedColumn({ primaryKeyConstraintName: 'PK_compras_lineas' })
  id: number;

  @Column()
  compraId: number;

  @ManyToOne(() => Compra, (c) => c.lineas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'compra_id', foreignKeyConstraintName: 'fk_compras_lineas_compra' })
  compra: Compra;

  @Column()
  productoId: number;

  @Column({ length: 40 })
  codigo: string;

  @Column({ length: 200 })
  descripcion: string;

  @Column({ type: 'int', nullable: true })
  presentacionId: number | null;

  @Column({ length: 10 })
  unidad: string;

  @Column({ type: 'numeric', precision: 18, scale: 6 })
  factor: string;

  @Column({ type: 'numeric', precision: 18, scale: 3 })
  cantidad: string;

  /** Costo unitario sin IVA en la moneda de la compra, por la unidad recibida. */
  @Column({ type: 'numeric', precision: 18, scale: 4 })
  costoUnitario: string;

  @Column({ type: 'enum', enum: AlicuotaIva, enumName: 'alicuota_iva' })
  alicuotaIva: AlicuotaIva;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  subtotal: string;
}

/** Abono a una compra a crédito (o pago de contado). */
@Entity('pagos_proveedor')
@Index('idx_pagos_proveedor_compra', ['compraId'])
export class PagoProveedor {
  @PrimaryGeneratedColumn({ primaryKeyConstraintName: 'PK_pagos_proveedor' })
  id: number;

  @Column()
  compraId: number;

  @ManyToOne(() => Compra, (c) => c.pagos, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'compra_id', foreignKeyConstraintName: 'fk_pagos_proveedor_compra' })
  compra: Compra;

  @Column({ type: 'date' })
  fecha: string;

  /** Método con que se pagó (transferencia, efectivo, Zelle...). */
  @Column({ length: 20 })
  metodo: string;

  /** En la moneda de la compra. */
  @Column({ type: 'numeric', precision: 18, scale: 2 })
  monto: string;

  @Column({ type: 'varchar', length: 60, nullable: true })
  referencia: string | null;

  @Column()
  usuarioId: number;

  @ManyToOne(() => Usuario)
  @JoinColumn({ name: 'usuario_id', foreignKeyConstraintName: 'fk_pagos_proveedor_usuario' })
  usuario: Usuario;

  @CreateDateColumn({ type: 'timestamptz' })
  creadoEn: Date;
}
