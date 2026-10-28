import { DefaultNamingStrategy, NamingStrategyInterface } from 'typeorm';

function aSnake(texto: string): string {
  return texto
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

/** Columnas y tablas en snake_case (costoUsd → costo_usd). */
export class EstrategiaNombresSnake extends DefaultNamingStrategy implements NamingStrategyInterface {
  override tableName(nombreClase: string, nombrePersonalizado?: string): string {
    return nombrePersonalizado ?? aSnake(nombreClase);
  }

  override columnName(propiedad: string, nombrePersonalizado: string | undefined, prefijos: string[]): string {
    return aSnake(prefijos.concat('').join('_')) + (nombrePersonalizado ?? aSnake(propiedad));
  }

  override relationName(propiedad: string): string {
    return aSnake(propiedad);
  }

  override joinColumnName(relacion: string, columnaReferenciada: string): string {
    return aSnake(`${relacion}_${columnaReferenciada}`);
  }

  override joinTableName(primera: string, _segunda: string, propiedad: string): string {
    return aSnake(`${primera}_${propiedad.replace(/\./g, '_')}`);
  }

  override joinTableColumnName(tabla: string, propiedad: string, columna?: string): string {
    return aSnake(`${tabla}_${columna ?? propiedad}`);
  }
}
