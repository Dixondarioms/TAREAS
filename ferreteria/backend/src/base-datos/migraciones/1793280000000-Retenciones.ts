import { MigrationInterface, QueryRunner } from 'typeorm';

/** Retenciones de IVA (comprobantes emitidos), retención descontada de compras y notas de débito de venta. */
export class Retenciones1793280000000 implements MigrationInterface {
  name = 'Retenciones1793280000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "notas_debito" ("id" SERIAL NOT NULL, "venta_id" integer NOT NULL, "sesion_id" integer NOT NULL, "usuario_id" integer NOT NULL, "talonario_id" integer NOT NULL, "serie" character varying(10) NOT NULL DEFAULT '', "numero" integer NOT NULL, "numero_control" character varying(30) NOT NULL, "concepto" character varying(200) NOT NULL, "alicuota_iva" "public"."alicuota_iva" NOT NULL, "porcentaje_iva" numeric(5,2) NOT NULL, "base_bs" numeric(18,2) NOT NULL, "iva_bs" numeric(18,2) NOT NULL, "total_bs" numeric(18,2) NOT NULL, "tasa" numeric(18,8) NOT NULL, "metodo" character varying(20) NOT NULL, "monto" numeric(18,2) NOT NULL, "referencia" character varying(60), "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_notas_debito" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "idx_notas_debito_venta" ON "notas_debito" ("venta_id") `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_notas_debito_numero" ON "notas_debito" ("talonario_id", "numero") `);
    await queryRunner.query(`ALTER TABLE "facturas_compra" ADD "porcentaje_retencion" numeric(5,2) NOT NULL DEFAULT '0'`);
    await queryRunner.query(`ALTER TABLE "facturas_compra" ADD "numero_comprobante" character varying(14)`);
    await queryRunner.query(
      `ALTER TABLE "facturas_compra" ADD CONSTRAINT "UQ_2eb9bba129d53b47c4e2ae175ba" UNIQUE ("numero_comprobante")`,
    );
    await queryRunner.query(`ALTER TABLE "facturas_compra" ADD "fecha_comprobante" date`);
    await queryRunner.query(`ALTER TABLE "compras" ADD "retencion_iva" numeric(18,2) NOT NULL DEFAULT '0'`);
    await queryRunner.query(`ALTER TYPE "public"."tipo_documento" RENAME TO "tipo_documento_old"`);
    await queryRunner.query(`CREATE TYPE "public"."tipo_documento" AS ENUM('FACTURA', 'NOTA_CREDITO', 'NOTA_DEBITO')`);
    await queryRunner.query(`ALTER TABLE "talonarios" ALTER COLUMN "tipo" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "talonarios" ALTER COLUMN "tipo" TYPE "public"."tipo_documento" USING "tipo"::"text"::"public"."tipo_documento"`,
    );
    await queryRunner.query(`ALTER TABLE "talonarios" ALTER COLUMN "tipo" SET DEFAULT 'FACTURA'`);
    await queryRunner.query(`DROP TYPE "public"."tipo_documento_old"`);
    await queryRunner.query(
      `ALTER TABLE "notas_debito" ADD CONSTRAINT "fk_notas_debito_venta" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notas_debito" ADD CONSTRAINT "fk_notas_debito_sesion" FOREIGN KEY ("sesion_id") REFERENCES "sesiones_caja"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notas_debito" ADD CONSTRAINT "fk_notas_debito_usuario" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notas_debito" ADD CONSTRAINT "fk_notas_debito_talonario" FOREIGN KEY ("talonario_id") REFERENCES "talonarios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE notas_debito ADD CONSTRAINT ck_notas_debito_montos CHECK (base_bs > 0 AND iva_bs >= 0 AND total_bs = base_bs + iva_bs AND monto > 0)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notas_debito" DROP CONSTRAINT "fk_notas_debito_talonario"`);
    await queryRunner.query(`ALTER TABLE "notas_debito" DROP CONSTRAINT "fk_notas_debito_usuario"`);
    await queryRunner.query(`ALTER TABLE "notas_debito" DROP CONSTRAINT "fk_notas_debito_sesion"`);
    await queryRunner.query(`ALTER TABLE "notas_debito" DROP CONSTRAINT "fk_notas_debito_venta"`);
    await queryRunner.query(`CREATE TYPE "public"."tipo_documento_old" AS ENUM('FACTURA', 'NOTA_CREDITO')`);
    await queryRunner.query(`ALTER TABLE "talonarios" ALTER COLUMN "tipo" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "talonarios" ALTER COLUMN "tipo" TYPE "public"."tipo_documento_old" USING "tipo"::"text"::"public"."tipo_documento_old"`,
    );
    await queryRunner.query(`ALTER TABLE "talonarios" ALTER COLUMN "tipo" SET DEFAULT 'FACTURA'`);
    await queryRunner.query(`DROP TYPE "public"."tipo_documento"`);
    await queryRunner.query(`ALTER TYPE "public"."tipo_documento_old" RENAME TO "tipo_documento"`);
    await queryRunner.query(`ALTER TABLE "compras" DROP COLUMN "retencion_iva"`);
    await queryRunner.query(`ALTER TABLE "facturas_compra" DROP COLUMN "fecha_comprobante"`);
    await queryRunner.query(`ALTER TABLE "facturas_compra" DROP CONSTRAINT "UQ_2eb9bba129d53b47c4e2ae175ba"`);
    await queryRunner.query(`ALTER TABLE "facturas_compra" DROP COLUMN "numero_comprobante"`);
    await queryRunner.query(`ALTER TABLE "facturas_compra" DROP COLUMN "porcentaje_retencion"`);
    await queryRunner.query(`DROP INDEX "public"."uq_notas_debito_numero"`);
    await queryRunner.query(`DROP INDEX "public"."idx_notas_debito_venta"`);
    await queryRunner.query(`DROP TABLE "notas_debito"`);
  }
}
