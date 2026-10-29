import { MigrationInterface, QueryRunner } from 'typeorm';

/** Fase 6: crédito a clientes (cuentas por cobrar y abonos) y costo en las líneas de venta. */
export class Credito1793270000000 implements MigrationInterface {
  name = 'Credito1793270000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "cuentas_cobrar" ("id" SERIAL NOT NULL, "venta_id" integer NOT NULL, "cliente_id" integer NOT NULL, "monto_usd" numeric(18,2) NOT NULL, "saldo_usd" numeric(18,2) NOT NULL, "vencimiento" date NOT NULL, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_9a82ed264792f267672e9388cdf" UNIQUE ("venta_id"), CONSTRAINT "PK_cuentas_cobrar" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "idx_cuentas_cobrar_cliente" ON "cuentas_cobrar" ("cliente_id") `);
    await queryRunner.query(
      `CREATE TABLE "abonos_cliente" ("id" SERIAL NOT NULL, "cliente_id" integer NOT NULL, "sesion_id" integer, "nota_credito_id" integer, "metodo" character varying(20) NOT NULL, "monto" numeric(18,2) NOT NULL, "monto_bs" numeric(18,2) NOT NULL, "tasa" numeric(18,8) NOT NULL, "monto_usd" numeric(18,2) NOT NULL, "referencia" character varying(60), "usuario_id" integer NOT NULL, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_abonos_cliente" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "idx_abonos_cliente_cliente" ON "abonos_cliente" ("cliente_id") `);
    await queryRunner.query(
      `CREATE TABLE "aplicaciones_abono" ("id" SERIAL NOT NULL, "abono_id" integer NOT NULL, "cuenta_id" integer NOT NULL, "monto_usd" numeric(18,2) NOT NULL, CONSTRAINT "PK_aplicaciones_abono" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "idx_aplicaciones_abono_cuenta" ON "aplicaciones_abono" ("cuenta_id") `);
    await queryRunner.query(`ALTER TABLE "clientes" ADD "limite_credito_usd" numeric(18,2) NOT NULL DEFAULT '0'`);
    await queryRunner.query(`ALTER TABLE "clientes" ADD "dias_credito" integer NOT NULL DEFAULT '30'`);
    await queryRunner.query(`ALTER TABLE "ventas_lineas" ADD "costo_usd" numeric(18,4)`);
    await queryRunner.query(
      `ALTER TABLE "cuentas_cobrar" ADD CONSTRAINT "fk_cuentas_cobrar_venta" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "cuentas_cobrar" ADD CONSTRAINT "fk_cuentas_cobrar_cliente" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "abonos_cliente" ADD CONSTRAINT "fk_abonos_cliente_cliente" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "abonos_cliente" ADD CONSTRAINT "fk_abonos_cliente_sesion" FOREIGN KEY ("sesion_id") REFERENCES "sesiones_caja"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "abonos_cliente" ADD CONSTRAINT "fk_abonos_cliente_nota_credito" FOREIGN KEY ("nota_credito_id") REFERENCES "notas_credito"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "abonos_cliente" ADD CONSTRAINT "fk_abonos_cliente_usuario" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "aplicaciones_abono" ADD CONSTRAINT "fk_aplicaciones_abono_abono" FOREIGN KEY ("abono_id") REFERENCES "abonos_cliente"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "aplicaciones_abono" ADD CONSTRAINT "fk_aplicaciones_abono_cuenta" FOREIGN KEY ("cuenta_id") REFERENCES "cuentas_cobrar"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE clientes ADD CONSTRAINT ck_clientes_credito CHECK (limite_credito_usd >= 0 AND dias_credito >= 0)`,
    );
    await queryRunner.query(
      `ALTER TABLE cuentas_cobrar ADD CONSTRAINT ck_cuentas_cobrar_saldo CHECK (monto_usd > 0 AND saldo_usd >= 0 AND saldo_usd <= monto_usd)`,
    );
    await queryRunner.query(
      `ALTER TABLE abonos_cliente ADD CONSTRAINT ck_abonos_cliente_montos CHECK (monto > 0 AND monto_usd > 0)`,
    );
    await queryRunner.query(`ALTER TABLE aplicaciones_abono ADD CONSTRAINT ck_aplicaciones_abono_monto CHECK (monto_usd > 0)`);
    await queryRunner.query(
      `CREATE INDEX idx_cuentas_cobrar_pendientes ON cuentas_cobrar (cliente_id, vencimiento) WHERE saldo_usd > 0`,
    );
    await queryRunner.query(`CREATE INDEX idx_abonos_cliente_sesion ON abonos_cliente (sesion_id) WHERE sesion_id IS NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX idx_abonos_cliente_sesion`);
    await queryRunner.query(`DROP INDEX idx_cuentas_cobrar_pendientes`);
    await queryRunner.query(`ALTER TABLE clientes DROP CONSTRAINT ck_clientes_credito`);
    await queryRunner.query(`ALTER TABLE "aplicaciones_abono" DROP CONSTRAINT "fk_aplicaciones_abono_cuenta"`);
    await queryRunner.query(`ALTER TABLE "aplicaciones_abono" DROP CONSTRAINT "fk_aplicaciones_abono_abono"`);
    await queryRunner.query(`ALTER TABLE "abonos_cliente" DROP CONSTRAINT "fk_abonos_cliente_usuario"`);
    await queryRunner.query(`ALTER TABLE "abonos_cliente" DROP CONSTRAINT "fk_abonos_cliente_nota_credito"`);
    await queryRunner.query(`ALTER TABLE "abonos_cliente" DROP CONSTRAINT "fk_abonos_cliente_sesion"`);
    await queryRunner.query(`ALTER TABLE "abonos_cliente" DROP CONSTRAINT "fk_abonos_cliente_cliente"`);
    await queryRunner.query(`ALTER TABLE "cuentas_cobrar" DROP CONSTRAINT "fk_cuentas_cobrar_cliente"`);
    await queryRunner.query(`ALTER TABLE "cuentas_cobrar" DROP CONSTRAINT "fk_cuentas_cobrar_venta"`);
    await queryRunner.query(`ALTER TABLE "ventas_lineas" DROP COLUMN "costo_usd"`);
    await queryRunner.query(`ALTER TABLE "clientes" DROP COLUMN "dias_credito"`);
    await queryRunner.query(`ALTER TABLE "clientes" DROP COLUMN "limite_credito_usd"`);
    await queryRunner.query(`DROP INDEX "public"."idx_aplicaciones_abono_cuenta"`);
    await queryRunner.query(`DROP TABLE "aplicaciones_abono"`);
    await queryRunner.query(`DROP INDEX "public"."idx_abonos_cliente_cliente"`);
    await queryRunner.query(`DROP TABLE "abonos_cliente"`);
    await queryRunner.query(`DROP INDEX "public"."idx_cuentas_cobrar_cliente"`);
    await queryRunner.query(`DROP TABLE "cuentas_cobrar"`);
  }
}
