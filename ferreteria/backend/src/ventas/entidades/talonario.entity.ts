import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Usuario } from '../../usuarios/usuario.entity';

/**
 * Talonario de facturas impreso por la imprenta autorizada. Cada factura
 * trae un número de factura y un número de control consecutivos; el sistema
 * asigna el siguiente para que no haya saltos ni repeticiones.
 */
@Entity('talonarios')
export class Talonario {
  @PrimaryGeneratedColumn({ primaryKeyConstraintName: 'PK_talonarios' })
  id: number;

  /** Serie impresa (puede estar vacía). */
  @Column({ length: 10, default: '' })
  serie: string;

  @Column({ type: 'int' })
  numeroDesde: number;

  @Column({ type: 'int' })
  numeroHasta: number;

  /** Prefijo del número de control, p. ej. «00-». */
  @Column({ length: 10, default: '00-' })
  controlPrefijo: string;

  /** Número de control de la primera factura del talonario. */
  @Column({ type: 'int' })
  controlDesde: number;

  /** Cantidad de dígitos con que se imprimen los números (p. ej. 6 → 000123). */
  @Column({ type: 'int', default: 6 })
  digitos: number;

  /** Próximo número de factura sin usar; numeroHasta + 1 cuando se agota. */
  @Column({ type: 'int' })
  siguiente: number;

  @Column({ default: true })
  activo: boolean;

  @Column({ type: 'int', nullable: true })
  creadoPorId: number | null;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'creado_por_id', foreignKeyConstraintName: 'fk_talonarios_usuario' })
  creadoPor: Usuario | null;

  @CreateDateColumn({ type: 'timestamptz' })
  creadoEn: Date;
}
