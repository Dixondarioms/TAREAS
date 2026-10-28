import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Búsqueda tolerante (sin acentos y por similitud de trigramas) y reglas de
 * integridad que la base de datos debe garantizar aunque falle la aplicación.
 */
export class BusquedaYRestricciones1793192406188 implements MigrationInterface {
  name = 'BusquedaYRestricciones1793192406188';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS unaccent`);
    await q.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    // unaccent() no es IMMUTABLE; este envoltorio permite usarlo en índices.
    await q.query(`
      CREATE OR REPLACE FUNCTION f_normalizar(texto text) RETURNS text
      LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
      AS $$ SELECT lower(public.unaccent('public.unaccent'::regdictionary, texto)) $$`);

    await q.query(`CREATE INDEX idx_productos_descripcion_trgm ON productos USING gin (f_normalizar(descripcion) gin_trgm_ops)`);
    await q.query(`CREATE INDEX idx_productos_codigo_trgm ON productos USING gin (f_normalizar(codigo) gin_trgm_ops)`);
    await q.query(`CREATE INDEX idx_productos_categoria ON productos (categoria_id)`);
    await q.query(`CREATE INDEX idx_productos_marca ON productos (marca_id)`);
    await q.query(`CREATE INDEX idx_codigos_barras_producto ON codigos_barras (producto_id)`);
    await q.query(`CREATE INDEX idx_precios_producto_lista ON precios_producto (lista_id)`);

    await q.query(`CREATE UNIQUE INDEX uq_marcas_nombre_ci ON marcas (f_normalizar(nombre))`);
    await q.query(`CREATE UNIQUE INDEX uq_categorias_nombre_ci ON categorias (coalesce(padre_id, 0), f_normalizar(nombre))`);
    await q.query(`CREATE UNIQUE INDEX uq_productos_codigo_ci ON productos (upper(codigo))`);

    await q.query(`ALTER TABLE productos ADD CONSTRAINT ck_productos_costo CHECK (costo_usd >= 0)`);
    await q.query(
      `ALTER TABLE productos ADD CONSTRAINT ck_productos_stock CHECK (stock_minimo >= 0 AND (stock_maximo IS NULL OR stock_maximo >= stock_minimo))`,
    );
    await q.query(`ALTER TABLE precios_producto ADD CONSTRAINT ck_precios_positivo CHECK (precio_usd >= 0)`);
    await q.query(`ALTER TABLE presentaciones ADD CONSTRAINT ck_presentaciones_factor CHECK (factor > 0)`);
    await q.query(`ALTER TABLE tasas_cambio ADD CONSTRAINT ck_tasas_valor CHECK (valor > 0)`);
    await q.query(`ALTER TABLE listas_precio ADD CONSTRAINT ck_listas_margen CHECK (margen_por_defecto > -100)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE listas_precio DROP CONSTRAINT ck_listas_margen`);
    await q.query(`ALTER TABLE tasas_cambio DROP CONSTRAINT ck_tasas_valor`);
    await q.query(`ALTER TABLE presentaciones DROP CONSTRAINT ck_presentaciones_factor`);
    await q.query(`ALTER TABLE precios_producto DROP CONSTRAINT ck_precios_positivo`);
    await q.query(`ALTER TABLE productos DROP CONSTRAINT ck_productos_stock`);
    await q.query(`ALTER TABLE productos DROP CONSTRAINT ck_productos_costo`);
    await q.query(`DROP INDEX uq_productos_codigo_ci`);
    await q.query(`DROP INDEX uq_categorias_nombre_ci`);
    await q.query(`DROP INDEX uq_marcas_nombre_ci`);
    await q.query(`DROP INDEX idx_precios_producto_lista`);
    await q.query(`DROP INDEX idx_codigos_barras_producto`);
    await q.query(`DROP INDEX idx_productos_marca`);
    await q.query(`DROP INDEX idx_productos_categoria`);
    await q.query(`DROP INDEX idx_productos_codigo_trgm`);
    await q.query(`DROP INDEX idx_productos_descripcion_trgm`);
    await q.query(`DROP FUNCTION f_normalizar(text)`);
  }
}
