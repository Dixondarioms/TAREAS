import { MigrationInterface, QueryRunner } from 'typeorm';

/** Fase 5: compras (recepción de mercancía), sus renglones y los pagos a proveedores. */
export class Compras1793260000000 implements MigrationInterface {
  name = 'Compras1793260000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "public"."condicion_compra" AS ENUM('CONTADO', 'CREDITO')`);
    await queryRunner.query(
      `CREATE TABLE "compras" ("id" SERIAL NOT NULL, "proveedor_id" integer NOT NULL, "fecha" date NOT NULL, "numero" character varying(30) NOT NULL, "numero_control" character varying(30), "moneda" character varying(3) NOT NULL, "tasa" numeric(18,8) NOT NULL, "subtotal" numeric(18,2) NOT NULL, "iva" numeric(18,2) NOT NULL, "total" numeric(18,2) NOT NULL, "condicion" "public"."condicion_compra" NOT NULL, "vencimiento" date, "saldo" numeric(18,2) NOT NULL, "actualizo_costos" boolean NOT NULL, "factura_compra_id" integer, "notas" text, "usuario_id" integer NOT NULL, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_compras" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "compras_lineas" ("id" SERIAL NOT NULL, "compra_id" integer NOT NULL, "producto_id" integer NOT NULL, "codigo" character varying(40) NOT NULL, "descripcion" character varying(200) NOT NULL, "presentacion_id" integer, "unidad" character varying(10) NOT NULL, "factor" numeric(18,6) NOT NULL, "cantidad" numeric(18,3) NOT NULL, "costo_unitario" numeric(18,4) NOT NULL, "alicuota_iva" "public"."alicuota_iva" NOT NULL, "subtotal" numeric(18,2) NOT NULL, CONSTRAINT "PK_compras_lineas" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "pagos_proveedor" ("id" SERIAL NOT NULL, "compra_id" integer NOT NULL, "fecha" date NOT NULL, "metodo" character varying(20) NOT NULL, "monto" numeric(18,2) NOT NULL, "referencia" character varying(60), "usuario_id" integer NOT NULL, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_pagos_proveedor" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "compras" ADD CONSTRAINT "fk_compras_proveedor" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "compras" ADD CONSTRAINT "fk_compras_factura_compra" FOREIGN KEY ("factura_compra_id") REFERENCES "facturas_compra"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "compras" ADD CONSTRAINT "fk_compras_usuario" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "compras_lineas" ADD CONSTRAINT "fk_compras_lineas_compra" FOREIGN KEY ("compra_id") REFERENCES "compras"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "pagos_proveedor" ADD CONSTRAINT "fk_pagos_proveedor_compra" FOREIGN KEY ("compra_id") REFERENCES "compras"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "pagos_proveedor" ADD CONSTRAINT "fk_pagos_proveedor_usuario" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );

    await queryRunner.query(`CREATE INDEX "idx_compras_proveedor" ON "compras" ("proveedor_id") `);
    await queryRunner.query(`CREATE INDEX "idx_compras_lineas_compra" ON "compras_lineas" ("compra_id") `);
    await queryRunner.query(`CREATE INDEX "idx_pagos_proveedor_compra" ON "pagos_proveedor" ("compra_id") `);
    await queryRunner.query(`CREATE INDEX idx_compras_saldo ON compras (vencimiento) WHERE saldo > 0`);
    await queryRunner.query(
      `ALTER TABLE compras ADD CONSTRAINT ck_compras_montos CHECK (subtotal >= 0 AND iva >= 0 AND total = subtotal + iva AND saldo >= 0 AND saldo <= total AND tasa > 0)`,
    );
    await queryRunner.query(
      `ALTER TABLE compras_lineas ADD CONSTRAINT ck_compras_lineas CHECK (cantidad > 0 AND factor > 0 AND costo_unitario >= 0)`,
    );
    await queryRunner.query(`ALTER TABLE pagos_proveedor ADD CONSTRAINT ck_pagos_proveedor_monto CHECK (monto > 0)`);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_compras_documento ON compras (proveedor_id, numero)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX uq_compras_documento`);
    await queryRunner.query(`DROP INDEX idx_compras_saldo`);
    await queryRunner.query(`ALTER TABLE "pagos_proveedor" DROP CONSTRAINT "fk_pagos_proveedor_usuario"`);
    await queryRunner.query(`ALTER TABLE "pagos_proveedor" DROP CONSTRAINT "fk_pagos_proveedor_compra"`);
    await queryRunner.query(`ALTER TABLE "compras_lineas" DROP CONSTRAINT "fk_compras_lineas_compra"`);
    await queryRunner.query(`ALTER TABLE "compras" DROP CONSTRAINT "fk_compras_usuario"`);
    await queryRunner.query(`ALTER TABLE "compras" DROP CONSTRAINT "fk_compras_factura_compra"`);
    await queryRunner.query(`ALTER TABLE "compras" DROP CONSTRAINT "fk_compras_proveedor"`);
    await queryRunner.query(`DROP TABLE "pagos_proveedor"`);
    await queryRunner.query(`DROP TABLE "compras_lineas"`);
    await queryRunner.query(`DROP TABLE "compras"`);
    await queryRunner.query(`DROP TYPE "public"."condicion_compra"`);
  }
}
