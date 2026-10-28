import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Usuario } from '../../usuarios/usuario.entity';
import { Talonario } from './talonario.entity';

/**
 * Hoja del talonario anulada sin venta (se dañó o se llenó mal). El número
 * queda usado y debe aparecer como anulado en el libro de ventas.
 */
@Entity('facturas_anuladas')
@Unique('uq_facturas_anuladas_numero', ['talonarioId', 'numero'])
export class FacturaAnulada {
  @PrimaryGeneratedColumn({ primaryKeyConstraintName: 'PK_facturas_anuladas' })
  id: number;

  @Column()
  talonarioId: number;

  @ManyToOne(() => Talonario, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'talonario_id', foreignKeyConstraintName: 'fk_facturas_anuladas_talonario' })
  talonario: Talonario;

  @Column({ type: 'int' })
  numero: number;

  @Column({ length: 30 })
  numeroControl: string;

  @Column({ length: 200 })
  motivo: string;

  @Column({ type: 'int', nullable: true })
  usuarioId: number | null;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'usuario_id', foreignKeyConstraintName: 'fk_facturas_anuladas_usuario' })
  usuario: Usuario | null;

  @CreateDateColumn({ type: 'timestamptz' })
  creadoEn: Date;
}
