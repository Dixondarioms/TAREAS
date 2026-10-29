import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('clientes')
export class Cliente {
  @PrimaryGeneratedColumn({ primaryKeyConstraintName: 'PK_clientes' })
  id: number;

  /** RIF (J-12345678-9) o cédula (V-12345678), normalizado. */
  @Column({ length: 15, unique: true })
  documento: string;

  /** Nombre o razón social, tal como debe salir en la factura. */
  @Column({ length: 150 })
  nombre: string;

  /** Domicilio fiscal (obligatorio en la factura para contribuyentes). */
  @Column({ type: 'text', nullable: true })
  direccion: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  telefono: string | null;

  /** Deuda máxima permitida en USD; 0 = no compra a crédito. */
  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0 })
  limiteCreditoUsd: string;

  /** Plazo de pago de las ventas a crédito. */
  @Column({ type: 'int', default: 30 })
  diasCredito: number;

  @CreateDateColumn({ type: 'timestamptz' })
  creadoEn: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  actualizadoEn: Date;
}
