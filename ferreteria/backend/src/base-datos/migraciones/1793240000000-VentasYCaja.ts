import { MigrationInterface, QueryRunner } from 'typeorm';

/** Fase 3: clientes, talonarios de facturas, caja y ventas. */
export class VentasYCaja1793240000000 implements MigrationInterface {
  name = 'VentasYCaja1793240000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "clientes" ("id" SERIAL NOT NULL, "documento" character varying(15) NOT NULL, "nombre" character varying(150) NOT NULL, "direccion" text, "telefono" character varying(60), "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_fc002853c86bd15f82ef93bf42a" UNIQUE ("documento"), CONSTRAINT "PK_clientes" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "talonarios" ("id" SERIAL NOT NULL, "serie" character varying(10) NOT NULL DEFAULT '', "numero_desde" integer NOT NULL, "numero_hasta" integer NOT NULL, "control_prefijo" character varying(10) NOT NULL DEFAULT '00-', "control_desde" integer NOT NULL, "digitos" integer NOT NULL DEFAULT '6', "siguiente" integer NOT NULL, "activo" boolean NOT NULL DEFAULT true, "creado_por_id" integer, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_talonarios" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "facturas_anuladas" ("id" SERIAL NOT NULL, "talonario_id" integer NOT NULL, "numero" integer NOT NULL, "numero_control" character varying(30) NOT NULL, "motivo" character varying(200) NOT NULL, "usuario_id" integer, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_facturas_anuladas_numero" UNIQUE ("talonario_id", "numero"), CONSTRAINT "PK_facturas_anuladas" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE TYPE "public"."estado_caja" AS ENUM('ABIERTA', 'CERRADA')`);
    await queryRunner.query(
      `CREATE TABLE "sesiones_caja" ("id" SERIAL NOT NULL, "usuario_id" integer NOT NULL, "estado" "public"."estado_caja" NOT NULL DEFAULT 'ABIERTA', "fondo_bs" numeric(18,2) NOT NULL DEFAULT '0', "fondo_usd" numeric(18,2) NOT NULL DEFAULT '0', "abierta_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "cerrada_en" TIMESTAMP WITH TIME ZONE, "esperado" jsonb, "contado" jsonb, "observaciones" text, CONSTRAINT "PK_sesiones_caja" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE TYPE "public"."tipo_movimiento_caja" AS ENUM('RETIRO', 'GASTO', 'INGRESO')`);
    await queryRunner.query(
      `CREATE TABLE "movimientos_caja" ("id" SERIAL NOT NULL, "sesion_id" integer NOT NULL, "tipo" "public"."tipo_movimiento_caja" NOT NULL, "metodo" character varying(20) NOT NULL, "monto" numeric(18,2) NOT NULL, "motivo" character varying(200) NOT NULL, "usuario_id" integer NOT NULL, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_movimientos_caja" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE TYPE "public"."estado_venta" AS ENUM('COMPLETADA', 'ANULADA')`);
    await queryRunner.query(
      `CREATE TABLE "ventas" ("id" SERIAL NOT NULL, "estado" "public"."estado_venta" NOT NULL DEFAULT 'COMPLETADA', "sesion_id" integer NOT NULL, "usuario_id" integer NOT NULL, "cliente_id" integer, "cliente_documento" character varying(15), "cliente_nombre" character varying(150) NOT NULL, "cliente_direccion" text, "talonario_id" integer NOT NULL, "serie" character varying(10) NOT NULL DEFAULT '', "numero_factura" integer NOT NULL, "numero_control" character varying(30) NOT NULL, "tasa" numeric(18,8) NOT NULL, "lista_id" integer NOT NULL, "base_exenta_bs" numeric(18,2) NOT NULL, "base_general_bs" numeric(18,2) NOT NULL, "iva_general_bs" numeric(18,2) NOT NULL, "base_reducida_bs" numeric(18,2) NOT NULL, "iva_reducida_bs" numeric(18,2) NOT NULL, "porcentaje_general" numeric(5,2) NOT NULL, "porcentaje_reducida" numeric(5,2) NOT NULL, "total_bs" numeric(18,2) NOT NULL, "base_igtf_bs" numeric(18,2) NOT NULL DEFAULT '0', "igtf_bs" numeric(18,2) NOT NULL DEFAULT '0', "total_pagar_bs" numeric(18,2) NOT NULL, "total_pagar_usd" numeric(18,2) NOT NULL, "vuelto_metodo" character varying(20), "vuelto_monto" numeric(18,2) NOT NULL DEFAULT '0', "vuelto_bs" numeric(18,2) NOT NULL DEFAULT '0', "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "anulada_en" TIMESTAMP WITH TIME ZONE, "anulada_por_id" integer, "motivo_anulacion" character varying(200), CONSTRAINT "PK_ventas" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_ventas_factura" ON "ventas" ("talonario_id", "numero_factura") `);
    await queryRunner.query(
      `CREATE TABLE "ventas_lineas" ("id" SERIAL NOT NULL, "venta_id" integer NOT NULL, "producto_id" integer NOT NULL, "codigo" character varying(40) NOT NULL, "descripcion" character varying(200) NOT NULL, "presentacion_id" integer, "unidad" character varying(10) NOT NULL, "factor" numeric(18,6) NOT NULL, "cantidad" numeric(18,3) NOT NULL, "alicuota_iva" "public"."alicuota_iva" NOT NULL, "precio_usd" numeric(18,4) NOT NULL, "precio_bs" numeric(18,2) NOT NULL, "subtotal_bs" numeric(18,2) NOT NULL, CONSTRAINT "PK_ventas_lineas" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "ventas_pagos" ("id" SERIAL NOT NULL, "venta_id" integer NOT NULL, "metodo" character varying(20) NOT NULL, "monto" numeric(18,2) NOT NULL, "monto_bs" numeric(18,2) NOT NULL, "referencia" character varying(60), CONSTRAINT "PK_ventas_pagos" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "talonarios" ADD CONSTRAINT "fk_talonarios_usuario" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "facturas_anuladas" ADD CONSTRAINT "fk_facturas_anuladas_talonario" FOREIGN KEY ("talonario_id") REFERENCES "talonarios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "facturas_anuladas" ADD CONSTRAINT "fk_facturas_anuladas_usuario" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "sesiones_caja" ADD CONSTRAINT "fk_sesiones_caja_usuario" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "movimientos_caja" ADD CONSTRAINT "fk_movimientos_caja_sesion" FOREIGN KEY ("sesion_id") REFERENCES "sesiones_caja"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "movimientos_caja" ADD CONSTRAINT "fk_movimientos_caja_usuario" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ventas" ADD CONSTRAINT "fk_ventas_sesion" FOREIGN KEY ("sesion_id") REFERENCES "sesiones_caja"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ventas" ADD CONSTRAINT "fk_ventas_usuario" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ventas" ADD CONSTRAINT "fk_ventas_cliente" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ventas" ADD CONSTRAINT "fk_ventas_talonario" FOREIGN KEY ("talonario_id") REFERENCES "talonarios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ventas" ADD CONSTRAINT "fk_ventas_anulada_por" FOREIGN KEY ("anulada_por_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ventas_lineas" ADD CONSTRAINT "fk_ventas_lineas_venta" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ventas_pagos" ADD CONSTRAINT "fk_ventas_pagos_venta" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // Reglas que la base debe garantizar aunque falle la aplicación.
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_sesiones_caja_abierta ON sesiones_caja (usuario_id) WHERE estado = 'ABIERTA'`,
    );
    await queryRunner.query(`CREATE INDEX idx_ventas_sesion ON ventas (sesion_id)`);
    await queryRunner.query(`CREATE INDEX idx_ventas_creado_en ON ventas (creado_en)`);
    await queryRunner.query(`CREATE INDEX idx_ventas_lineas_venta ON ventas_lineas (venta_id)`);
    await queryRunner.query(`CREATE INDEX idx_ventas_pagos_venta ON ventas_pagos (venta_id)`);
    await queryRunner.query(`CREATE INDEX idx_movimientos_caja_sesion ON movimientos_caja (sesion_id)`);
    await queryRunner.query(
      `ALTER TABLE talonarios ADD CONSTRAINT ck_talonarios_rango CHECK (numero_desde >= 1 AND numero_hasta >= numero_desde AND siguiente BETWEEN numero_desde AND numero_hasta + 1 AND control_desde >= 1)`,
    );
    await queryRunner.query(
      `ALTER TABLE sesiones_caja ADD CONSTRAINT ck_sesiones_caja_fondo CHECK (fondo_bs >= 0 AND fondo_usd >= 0)`,
    );
    await queryRunner.query(`ALTER TABLE movimientos_caja ADD CONSTRAINT ck_movimientos_caja_monto CHECK (monto > 0)`);
    await queryRunner.query(
      `ALTER TABLE ventas ADD CONSTRAINT ck_ventas_montos CHECK (total_bs >= 0 AND igtf_bs >= 0 AND total_pagar_bs = total_bs + igtf_bs AND vuelto_bs >= 0 AND tasa > 0)`,
    );
    await queryRunner.query(
      `ALTER TABLE ventas_lineas ADD CONSTRAINT ck_ventas_lineas CHECK (cantidad > 0 AND factor > 0 AND precio_usd >= 0)`,
    );
    await queryRunner.query(`ALTER TABLE ventas_pagos ADD CONSTRAINT ck_ventas_pagos CHECK (monto > 0 AND monto_bs > 0)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX uq_sesiones_caja_abierta`);
    await queryRunner.query(`ALTER TABLE "ventas_pagos" DROP CONSTRAINT "fk_ventas_pagos_venta"`);
    await queryRunner.query(`ALTER TABLE "ventas_lineas" DROP CONSTRAINT "fk_ventas_lineas_venta"`);
    await queryRunner.query(`ALTER TABLE "ventas" DROP CONSTRAINT "fk_ventas_anulada_por"`);
    await queryRunner.query(`ALTER TABLE "ventas" DROP CONSTRAINT "fk_ventas_talonario"`);
    await queryRunner.query(`ALTER TABLE "ventas" DROP CONSTRAINT "fk_ventas_cliente"`);
    await queryRunner.query(`ALTER TABLE "ventas" DROP CONSTRAINT "fk_ventas_usuario"`);
    await queryRunner.query(`ALTER TABLE "ventas" DROP CONSTRAINT "fk_ventas_sesion"`);
    await queryRunner.query(`ALTER TABLE "movimientos_caja" DROP CONSTRAINT "fk_movimientos_caja_usuario"`);
    await queryRunner.query(`ALTER TABLE "movimientos_caja" DROP CONSTRAINT "fk_movimientos_caja_sesion"`);
    await queryRunner.query(`ALTER TABLE "sesiones_caja" DROP CONSTRAINT "fk_sesiones_caja_usuario"`);
    await queryRunner.query(`ALTER TABLE "facturas_anuladas" DROP CONSTRAINT "fk_facturas_anuladas_usuario"`);
    await queryRunner.query(`ALTER TABLE "facturas_anuladas" DROP CONSTRAINT "fk_facturas_anuladas_talonario"`);
    await queryRunner.query(`ALTER TABLE "talonarios" DROP CONSTRAINT "fk_talonarios_usuario"`);
    await queryRunner.query(`DROP TABLE "ventas_pagos"`);
    await queryRunner.query(`DROP TABLE "ventas_lineas"`);
    await queryRunner.query(`DROP INDEX "public"."uq_ventas_factura"`);
    await queryRunner.query(`DROP TABLE "ventas"`);
    await queryRunner.query(`DROP TYPE "public"."estado_venta"`);
    await queryRunner.query(`DROP TABLE "movimientos_caja"`);
    await queryRunner.query(`DROP TYPE "public"."tipo_movimiento_caja"`);
    await queryRunner.query(`DROP TABLE "sesiones_caja"`);
    await queryRunner.query(`DROP TYPE "public"."estado_caja"`);
    await queryRunner.query(`DROP TABLE "facturas_anuladas"`);
    await queryRunner.query(`DROP TABLE "talonarios"`);
    await queryRunner.query(`DROP TABLE "clientes"`);
  }
}
