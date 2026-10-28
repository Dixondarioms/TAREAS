import { join } from 'path';
import { DataSourceOptions } from 'typeorm';
import { ConfiguracionApp } from '../configuracion-app';
import { ENTIDADES } from './entidades';
import { EstrategiaNombresSnake } from './estrategia-nombres';

export function opcionesBaseDatos(config: ConfiguracionApp): DataSourceOptions {
  return {
    type: 'postgres',
    host: config.bd.host,
    port: config.bd.puerto,
    username: config.bd.usuario,
    password: config.bd.clave,
    database: config.bd.nombre,
    entities: ENTIDADES,
    migrations: [join(__dirname, 'migraciones', '*.{ts,js}')],
    migrationsTableName: 'migraciones',
    namingStrategy: new EstrategiaNombresSnake(),
    // El esquema solo cambia mediante migraciones revisadas, nunca automáticamente.
    synchronize: false,
    migrationsRun: true,
    migrationsTransactionMode: 'each',
  };
}
