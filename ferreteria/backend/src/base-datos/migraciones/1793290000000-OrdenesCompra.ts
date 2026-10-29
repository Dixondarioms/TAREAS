import { MigrationInterface, QueryRunner } from 'typeorm';

/** Órdenes de compra a proveedores y anulación de compras registradas por error. */
export class OrdenesCompra1793290000000 implements MigrationInterface {
  name = 'OrdenesCompra1793290000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "public"."estado_orden" AS ENUM('PENDIENTE', 'PARCIAL', 'RECIBIDA', 'CANCELADA')`);
    await queryRunner.query(
      `CREATE TABLE "ordenes_compra" ("id" SERIAL NOT NULL, "proveedor_id" integer NOT NULL, "fecha" date NOT NULL, "moneda" character varying(3) NOT NULL, "estado" "public"."estado_orden" NOT NULL DEFAULT 'PENDIENTE', "subtotal" numeric(18,2) NOT NULL, "notas" text, "usuario_id" integer NOT NULL, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_ordenes_compra" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "idx_ordenes_compra_proveedor" ON "ordenes_compra" ("proveedor_id") `);
    await queryRunner.query(
      `CREATE TABLE "ordenes_compra_lineas" ("id" SERIAL NOT NULL, "orden_id" integer NOT NULL, "producto_id" integer NOT NULL, "codigo" character varying(40) NOT NULL, "descripcion" character varying(200) NOT NULL, "presentacion_id" integer, "unidad" character varying(10) NOT NULL, "factor" numeric(18,6) NOT NULL, "cantidad" numeric(18,3) NOT NULL, "cantidad_recibida" numeric(18,3) NOT NULL DEFAULT '0', "costo_unitario" numeric(18,4) NOT NULL, CONSTRAINT "PK_ordenes_compra_lineas" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "idx_ordenes_compra_lineas_orden" ON "ordenes_compra_lineas" ("orden_id") `);
    await queryRunner.query(`CREATE TYPE "public"."estado_compra" AS ENUM('REGISTRADA', 'ANULADA')`);
    await queryRunner.query(`ALTER TABLE "compras" ADD "estado" "public"."estado_compra" NOT NULL DEFAULT 'REGISTRADA'`);
    await queryRunner.query(`ALTER TABLE "compras" ADD "anulada_en" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "compras" ADD "motivo_anulacion" character varying(200)`);
    await queryRunner.query(`ALTER TABLE "compras" ADD "orden_id" integer`);
    await queryRunner.query(
      `ALTER TABLE "ordenes_compra" ADD CONSTRAINT "fk_ordenes_compra_proveedor" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ordenes_compra" ADD CONSTRAINT "fk_ordenes_compra_usuario" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ordenes_compra_lineas" ADD CONSTRAINT "fk_ordenes_compra_lineas_orden" FOREIGN KEY ("orden_id") REFERENCES "ordenes_compra"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "compras" ADD CONSTRAINT "fk_compras_orden" FOREIGN KEY ("orden_id") REFERENCES "ordenes_compra"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    // Hechas a mano: el generador no las ve.
    await queryRunner.query(`ALTER TABLE ordenes_compra ADD CONSTRAINT ck_ordenes_compra_subtotal CHECK (subtotal >= 0)`);
    await queryRunner.query(
      `ALTER TABLE ordenes_compra_lineas ADD CONSTRAINT ck_ordenes_compra_lineas CHECK (cantidad > 0 AND cantidad_recibida >= 0 AND factor > 0 AND costo_unitario >= 0)`,
    );
    // Una compra anulada libera su número de documento para registrarlo bien.
    await queryRunner.query(`DROP INDEX uq_compras_documento`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_compras_documento ON compras (proveedor_id, numero) WHERE estado <> 'ANULADA'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX uq_compras_documento`);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_compras_documento ON compras (proveedor_id, numero)`);
    await queryRunner.query(`ALTER TABLE "compras" DROP CONSTRAINT "fk_compras_orden"`);
    await queryRunner.query(`ALTER TABLE "compras" DROP COLUMN "orden_id"`);
    await queryRunner.query(`ALTER TABLE "compras" DROP COLUMN "motivo_anulacion"`);
    await queryRunner.query(`ALTER TABLE "compras" DROP COLUMN "anulada_en"`);
    await queryRunner.query(`ALTER TABLE "compras" DROP COLUMN "estado"`);
    await queryRunner.query(`DROP TYPE "public"."estado_compra"`);
    await queryRunner.query(`DROP TABLE "ordenes_compra_lineas"`);
    await queryRunner.query(`DROP TABLE "ordenes_compra"`);
    await queryRunner.query(`DROP TYPE "public"."estado_orden"`);
  }
}
