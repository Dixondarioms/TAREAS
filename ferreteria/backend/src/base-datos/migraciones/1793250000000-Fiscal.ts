import { MigrationInterface, QueryRunner } from 'typeorm';

/** Módulo fiscal: talonarios de notas de crédito, notas de crédito y facturas de compra. */
export class Fiscal1793250000000 implements MigrationInterface {
  name = 'Fiscal1793250000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "public"."tipo_documento_compra" AS ENUM('FACTURA', 'NOTA_CREDITO', 'NOTA_DEBITO')`);
    await queryRunner.query(
      `CREATE TABLE "facturas_compra" ("id" SERIAL NOT NULL, "proveedor_id" integer NOT NULL, "tipo" "public"."tipo_documento_compra" NOT NULL DEFAULT 'FACTURA', "fecha" date NOT NULL, "numero" character varying(30) NOT NULL, "numero_control" character varying(30) NOT NULL, "factura_afectada" character varying(30), "base_exenta_bs" numeric(18,2) NOT NULL DEFAULT '0', "base_general_bs" numeric(18,2) NOT NULL DEFAULT '0', "iva_general_bs" numeric(18,2) NOT NULL DEFAULT '0', "base_reducida_bs" numeric(18,2) NOT NULL DEFAULT '0', "iva_reducida_bs" numeric(18,2) NOT NULL DEFAULT '0', "total_bs" numeric(18,2) NOT NULL, "iva_retenido_bs" numeric(18,2) NOT NULL DEFAULT '0', "notas" text, "usuario_id" integer, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_facturas_compra_numero" UNIQUE ("proveedor_id", "tipo", "numero"), CONSTRAINT "PK_facturas_compra" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "notas_credito" ("id" SERIAL NOT NULL, "venta_id" integer NOT NULL, "sesion_id" integer NOT NULL, "usuario_id" integer NOT NULL, "talonario_id" integer NOT NULL, "serie" character varying(10) NOT NULL DEFAULT '', "numero" integer NOT NULL, "numero_control" character varying(30) NOT NULL, "motivo" character varying(200) NOT NULL, "devolver_inventario" boolean NOT NULL, "base_exenta_bs" numeric(18,2) NOT NULL, "base_general_bs" numeric(18,2) NOT NULL, "iva_general_bs" numeric(18,2) NOT NULL, "base_reducida_bs" numeric(18,2) NOT NULL, "iva_reducida_bs" numeric(18,2) NOT NULL, "total_bs" numeric(18,2) NOT NULL, "reintegro_metodo" character varying(20) NOT NULL, "reintegro_monto" numeric(18,2) NOT NULL, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_notas_credito" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_notas_credito_numero" ON "notas_credito" ("talonario_id", "numero") `);
    await queryRunner.query(
      `CREATE TABLE "notas_credito_lineas" ("id" SERIAL NOT NULL, "nota_id" integer NOT NULL, "venta_linea_id" integer NOT NULL, "producto_id" integer NOT NULL, "codigo" character varying(40) NOT NULL, "descripcion" character varying(200) NOT NULL, "unidad" character varying(10) NOT NULL, "factor" numeric(18,6) NOT NULL, "cantidad" numeric(18,3) NOT NULL, "alicuota_iva" "public"."alicuota_iva" NOT NULL, "precio_bs" numeric(18,2) NOT NULL, "subtotal_bs" numeric(18,2) NOT NULL, CONSTRAINT "PK_notas_credito_lineas" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE TYPE "public"."tipo_documento" AS ENUM('FACTURA', 'NOTA_CREDITO')`);
    await queryRunner.query(`ALTER TABLE "talonarios" ADD "tipo" "public"."tipo_documento" NOT NULL DEFAULT 'FACTURA'`);
    await queryRunner.query(
      `ALTER TABLE "facturas_compra" ADD CONSTRAINT "fk_facturas_compra_proveedor" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "facturas_compra" ADD CONSTRAINT "fk_facturas_compra_usuario" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notas_credito" ADD CONSTRAINT "fk_notas_credito_venta" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notas_credito" ADD CONSTRAINT "fk_notas_credito_sesion" FOREIGN KEY ("sesion_id") REFERENCES "sesiones_caja"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notas_credito" ADD CONSTRAINT "fk_notas_credito_usuario" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notas_credito" ADD CONSTRAINT "fk_notas_credito_talonario" FOREIGN KEY ("talonario_id") REFERENCES "talonarios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notas_credito_lineas" ADD CONSTRAINT "fk_notas_credito_lineas_nota" FOREIGN KEY ("nota_id") REFERENCES "notas_credito"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notas_credito_lineas" ADD CONSTRAINT "fk_notas_credito_lineas_venta_linea" FOREIGN KEY ("venta_linea_id") REFERENCES "ventas_lineas"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    // Índices de consulta y reglas que la base debe garantizar.
    await queryRunner.query(`CREATE INDEX idx_facturas_compra_fecha ON facturas_compra (fecha)`);
    await queryRunner.query(`CREATE INDEX idx_notas_credito_venta ON notas_credito (venta_id)`);
    await queryRunner.query(`CREATE INDEX idx_notas_credito_sesion ON notas_credito (sesion_id)`);
    await queryRunner.query(`CREATE INDEX idx_notas_credito_creado_en ON notas_credito (creado_en)`);
    await queryRunner.query(`CREATE INDEX idx_notas_credito_lineas_nota ON notas_credito_lineas (nota_id)`);
    await queryRunner.query(`CREATE INDEX idx_notas_credito_lineas_venta_linea ON notas_credito_lineas (venta_linea_id)`);
    await queryRunner.query(
      `ALTER TABLE notas_credito ADD CONSTRAINT ck_notas_credito_montos CHECK (total_bs > 0 AND reintegro_monto >= 0)`,
    );
    await queryRunner.query(`ALTER TABLE notas_credito_lineas ADD CONSTRAINT ck_notas_credito_lineas CHECK (cantidad > 0)`);
    await queryRunner.query(
      `ALTER TABLE facturas_compra ADD CONSTRAINT ck_facturas_compra_montos CHECK (base_exenta_bs >= 0 AND base_general_bs >= 0 AND iva_general_bs >= 0 AND base_reducida_bs >= 0 AND iva_reducida_bs >= 0 AND iva_retenido_bs >= 0 AND total_bs > 0)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notas_credito_lineas" DROP CONSTRAINT "fk_notas_credito_lineas_venta_linea"`);
    await queryRunner.query(`ALTER TABLE "notas_credito_lineas" DROP CONSTRAINT "fk_notas_credito_lineas_nota"`);
    await queryRunner.query(`ALTER TABLE "notas_credito" DROP CONSTRAINT "fk_notas_credito_talonario"`);
    await queryRunner.query(`ALTER TABLE "notas_credito" DROP CONSTRAINT "fk_notas_credito_usuario"`);
    await queryRunner.query(`ALTER TABLE "notas_credito" DROP CONSTRAINT "fk_notas_credito_sesion"`);
    await queryRunner.query(`ALTER TABLE "notas_credito" DROP CONSTRAINT "fk_notas_credito_venta"`);
    await queryRunner.query(`ALTER TABLE "facturas_compra" DROP CONSTRAINT "fk_facturas_compra_usuario"`);
    await queryRunner.query(`ALTER TABLE "facturas_compra" DROP CONSTRAINT "fk_facturas_compra_proveedor"`);
    await queryRunner.query(`ALTER TABLE "talonarios" DROP COLUMN "tipo"`);
    await queryRunner.query(`DROP TYPE "public"."tipo_documento"`);
    await queryRunner.query(`DROP TABLE "notas_credito_lineas"`);
    await queryRunner.query(`DROP INDEX "public"."uq_notas_credito_numero"`);
    await queryRunner.query(`DROP TABLE "notas_credito"`);
    await queryRunner.query(`DROP TABLE "facturas_compra"`);
    await queryRunner.query(`DROP TYPE "public"."tipo_documento_compra"`);
  }
}
