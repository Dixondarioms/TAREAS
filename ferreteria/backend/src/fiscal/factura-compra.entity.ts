import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Proveedor } from '../proveedores/proveedor.entity';
import { Usuario } from '../usuarios/usuario.entity';

export enum TipoDocumentoCompra {
  FACTURA = 'FACTURA',
  NOTA_CREDITO = 'NOTA_CREDITO',
  NOTA_DEBITO = 'NOTA_DEBITO',
}

/**
 * Factura (o nota) de un proveedor, registrada con sus montos fiscales en
 * bolívares para el libro de compras y el crédito fiscal.
 */
@Entity('facturas_compra')
@Unique('uq_facturas_compra_numero', ['proveedorId', 'tipo', 'numero'])
export class FacturaCompra {
  @PrimaryGeneratedColumn({ primaryKeyConstraintName: 'PK_facturas_compra' })
  id: number;

  @Column()
  proveedorId: number;

  @ManyToOne(() => Proveedor, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'proveedor_id', foreignKeyConstraintName: 'fk_facturas_compra_proveedor' })
  proveedor: Proveedor;

  @Column({ type: 'enum', enum: TipoDocumentoCompra, enumName: 'tipo_documento_compra', default: TipoDocumentoCompra.FACTURA })
  tipo: TipoDocumentoCompra;

  /** Fecha de emisión del documento (AAAA-MM-DD); define el mes del libro. */
  @Column({ type: 'date' })
  fecha: string;

  @Column({ length: 30 })
  numero: string;

  @Column({ length: 30 })
  numeroControl: string;

  /** Para notas de crédito o débito: número de la factura que modifican. */
  @Column({ type: 'varchar', length: 30, nullable: true })
  facturaAfectada: string | null;

  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0 })
  baseExentaBs: string;

  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0 })
  baseGeneralBs: string;

  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0 })
  ivaGeneralBs: string;

  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0 })
  baseReducidaBs: string;

  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0 })
  ivaReducidaBs: string;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  totalBs: string;

  /** IVA que la ferretería retuvo al proveedor (si es agente de retención). */
  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0 })
  ivaRetenidoBs: string;

  /** 75 o 100; 0 si no hubo retención. */
  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  porcentajeRetencion: string;

  /** Comprobante de retención emitido: AAAAMM + 8 dígitos. */
  @Column({ type: 'varchar', length: 14, nullable: true, unique: true })
  numeroComprobante: string | null;

  @Column({ type: 'date', nullable: true })
  fechaComprobante: string | null;

  @Column({ type: 'text', nullable: true })
  notas: string | null;

  @Column({ type: 'int', nullable: true })
  usuarioId: number | null;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'usuario_id', foreignKeyConstraintName: 'fk_facturas_compra_usuario' })
  usuario: Usuario | null;

  @CreateDateColumn({ type: 'timestamptz' })
  creadoEn: Date;
}
