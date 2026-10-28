import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { leerConfiguracion } from '../configuracion-app';
import { opcionesBaseDatos } from './opciones';

/** Fuente de datos usada por la CLI de TypeORM (generar/ejecutar migraciones). */
export default new DataSource(opcionesBaseDatos(leerConfiguracion()));
