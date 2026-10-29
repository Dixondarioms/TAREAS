import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { hoyEnCaracas } from '../src/comun/fechas';
import { api, CLAVE_ADMIN, crearAppDePrueba, iniciarSesion } from './utilidades';

describe('Módulo fiscal: notas de crédito y libros (integración)', () => {
  let app: INestApplication<App>;
  let gerente: ReturnType<typeof api>;
  let cajero: ReturnType<typeof api>;
  let cajero2: ReturnType<typeof api>;
  let martillo: number;
  let libro: number;
  let venta: { id: number; lineas: { id: number; codigo: string }[] };
  const hoy = hoyEnCaracas();
  const mes = hoy.slice(0, 7);

  beforeAll(async () => {
    ({ app } = await crearAppDePrueba());
    const admin = api(app, await iniciarSesion(app, 'admin', CLAVE_ADMIN));
    for (const [usuario, rol] of [
      ['gerente', 'GERENTE'],
      ['cajero', 'CAJERO'],
      ['cajero2', 'CAJERO'],
    ]) {
      await admin
        .post('/usuarios')
        .send({ usuario, nombre: `Usuario ${usuario}`, clave: 'Clave-12345', rol })
        .expect(201);
    }
    gerente = api(app, await iniciarSesion(app, 'gerente', 'Clave-12345'));
    cajero = api(app, await iniciarSesion(app, 'cajero', 'Clave-12345'));
    cajero2 = api(app, await iniciarSesion(app, 'cajero2', 'Clave-12345'));

    await gerente.post('/tasas').send({ moneda: 'USD', valor: '100', fechaValor: hoy }).expect(201);
    const unidades = (await admin.get('/unidades').expect(200)).body as { id: number; codigo: string }[];
    const und = unidades.find((u) => u.codigo === 'UND')!.id;
    // Público = costo + 30 %: martillo 6,50 (Bs 650); manual exento 13,00 (Bs 1.300).
    martillo = (
      await gerente
        .post('/productos')
        .send({ codigo: 'MAR', descripcion: 'Martillo', unidadBaseId: und, costoUsd: '5' })
        .expect(201)
    ).body.id;
    libro = (
      await gerente
        .post('/productos')
        .send({ codigo: 'LIB', descripcion: 'Manual', unidadBaseId: und, costoUsd: '10', alicuotaIva: 'EXENTO' })
        .expect(201)
    ).body.id;
    for (const productoId of [martillo, libro]) {
      await gerente
        .post('/inventario/ajustes')
        .send({ productoId, tipo: 'ENTRADA', cantidad: '10', motivo: 'Inicial' })
        .expect(201);
    }
    await gerente.post('/talonarios').send({ numeroDesde: 1, numeroHasta: 20, controlDesde: 100 }).expect(201);
    await cajero.post('/caja/abrir').send({ fondoBs: '5000', fondoUsd: '100' }).expect(201);
    venta = (
      await cajero
        .post('/ventas')
        .send({
          lineas: [
            { productoId: martillo, cantidad: '3' },
            { productoId: libro, cantidad: '1' },
          ],
          pagos: [{ metodo: 'EFECTIVO_BS', monto: '3562' }],
        })
        .expect(201)
    ).body;
  });

  afterAll(async () => {
    await app?.close();
  });

  const existencia = async (id: number) => (await gerente.get(`/productos/${id}`).expect(200)).body.existencia;
  const linea = (codigo: string) => venta.lineas.find((l) => l.codigo === codigo)!.id;

  describe('notas de crédito', () => {
    it('necesitan un talonario de notas de crédito, distinto del de facturas', async () => {
      const r = await cajero
        .post(`/ventas/${venta.id}/notas-credito`)
        .send({
          lineas: [{ ventaLineaId: linea('MAR'), cantidad: '1' }],
          motivo: 'Defecto',
          devolverInventario: true,
          reintegroMetodo: 'EFECTIVO_BS',
        })
        .expect(400);
      expect(r.body.message).toMatch(/talonario de notas de crédito/);
      // Mismos números que el de facturas, pero de otro tipo: no se cruzan.
      await gerente
        .post('/talonarios')
        .send({ tipo: 'NOTA_CREDITO', numeroDesde: 1, numeroHasta: 10, controlDesde: 500 })
        .expect(201);
      expect((await cajero.get('/talonarios/estado').query({ tipo: 'NOTA_CREDITO' }).expect(200)).body.proxima).toMatchObject({
        numero: '000001',
        numeroControl: '00-000500',
      });
    });

    it('devuelve parte de la factura, reintegra desde la caja y repone el inventario', async () => {
      const r = await cajero
        .post(`/ventas/${venta.id}/notas-credito`)
        .send({
          lineas: [{ ventaLineaId: linea('MAR'), cantidad: '1' }],
          motivo: 'Mango defectuoso',
          devolverInventario: true,
          reintegroMetodo: 'EFECTIVO_BS',
        })
        .expect(201);
      expect(r.body).toMatchObject({
        numero: 1,
        numeroControl: '00-000500',
        baseGeneralBs: '650.00',
        ivaGeneralBs: '104.00',
        totalBs: '754.00',
        reintegroMonto: '754.00',
      });
      expect(await existencia(martillo)).toBe('8.000');
      const kardex = (await gerente.get(`/inventario/productos/${martillo}/movimientos`).expect(200)).body.datos[0];
      expect(kardex).toMatchObject({ tipo: 'DEVOLUCION', cantidad: '1.000', referencia: 'Nota de crédito 000001' });
    });

    it('no permite devolver más de lo vendido ni repetir líneas', async () => {
      const base = { motivo: 'x x x', devolverInventario: true, reintegroMetodo: 'EFECTIVO_BS' };
      const r = await cajero
        .post(`/ventas/${venta.id}/notas-credito`)
        .send({ ...base, lineas: [{ ventaLineaId: linea('MAR'), cantidad: '3' }] })
        .expect(400);
      expect(r.body.message).toMatch(/solo quedan 2 UND/);
      await cajero
        .post(`/ventas/${venta.id}/notas-credito`)
        .send({
          ...base,
          lineas: [
            { ventaLineaId: linea('MAR'), cantidad: '1' },
            { ventaLineaId: linea('MAR'), cantidad: '1' },
          ],
        })
        .expect(400);
      await cajero
        .post(`/ventas/${venta.id}/notas-credito`)
        .send({ ...base, reintegroMetodo: 'ZELLE', lineas: [{ ventaLineaId: linea('MAR'), cantidad: '1' }] })
        .expect(400);
      await cajero2
        .post(`/ventas/${venta.id}/notas-credito`)
        .send({ ...base, lineas: [{ ventaLineaId: linea('MAR'), cantidad: '1' }] })
        .expect(403);
    });

    it('reintegra en dólares a la tasa de la factura y puede no reponer la mercancía', async () => {
      const r = await cajero
        .post(`/ventas/${venta.id}/notas-credito`)
        .send({
          lineas: [{ ventaLineaId: linea('LIB'), cantidad: '1' }],
          motivo: 'Llegó mojado',
          devolverInventario: false,
          reintegroMetodo: 'EFECTIVO_USD',
        })
        .expect(201);
      expect(r.body).toMatchObject({ numero: 2, baseExentaBs: '1300.00', totalBs: '1300.00', reintegroMonto: '13.00' });
      expect(await existencia(libro)).toBe('9.000');

      const notas = (await cajero.get(`/ventas/${venta.id}/notas-credito`).expect(200)).body;
      expect(notas.map((n: { numero: number }) => n.numero)).toEqual([1, 2]);
      const caja = (await cajero.get('/caja/actual').expect(200)).body;
      expect(caja.reintegros).toEqual({ EFECTIVO_BS: '754.00', EFECTIVO_USD: '13.00' });
      expect(caja.esperado).toMatchObject({ EFECTIVO_BS: '7808.00', EFECTIVO_USD: '87.00' }); // 5.000 + 3.562 − 754; 100 − 13
    });

    it('una venta anulada no admite notas de crédito', async () => {
      const otra = (
        await cajero
          .post('/ventas')
          .send({ lineas: [{ productoId: martillo, cantidad: '1' }], pagos: [{ metodo: 'EFECTIVO_BS', monto: '754' }] })
          .expect(201)
      ).body;
      await cajero.post(`/ventas/${otra.id}/anular`).send({ motivo: 'Error de cajero' }).expect(200);
      await cajero
        .post(`/ventas/${otra.id}/notas-credito`)
        .send({
          lineas: [{ ventaLineaId: otra.lineas[0].id, cantidad: '1' }],
          motivo: 'x x x',
          devolverInventario: true,
          reintegroMetodo: 'EFECTIVO_BS',
        })
        .expect(400);
      await cajero.post('/talonarios/anular-siguiente').send({ motivo: 'Hoja rota' }).expect(201);
    });
  });

  describe('facturas de compra', () => {
    let proveedor: number;

    beforeAll(async () => {
      proveedor = (await gerente.post('/proveedores').send({ rif: 'J-00000001-8', razonSocial: 'Distribuidora Uno' }).expect(201))
        .body.id;
    });

    it('registra la factura y valida el IVA y los duplicados', async () => {
      const base = { proveedorId: proveedor, fecha: hoy, numero: '4512', numeroControl: '00-8891', baseGeneralBs: '1000' };
      const mal = await gerente
        .post('/fiscal/compras')
        .send({ ...base, ivaGeneralBs: '100' })
        .expect(400);
      expect(mal.body.message).toMatch(/no corresponde al 16 %/);
      const r = await gerente
        .post('/fiscal/compras')
        .send({ ...base, ivaGeneralBs: '160', baseExentaBs: '50' })
        .expect(201);
      expect(r.body).toMatchObject({ totalBs: '1210.00', tipo: 'FACTURA' });
      await gerente
        .post('/fiscal/compras')
        .send({ ...base, ivaGeneralBs: '160' })
        .expect(409);
    });

    it('las notas de crédito del proveedor indican la factura afectada', async () => {
      const nota = {
        proveedorId: proveedor,
        tipo: 'NOTA_CREDITO',
        fecha: hoy,
        numero: '77',
        numeroControl: '00-8900',
        baseGeneralBs: '100',
        ivaGeneralBs: '16',
      };
      await gerente.post('/fiscal/compras').send(nota).expect(400);
      await gerente
        .post('/fiscal/compras')
        .send({ ...nota, facturaAfectada: '4512' })
        .expect(201);
    });

    it('solo gerencia accede al módulo fiscal', async () => {
      await cajero.get('/fiscal/libro-ventas').query({ mes }).expect(403);
      await gerente.get('/fiscal/libro-ventas').query({ mes: '2026-13' }).expect(400);
    });
  });

  describe('libros', () => {
    it('libro de ventas: facturas, notas de crédito en negativo y documentos anulados', async () => {
      const r = (await gerente.get('/fiscal/libro-ventas').query({ mes }).expect(200)).body;
      const resumen = r.filas.map((f: { documento: string; numero: string; tipoTransaccion: string; totalBs: string }) => [
        f.documento,
        f.numero,
        f.tipoTransaccion,
        f.totalBs,
      ]);
      expect(resumen).toEqual([
        ['FACTURA', '000001', '01-REG', '3562.00'],
        ['FACTURA', '000002', '03-ANU', '0.00'],
        ['FACTURA', '000003', '03-ANU', '0.00'],
        ['NOTA_CREDITO', '000001', '01-REG', '-754.00'],
        ['NOTA_CREDITO', '000002', '01-REG', '-1300.00'],
      ]);
      expect(r.filas[3]).toMatchObject({ facturaAfectada: '000001', numeroControl: '00-000500' });
      expect(r.totales).toMatchObject({ totalBs: '1508.00', exentoBs: '0.00', baseGeneralBs: '1300.00', ivaGeneralBs: '208.00' });
    });

    it('libro de compras y resumen de IVA del mes', async () => {
      const compras = (await gerente.get('/fiscal/libro-compras').query({ mes }).expect(200)).body;
      expect(compras.filas.map((f: { documento: string; totalBs: string }) => [f.documento, f.totalBs])).toEqual([
        ['FACTURA', '1210.00'],
        ['NOTA_CREDITO', '-116.00'],
      ]);
      expect((await gerente.get('/fiscal/resumen').query({ mes }).expect(200)).body).toEqual({
        mes,
        debitoFiscalBs: '208.00',
        creditoFiscalBs: '144.00',
        ivaRetenidoBs: '0.00',
        retencionesRecibidasBs: '0.00',
        diferenciaBs: '64.00',
        igtfPercibidoBs: '0.00',
      });
    });

    it('exporta los libros a Excel', async () => {
      for (const libroFiscal of ['libro-ventas', 'libro-compras']) {
        const r = await gerente.get(`/fiscal/${libroFiscal}/excel`).query({ mes }).buffer(true).expect(200);
        expect(r.headers['content-type']).toContain('spreadsheetml');
        expect(r.headers['content-disposition']).toContain(`${libroFiscal}-${mes}.xlsx`);
      }
    });
  });
});
