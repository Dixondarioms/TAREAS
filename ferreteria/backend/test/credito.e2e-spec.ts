import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { hoyEnCaracas } from '../src/comun/fechas';
import { api, CLAVE_ADMIN, crearAppDePrueba, iniciarSesion } from './utilidades';

describe('Fase 6: crédito a clientes y reportes (integración)', () => {
  let app: INestApplication<App>;
  let gerente: ReturnType<typeof api>;
  let cajero: ReturnType<typeof api>;
  let martillo: number;
  let cliente: number;
  const ventas: Record<string, { id: number; lineas: { id: number }[] }> = {};
  const hoy = hoyEnCaracas();
  const en15dias = (() => {
    const d = new Date(`${hoy}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 15);
    return d.toISOString().slice(0, 10);
  })();

  beforeAll(async () => {
    ({ app } = await crearAppDePrueba());
    const admin = api(app, await iniciarSesion(app, 'admin', CLAVE_ADMIN));
    for (const [usuario, rol] of [
      ['gerente', 'GERENTE'],
      ['cajero', 'CAJERO'],
    ]) {
      await admin
        .post('/usuarios')
        .send({ usuario, nombre: `Usuario ${usuario}`, clave: 'Clave-12345', rol })
        .expect(201);
    }
    gerente = api(app, await iniciarSesion(app, 'gerente', 'Clave-12345'));
    cajero = api(app, await iniciarSesion(app, 'cajero', 'Clave-12345'));
    await gerente.post('/tasas').send({ moneda: 'USD', valor: '100', fechaValor: hoy }).expect(201);
    const und = ((await admin.get('/unidades').expect(200)).body as { id: number; codigo: string }[]).find(
      (u) => u.codigo === 'UND',
    )!.id;
    // Costo 5 → precio al público 6,50 → Bs 650 + IVA 104 = 754 por martillo.
    martillo = (
      await gerente
        .post('/productos')
        .send({ codigo: 'MAR', descripcion: 'Martillo', unidadBaseId: und, costoUsd: '5' })
        .expect(201)
    ).body.id;
    await gerente
      .post('/inventario/ajustes')
      .send({ productoId: martillo, tipo: 'ENTRADA', cantidad: '20', motivo: 'Inicial' })
      .expect(201);
    await gerente.post('/talonarios').send({ numeroDesde: 1, numeroHasta: 50, controlDesde: 1 }).expect(201);
    await gerente
      .post('/talonarios')
      .send({ tipo: 'NOTA_CREDITO', numeroDesde: 1, numeroHasta: 50, controlDesde: 900 })
      .expect(201);
    await cajero.post('/caja/abrir').send({ fondoBs: '1000', fondoUsd: '0' }).expect(201);
    cliente = (await cajero.post('/clientes').send({ documento: 'V-11222333', nombre: 'José Rondón' }).expect(201)).body.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  const vender = (cantidad: string, pagos: object[], extra: object = {}) =>
    cajero.post('/ventas').send({ clienteId: cliente, lineas: [{ productoId: martillo, cantidad }], pagos, ...extra });
  const estado = async () => (await cajero.get(`/clientes/${cliente}/estado-cuenta`).expect(200)).body;

  describe('ventas a crédito', () => {
    it('acepta la cédula escrita solo con números', async () => {
      const r = await cajero.post('/clientes').send({ documento: '14.555.666', nombre: 'Carmen Páez' }).expect(201);
      expect(r.body.documento).toBe('V-14555666');
      expect((await cajero.get('/clientes/por-documento/14555666').expect(200)).body.id).toBe(r.body.id);
      await cajero.post('/clientes').send({ documento: 'J-12345678-0', nombre: 'Mal' }).expect(400);
    });

    it('solo gerencia asigna crédito; sin crédito no se fía', async () => {
      const r = await vender('1', [{ metodo: 'CREDITO', monto: '754' }]).expect(400);
      expect(r.body.message).toMatch(/no tiene crédito aprobado/);
      await cajero.put(`/clientes/${cliente}`).send({ limiteCreditoUsd: '20' }).expect(403);
      await gerente.put(`/clientes/${cliente}`).send({ limiteCreditoUsd: '20', diasCredito: 15 }).expect(200);
      await cajero
        .post('/ventas')
        .send({ lineas: [{ productoId: martillo, cantidad: '1' }], pagos: [{ metodo: 'CREDITO', monto: '754' }] })
        .expect(400);
    });

    it('fía en USD a la tasa de la factura y no deja pasar el límite', async () => {
      ventas.fiada = (await vender('2', [{ metodo: 'CREDITO', monto: '1508' }]).expect(201)).body;
      let e = await estado();
      expect(e).toMatchObject({ saldoUsd: '15.08', disponibleUsd: '4.92', vencidoUsd: '0.00' });
      expect(e.cuentas[0]).toMatchObject({ factura: '000001', montoUsd: '15.08', vencimiento: en15dias, diasVencida: -15 });

      const r = await vender('1', [{ metodo: 'CREDITO', monto: '754' }]).expect(400);
      expect(r.body.message).toMatch(/supera el crédito .* debe \$ 15.08, límite \$ 20.00, disponible \$ 4.92/);
      await vender('1', [{ metodo: 'CREDITO', monto: '800' }]).expect(400); // daría vuelto

      ventas.mixta = (
        await vender('1', [
          { metodo: 'EFECTIVO_BS', monto: '354' },
          { metodo: 'CREDITO', monto: '400' },
        ]).expect(201)
      ).body;
      e = await estado();
      expect(e).toMatchObject({ saldoUsd: '19.08', disponibleUsd: '0.92' });
    });

    it('lo fiado no entra a la caja', async () => {
      const caja = (await cajero.get('/caja/actual').expect(200)).body;
      expect(caja.ventas.creditoBs).toBe('1908.00');
      expect(caja.cobrado).toEqual({ EFECTIVO_BS: '354.00' });
      expect(caja.esperado).toEqual({ EFECTIVO_BS: '1354.00', EFECTIVO_USD: '0.00' });
    });

    it('una nota de crédito de una venta fiada se descuenta de la deuda', async () => {
      const nc = await cajero
        .post(`/ventas/${ventas.fiada.id}/notas-credito`)
        .send({
          lineas: [{ ventaLineaId: ventas.fiada.lineas[0].id, cantidad: '1' }],
          motivo: 'Devolvió uno',
          devolverInventario: true,
          reintegroMetodo: 'CREDITO',
        })
        .expect(201);
      expect(nc.body).toMatchObject({ reintegroMetodo: 'CREDITO', totalBs: '754.00' });
      expect(await estado()).toMatchObject({ saldoUsd: '11.54' });
      // Una venta de contado no tiene deuda que descontar.
      const contado = (
        await cajero
          .post('/ventas')
          .send({ lineas: [{ productoId: martillo, cantidad: '1' }], pagos: [{ metodo: 'EFECTIVO_BS', monto: '754' }] })
          .expect(201)
      ).body;
      const r = await cajero
        .post(`/ventas/${contado.id}/notas-credito`)
        .send({
          lineas: [{ ventaLineaId: contado.lineas[0].id, cantidad: '1' }],
          motivo: 'x x x',
          devolverInventario: true,
          reintegroMetodo: 'CREDITO',
        })
        .expect(400);
      expect(r.body.message).toMatch(/no fue a crédito/);
    });
  });

  describe('abonos', () => {
    it('convierte con la tasa del día y paga primero lo que vence antes', async () => {
      await gerente.post('/tasas').send({ moneda: 'USD', valor: '200', fechaValor: hoy }).expect(201);
      const r = await cajero.post(`/clientes/${cliente}/abonos`).send({ metodo: 'EFECTIVO_BS', monto: '2000' }).expect(201);
      // 2.000 Bs / 200 = 10 USD: 7,54 a la primera factura y 2,46 a la segunda.
      expect(r.body.saldoUsd).toBe('1.54');
      expect(r.body.cuentas.map((c: { factura: string; saldoUsd: string }) => [c.factura, c.saldoUsd])).toEqual([
        ['000002', '1.54'],
        ['000001', '0.00'],
      ]);
      expect(r.body.abonos[0]).toMatchObject({ metodo: 'EFECTIVO_BS', montoBs: '2000.00', montoUsd: '10.00' });
      const caja = (await cajero.get('/caja/actual').expect(200)).body;
      expect(caja.abonos).toEqual({ EFECTIVO_BS: '2000.00' });
      expect(caja.esperado.EFECTIVO_BS).toBe('4108.00'); // 1.000 + 354 + 754 + 2.000
    });

    it('no acepta abonos mayores que la deuda ni sin referencia en pagos electrónicos', async () => {
      const r = await cajero.post(`/clientes/${cliente}/abonos`).send({ metodo: 'EFECTIVO_USD', monto: '5' }).expect(400);
      expect(r.body.message).toMatch(/supera la deuda/);
      await cajero.post(`/clientes/${cliente}/abonos`).send({ metodo: 'PAGO_MOVIL', monto: '100' }).expect(400);
      await cajero.post(`/clientes/${cliente}/abonos`).send({ metodo: 'CREDITO', monto: '100' }).expect(400);
    });

    it('anular una venta fiada sin abonos elimina su deuda; con abonos no se puede', async () => {
      const r = await cajero.post(`/ventas/${ventas.mixta.id}/anular`).send({ motivo: 'Error' }).expect(400);
      expect(r.body.message).toMatch(/ya tiene abonos/);
      const nueva = (await vender('1', [{ metodo: 'CREDITO', monto: '1508' }]).expect(201)).body; // a 200 Bs/USD = 7,54
      expect(await estado()).toMatchObject({ saldoUsd: '9.08' });
      await cajero.post(`/ventas/${nueva.id}/anular`).send({ motivo: 'Se arrepintió' }).expect(200);
      expect(await estado()).toMatchObject({ saldoUsd: '1.54' });
    });

    it('gerencia ve quién debe', async () => {
      await cajero.get('/clientes/por-cobrar').expect(403);
      expect((await gerente.get('/clientes/por-cobrar').expect(200)).body).toEqual({
        clientes: [
          {
            cliente: { id: cliente, documento: 'V-11222333', nombre: 'José Rondón', telefono: null },
            saldoUsd: '1.54',
            vencidoUsd: '0.00',
            diasVencida: -15,
          },
        ],
        totalUsd: '1.54',
        vencidoUsd: '0.00',
      });
      expect((await cajero.get('/clientes').query({ q: 'rondon' }).expect(200)).body.datos[0]).toMatchObject({
        saldoUsd: '1.54',
      });
    });
  });

  describe('reportes', () => {
    it('ventas, métodos y ganancia del período', async () => {
      await cajero.get('/reportes/ventas').query({ desde: hoy, hasta: hoy }).expect(403);
      const r = (await gerente.get('/reportes/ventas').query({ desde: hoy, hasta: hoy }).expect(200)).body;
      // Vendidos: 2 + 1 + 1 martillos a 6,50 (26 USD; costo 20); devuelto 1 (−6,50; −5 de costo).
      expect(r.totales).toMatchObject({
        facturas: 3,
        anuladas: 1,
        totalBs: '2262.00', // 1.508 + 754 + 754 − 754 (nota de crédito)
        ventaNetaUsd: '19.50',
        notasCreditoBs: '754.00',
        costoUsd: '15.00',
        gananciaUsd: '4.50',
        margenPorcentaje: '23.1',
        lineasSinCosto: 0,
      });
      expect(r.porMetodo).toEqual([
        { metodo: 'CREDITO', monto: '1908.00', montoBs: '1908.00' },
        { metodo: 'EFECTIVO_BS', monto: '1108.00', montoBs: '1108.00' },
      ]);
      expect(r.productos[0]).toMatchObject({
        codigo: 'MAR',
        cantidadBase: '3.000',
        ventaUsd: '19.50',
        costoUsd: '15.00',
        gananciaUsd: '4.50',
      });
      await gerente.get('/reportes/ventas').query({ desde: hoy, hasta: '2000-01-01' }).expect(400);
    });
  });
});
