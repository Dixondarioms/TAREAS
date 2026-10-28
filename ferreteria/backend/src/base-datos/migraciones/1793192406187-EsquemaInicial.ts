import { MigrationInterface, QueryRunner } from 'typeorm';

export class EsquemaInicial1793192406187 implements MigrationInterface {
  name = 'EsquemaInicial1793192406187';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "categorias" ("id" SERIAL NOT NULL, "nombre" character varying(100) NOT NULL, "padre_id" integer, CONSTRAINT "PK_3886a26251605c571c6b4f861fe" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "marcas" ("id" SERIAL NOT NULL, "nombre" character varying(100) NOT NULL, CONSTRAINT "UQ_29f5713899c32a96a8900143c6f" UNIQUE ("nombre"), CONSTRAINT "PK_0dabf9ed9a15bfb634cb675f7d4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "listas_precio" ("id" SERIAL NOT NULL, "codigo" character varying(20) NOT NULL, "nombre" character varying(60) NOT NULL, "margen_por_defecto" numeric(9,4) NOT NULL, "orden" integer NOT NULL DEFAULT '0', "activa" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_7bdbc9af6371aace52de4c317ea" UNIQUE ("codigo"), CONSTRAINT "PK_fedad818876ac3b1e6593c79a1c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE TYPE "public"."modo_precio" AS ENUM('MARGEN', 'FIJO')`);
    await queryRunner.query(
      `CREATE TABLE "precios_producto" ("id" SERIAL NOT NULL, "producto_id" integer NOT NULL, "lista_id" integer NOT NULL, "modo" "public"."modo_precio" NOT NULL DEFAULT 'MARGEN', "margen" numeric(9,4), "precio_usd" numeric(18,4) NOT NULL, "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_5b339a43435e5d27fddf0f8bbd3" UNIQUE ("producto_id", "lista_id"), CONSTRAINT "PK_7627ac2c44da18df18b6d77fc7f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "unidades_medida" ("id" SERIAL NOT NULL, "codigo" character varying(10) NOT NULL, "nombre" character varying(50) NOT NULL, "permite_decimales" boolean NOT NULL DEFAULT false, CONSTRAINT "UQ_d97cb04b559197c7009e0f8903c" UNIQUE ("codigo"), CONSTRAINT "PK_b299f0e6758c0c02ae3e729232a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE TYPE "public"."alicuota_iva" AS ENUM('GENERAL', 'REDUCIDA', 'EXENTO')`);
    await queryRunner.query(
      `CREATE TABLE "productos" ("id" SERIAL NOT NULL, "codigo" character varying(40) NOT NULL, "descripcion" character varying(200) NOT NULL, "categoria_id" integer, "marca_id" integer, "unidad_base_id" integer NOT NULL, "costo_usd" numeric(18,4) NOT NULL DEFAULT '0', "costo_actualizado_en" TIMESTAMP WITH TIME ZONE, "alicuota_iva" "public"."alicuota_iva" NOT NULL DEFAULT 'GENERAL', "stock_minimo" numeric(18,3) NOT NULL DEFAULT '0', "stock_maximo" numeric(18,3), "ubicacion" character varying(60), "notas" text, "activo" boolean NOT NULL DEFAULT true, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_2da210b34325c2319d784a32d49" UNIQUE ("codigo"), CONSTRAINT "PK_04f604609a0949a7f3b43400766" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "presentaciones" ("id" SERIAL NOT NULL, "producto_id" integer NOT NULL, "unidad_id" integer NOT NULL, "factor" numeric(18,6) NOT NULL, CONSTRAINT "UQ_f5669c48425573efa81e1531221" UNIQUE ("producto_id", "unidad_id"), CONSTRAINT "PK_897115c262a0aeea43603552d6c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "codigos_barras" ("id" SERIAL NOT NULL, "codigo" character varying(50) NOT NULL, "producto_id" integer NOT NULL, "presentacion_id" integer, CONSTRAINT "UQ_01ff171957fbaed5fa8c7583b82" UNIQUE ("codigo"), CONSTRAINT "PK_dd3058a512053fbf2a1fd3cf398" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE TYPE "public"."rol_usuario" AS ENUM('ADMIN', 'GERENTE', 'ALMACEN', 'CAJERO')`);
    await queryRunner.query(
      `CREATE TABLE "usuarios" ("id" SERIAL NOT NULL, "usuario" character varying(40) NOT NULL, "nombre" character varying(100) NOT NULL, "clave_hash" character varying(100) NOT NULL, "rol" "public"."rol_usuario" NOT NULL, "activo" boolean NOT NULL DEFAULT true, "ultimo_acceso" TIMESTAMP WITH TIME ZONE, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_0790a401b9d234fa921e9aa1777" UNIQUE ("usuario"), CONSTRAINT "PK_d7281c63c176e152e4c531594a8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "historial_costos" ("id" SERIAL NOT NULL, "producto_id" integer NOT NULL, "costo_anterior" numeric(18,4) NOT NULL, "costo_nuevo" numeric(18,4) NOT NULL, "motivo" character varying(200) NOT NULL, "usuario_id" integer, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b5c6ee566ec61e4b1c98335a2de" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_e37a7065054d89432418772ea4" ON "historial_costos" ("producto_id", "creado_en") `);
    await queryRunner.query(
      `CREATE TABLE "parametros" ("clave" character varying(60) NOT NULL, "valor" jsonb NOT NULL, "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_d52f3fb26992445525eaa8ce435" PRIMARY KEY ("clave"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "proveedores" ("id" SERIAL NOT NULL, "rif" character varying(15) NOT NULL, "razon_social" character varying(150) NOT NULL, "contacto" character varying(100), "telefono" character varying(60), "correo" character varying(120), "direccion" text, "notas" text, "activo" boolean NOT NULL DEFAULT true, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_9fcb78011a3d90194783ea1c037" UNIQUE ("rif"), CONSTRAINT "PK_1dcf121f19f362fb1b4c0a493a9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "productos_proveedores" ("id" SERIAL NOT NULL, "producto_id" integer NOT NULL, "proveedor_id" integer NOT NULL, "codigo_proveedor" character varying(60), "costo_usd" numeric(18,4), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_9f130e4a65ffca4c4b5d13750c4" UNIQUE ("producto_id", "proveedor_id"), CONSTRAINT "PK_d74d0c959e8602ed74311210335" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a5976b05c6e894f569597434c2" ON "productos_proveedores" ("proveedor_id", "codigo_proveedor") `,
    );
    await queryRunner.query(`CREATE TYPE "public"."moneda" AS ENUM('USD', 'EUR')`);
    await queryRunner.query(`CREATE TYPE "public"."fuente_tasa" AS ENUM('BCV', 'MANUAL')`);
    await queryRunner.query(
      `CREATE TABLE "tasas_cambio" ("id" SERIAL NOT NULL, "moneda" "public"."moneda" NOT NULL, "valor" numeric(20,8) NOT NULL, "fecha_valor" date NOT NULL, "fuente" "public"."fuente_tasa" NOT NULL, "creado_por_id" integer, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_4f6fd2e25375fbcd6cd245db7f8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0f85a2665abd9f0bc5c6c7549b" ON "tasas_cambio" ("moneda", "fecha_valor", "creado_en") `,
    );
    await queryRunner.query(
      `ALTER TABLE "categorias" ADD CONSTRAINT "FK_e365ca3e687b87a6158766ed4ca" FOREIGN KEY ("padre_id") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "precios_producto" ADD CONSTRAINT "FK_a8c4a31c129da50bdd7ae4dec95" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "precios_producto" ADD CONSTRAINT "FK_bfe80561d1380884618ded21a6f" FOREIGN KEY ("lista_id") REFERENCES "listas_precio"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "productos" ADD CONSTRAINT "FK_5aaee6054b643e7c778477193a3" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "productos" ADD CONSTRAINT "FK_db0c18bdd5f379d40ae838e74bd" FOREIGN KEY ("marca_id") REFERENCES "marcas"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "productos" ADD CONSTRAINT "FK_4e2b90119d92518628f053c1026" FOREIGN KEY ("unidad_base_id") REFERENCES "unidades_medida"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "presentaciones" ADD CONSTRAINT "FK_9f4f1800c2128621bf4268b7f85" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "presentaciones" ADD CONSTRAINT "FK_c1f51de306cc7b863a7a502ae52" FOREIGN KEY ("unidad_id") REFERENCES "unidades_medida"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "codigos_barras" ADD CONSTRAINT "FK_ab80bbf2d90c3bc19be7d28ed8e" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "codigos_barras" ADD CONSTRAINT "FK_45213cddcada7bcd9d27c9b5e0c" FOREIGN KEY ("presentacion_id") REFERENCES "presentaciones"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "historial_costos" ADD CONSTRAINT "FK_fba58935df1f3cde2910d26b077" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "historial_costos" ADD CONSTRAINT "FK_4bf036065fb432f08eb9198cbf2" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "productos_proveedores" ADD CONSTRAINT "FK_4b6ab8a575de021e608c670117d" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "productos_proveedores" ADD CONSTRAINT "FK_f0ef5adb05cf58d13a1dc420ccc" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasas_cambio" ADD CONSTRAINT "FK_b16bfef7d60da32a25b2b18021e" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tasas_cambio" DROP CONSTRAINT "FK_b16bfef7d60da32a25b2b18021e"`);
    await queryRunner.query(`ALTER TABLE "productos_proveedores" DROP CONSTRAINT "FK_f0ef5adb05cf58d13a1dc420ccc"`);
    await queryRunner.query(`ALTER TABLE "productos_proveedores" DROP CONSTRAINT "FK_4b6ab8a575de021e608c670117d"`);
    await queryRunner.query(`ALTER TABLE "historial_costos" DROP CONSTRAINT "FK_4bf036065fb432f08eb9198cbf2"`);
    await queryRunner.query(`ALTER TABLE "historial_costos" DROP CONSTRAINT "FK_fba58935df1f3cde2910d26b077"`);
    await queryRunner.query(`ALTER TABLE "codigos_barras" DROP CONSTRAINT "FK_45213cddcada7bcd9d27c9b5e0c"`);
    await queryRunner.query(`ALTER TABLE "codigos_barras" DROP CONSTRAINT "FK_ab80bbf2d90c3bc19be7d28ed8e"`);
    await queryRunner.query(`ALTER TABLE "presentaciones" DROP CONSTRAINT "FK_c1f51de306cc7b863a7a502ae52"`);
    await queryRunner.query(`ALTER TABLE "presentaciones" DROP CONSTRAINT "FK_9f4f1800c2128621bf4268b7f85"`);
    await queryRunner.query(`ALTER TABLE "productos" DROP CONSTRAINT "FK_4e2b90119d92518628f053c1026"`);
    await queryRunner.query(`ALTER TABLE "productos" DROP CONSTRAINT "FK_db0c18bdd5f379d40ae838e74bd"`);
    await queryRunner.query(`ALTER TABLE "productos" DROP CONSTRAINT "FK_5aaee6054b643e7c778477193a3"`);
    await queryRunner.query(`ALTER TABLE "precios_producto" DROP CONSTRAINT "FK_bfe80561d1380884618ded21a6f"`);
    await queryRunner.query(`ALTER TABLE "precios_producto" DROP CONSTRAINT "FK_a8c4a31c129da50bdd7ae4dec95"`);
    await queryRunner.query(`ALTER TABLE "categorias" DROP CONSTRAINT "FK_e365ca3e687b87a6158766ed4ca"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_0f85a2665abd9f0bc5c6c7549b"`);
    await queryRunner.query(`DROP TABLE "tasas_cambio"`);
    await queryRunner.query(`DROP TYPE "public"."fuente_tasa"`);
    await queryRunner.query(`DROP TYPE "public"."moneda"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_a5976b05c6e894f569597434c2"`);
    await queryRunner.query(`DROP TABLE "productos_proveedores"`);
    await queryRunner.query(`DROP TABLE "proveedores"`);
    await queryRunner.query(`DROP TABLE "parametros"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_e37a7065054d89432418772ea4"`);
    await queryRunner.query(`DROP TABLE "historial_costos"`);
    await queryRunner.query(`DROP TABLE "usuarios"`);
    await queryRunner.query(`DROP TYPE "public"."rol_usuario"`);
    await queryRunner.query(`DROP TABLE "codigos_barras"`);
    await queryRunner.query(`DROP TABLE "presentaciones"`);
    await queryRunner.query(`DROP TABLE "productos"`);
    await queryRunner.query(`DROP TYPE "public"."alicuota_iva"`);
    await queryRunner.query(`DROP TABLE "unidades_medida"`);
    await queryRunner.query(`DROP TABLE "precios_producto"`);
    await queryRunner.query(`DROP TYPE "public"."modo_precio"`);
    await queryRunner.query(`DROP TABLE "listas_precio"`);
    await queryRunner.query(`DROP TABLE "marcas"`);
    await queryRunner.query(`DROP TABLE "categorias"`);
  }
}
