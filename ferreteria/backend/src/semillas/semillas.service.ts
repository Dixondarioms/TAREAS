import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { leerConfiguracion } from '../configuracion-app';
import { ListaPrecio } from '../catalogo/entidades/lista-precio.entity';
import { UnidadMedida } from '../catalogo/entidades/unidad-medida.entity';
import { UsuariosService } from '../usuarios/usuarios.service';

const UNIDADES: Pick<UnidadMedida, 'codigo' | 'nombre' | 'permiteDecimales'>[] = [
  { codigo: 'UND', nombre: 'Unidad', permiteDecimales: false },
  { codigo: 'PAR', nombre: 'Par', permiteDecimales: false },
  { codigo: 'JGO', nombre: 'Juego', permiteDecimales: false },
  { codigo: 'CAJA', nombre: 'Caja', permiteDecimales: false },
  { codigo: 'PAQ', nombre: 'Paquete', permiteDecimales: false },
  { codigo: 'BLS', nombre: 'Bolsa', permiteDecimales: false },
  { codigo: 'SACO', nombre: 'Saco', permiteDecimales: false },
  { codigo: 'ROLLO', nombre: 'Rollo', permiteDecimales: false },
  { codigo: 'M', nombre: 'Metro', permiteDecimales: true },
  { codigo: 'M2', nombre: 'Metro cuadrado', permiteDecimales: true },
  { codigo: 'M3', nombre: 'Metro cúbico', permiteDecimales: true },
  { codigo: 'KG', nombre: 'Kilogramo', permiteDecimales: true },
  { codigo: 'L', nombre: 'Litro', permiteDecimales: true },
  { codigo: 'GAL', nombre: 'Galón', permiteDecimales: true },
  { codigo: 'CUN', nombre: 'Cuñete', permiteDecimales: false },
];

const LISTAS: Pick<ListaPrecio, 'codigo' | 'nombre' | 'margenPorDefecto' | 'orden'>[] = [
  { codigo: 'PUBLICO', nombre: 'Precio al público', margenPorDefecto: '30', orden: 1 },
  { codigo: 'MAYOR', nombre: 'Precio al mayor', margenPorDefecto: '20', orden: 2 },
  { codigo: 'CONTRATISTA', nombre: 'Contratistas', margenPorDefecto: '25', orden: 3 },
];

/** Datos mínimos para arrancar (solo se insertan si las tablas están vacías). */
@Injectable()
export class SemillasService implements OnApplicationBootstrap {
  private readonly log = new Logger(SemillasService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly usuarios: UsuariosService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const unidades = this.ds.getRepository(UnidadMedida);
    if ((await unidades.count()) === 0) {
      await unidades.insert(UNIDADES);
      this.log.log(`Unidades de medida iniciales creadas (${UNIDADES.length})`);
    }
    const listas = this.ds.getRepository(ListaPrecio);
    if ((await listas.count()) === 0) {
      await listas.insert(LISTAS);
      this.log.log('Listas de precio iniciales creadas');
    }
    const { admin } = leerConfiguracion();
    await this.usuarios.asegurarAdministrador(admin.usuario, admin.claveInicial);
  }
}
