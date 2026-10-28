import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('unidades_medida')
export class UnidadMedida {
  @PrimaryGeneratedColumn()
  id: number;

  /** Código corto: UND, M, KG, L, GAL, CAJA, ROLLO… */
  @Column({ length: 10, unique: true })
  codigo: string;

  @Column({ length: 50 })
  nombre: string;

  /** Si se puede vender en fracciones (1.5 m de cable, 0.250 kg de clavos). */
  @Column({ default: false })
  permiteDecimales: boolean;
}
