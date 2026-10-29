import { MigrationInterface, QueryRunner } from 'typeorm';

/** Fase 2: existencias por producto y kardex de movimientos de inventario. */
export class Inventario1793230000000 implements MigrationInterface {
  name = 'Inventario1793230000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "productos" ADD "existencia" numeric(18,3) NOT NULL DEFAULT '0'`);
    await q.query(`ALTER TABLE productos ADD CONSTRAINT ck_productos_existencia CHECK (existencia >= 0)`);
    await q.query(
      `CREATE TYPE "public"."tipo_movimiento" AS ENUM('ENTRADA', 'SALIDA', 'MERMA', 'CONTEO', 'COMPRA', 'VENTA', 'DEVOLUCION')`,
    );
    await q.query(
      `CREATE TABLE "movimientos_inventario" ("id" SERIAL NOT NULL, "producto_id" integer NOT NULL, "tipo" "public"."tipo_movimiento" NOT NULL, "cantidad" numeric(18,3) NOT NULL, "existencia_resultante" numeric(18,3) NOT NULL, "costo_usd" numeric(18,4) NOT NULL, "motivo" character varying(200) NOT NULL, "referencia" character varying(60), "usuario_id" integer, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_movimientos_inventario" PRIMARY KEY ("id"))`,
    );
    await q.query(`CREATE INDEX "idx_movimientos_producto" ON "movimientos_inventario" ("producto_id", "id")`);
    await q.query(
      `CREATE INDEX "idx_movimientos_referencia" ON "movimientos_inventario" ("referencia") WHERE referencia IS NOT NULL`,
    );
    await q.query(
      `ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "fk_movimientos_producto" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await q.query(
      `ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "fk_movimientos_usuario" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await q.query(
      `ALTER TABLE movimientos_inventario ADD CONSTRAINT ck_movimientos_cantidad CHECK (cantidad <> 0 AND existencia_resultante >= 0)`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "movimientos_inventario"`);
    await q.query(`DROP TYPE "public"."tipo_movimiento"`);
    await q.query(`ALTER TABLE productos DROP CONSTRAINT ck_productos_existencia`);
    await q.query(`ALTER TABLE "productos" DROP COLUMN "existencia"`);
  }
}
