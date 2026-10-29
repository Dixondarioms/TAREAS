import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { hoyEnCaracas } from '../src/comun/fechas';
import { api, CLAVE_ADMIN, crearAppDePrueba, iniciarSesion } from './utilidades';

describe('Fase 5: compras y cuentas por pagar (integración)', () => {
  let app: INestApplication<App>;
  let gerente: ReturnType<typeof api>;
  let almacen: ReturnType<typeof api>;
  let proveedor: number;
  let martillo: number;
  let tornillo: number;
  let caja: number;
  let libro: number;
  let compraUsd: number;
  const hoy = hoyEnCaracas();
  const vence = (() => {
    const d = new Date(`${hoy}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 30);
    return d.toISOString().slice(0, 10);
  })();

  beforeAll(async () => {
    ({ app } = await crearAppDePrueba());
    const admin = api(app, await iniciarSesion(app, 'admin', CLAVE_ADMIN));
    for (const [usuario, rol] of [
      ['gerente', 'GERENTE'],
      ['almacen', 'ALMACEN'],
    ]) {
      await admin
        .post('/usuarios')
        .send({ usuario, nombre: `Usuario ${usuario}`, clave: 'Clave-12345', rol })
        .expect(201);
    }
    gerente = api(app, await iniciarSesion(app, 'gerente', 'Clave-12345'));
    almacen = api(app, await iniciarSesion(app, 'almacen', 'Clave-12345'));

    await gerente.post('/tasas').send({ moneda: 'USD', valor: '100', fechaValor: hoy }).expect(201);
    proveedor = (await gerente.post('/proveedores').send({ rif: 'J-00000001-8', razonSocial: 'Distribuidora Uno' }).expect(201))
      .body.id;
    const unidades = (await admin.get('/unidades').expect(200)).body as { id: number; codigo: string }[];
    const unidad = (codigo: string) => unidades.find((u) => u.codigo === codigo)!.id;
    const crear = async (cuerpo: object) => (await gerente.post('/productos').send(cuerpo).expect(201)).body.id as number;
    martillo = await crear({ codigo: 'MAR', descripcion: 'Martillo', unidadBaseId: unidad('UND'), costoUsd: '5' });
    tornillo = await crear({
      codigo: 'TOR',
      descripcion: 'Tornillo',
      unidadBaseId: unidad('UND'),
      costoUsd: '0.03',
      presentaciones: [{ unidadId: unidad('CAJA'), factor: '100' }],
    });
    libro = await crear({
      codigo: 'LIB',
      descripcion: 'Manual',
      unidadBaseId: unidad('UND'),
      costoUsd: '10',
      alicuotaIva: 'EXENTO',
    });
    caja = (await gerente.get(`/productos/${tornillo}`).expect(200)).body.presentaciones[0].id;
  });

  afterAll(async () => {
    await app?.close();
  });

  const producto = async (id: number) => (await gerente.get(`/productos/${id}`).expect(200)).body;
  const base = () => ({
    proveedorId: proveedor,
    fecha: hoy,
    numero: '4512',
    numeroControl: '00-8891',
    moneda: 'USD',
    condicion: 'CREDITO',
    vencimiento: vence,
    facturaFiscal: true,
    actualizarCostos: true,
    lineas: [
      { productoId: martillo, cantidad: '10', costoUnitario: '6' },
      { productoId: tornillo, presentacionId: caja, cantidad: '2', costoUnitario: '2.50' },
      { productoId: libro, cantidad: '1', costoUnitario: '12' },
    ],
  });

  describe('recepción de mercancía', () => {
    it('almacén registra compras, pero solo gerencia actualiza costos', async () => {
      const r = await almacen.post('/compras').send(base()).expect(403);
      expect(r.body.message).toMatch(/Solo gerencia/);
    });

    it('valida vencimiento, número de control y duplicados', async () => {
      await gerente
        .post('/compras')
        .send({ ...base(), vencimiento: undefined })
        .expect(400);
      await gerente
        .post('/compras')
        .send({ ...base(), numeroControl: undefined })
        .expect(400);
      await gerente
        .post('/compras')
        .send({ ...base(), lineas: [{ productoId: tornillo, presentacionId: caja, cantidad: '0.5', costoUnitario: '2.5' }] })
        .expect(400);
    });

    it('en USD: entra el inventario, actualiza costos y precios y anota la factura en el libro', async () => {
      const r = await gerente.post('/compras').send(base()).expect(201);
      compraUsd = r.body.id;
      // Base gravada 60 + 5 = 65; IVA 10,40; exento 12 → total 87,40
      expect(r.body).toMatchObject({
        moneda: 'USD',
        subtotal: '77.00',
        iva: '10.40',
        total: '87.40',
        saldo: '87.40',
        vencimiento: vence,
      });
      expect(r.body.facturaCompraId).toEqual(expect.any(Number));

      const m = await producto(martillo);
      expect(m).toMatchObject({ existencia: '10.000', costoUsd: '6.0000' });
      expect(m.precios.find((p: { lista: { codigo: string } }) => p.lista.codigo === 'PUBLICO').precioUsd).toBe('7.8000');
      expect(await producto(tornillo)).toMatchObject({ existencia: '200.000', costoUsd: '0.0250' });
      expect(m.proveedores[0]).toMatchObject({ costoUsd: '6.0000' });

      const historial = (await gerente.get(`/productos/${martillo}/historial-costos`).expect(200)).body;
      expect(historial[0]).toMatchObject({
        costoAnterior: '5.0000',
        costoNuevo: '6.0000',
        motivo: 'Compra 4512 Distribuidora Uno',
      });
      const kardex = (await gerente.get(`/inventario/productos/${tornillo}/movimientos`).expect(200)).body.datos[0];
      expect(kardex).toMatchObject({ tipo: 'COMPRA', cantidad: '200.000', costoUsd: '0.0250' });

      const libroCompras = (
        await gerente
          .get('/fiscal/libro-compras')
          .query({ mes: hoy.slice(0, 7) })
          .expect(200)
      ).body;
      expect(libroCompras.filas[0]).toMatchObject({
        numero: '4512',
        exentoBs: '1200.00',
        baseGeneralBs: '6500.00',
        ivaGeneralBs: '1040.00',
        totalBs: '8740.00',
      });
      await gerente.post('/compras').send(base()).expect(409);
    });

    it('en Bs, como nota de entrega: no va al libro y convierte el costo con la tasa', async () => {
      const r = await gerente
        .post('/compras')
        .send({
          ...base(),
          numero: 'NE-77',
          numeroControl: undefined,
          moneda: 'BS',
          tasa: '125',
          condicion: 'CONTADO',
          vencimiento: undefined,
          facturaFiscal: false,
          lineas: [{ productoId: martillo, cantidad: '2', costoUnitario: '875' }],
        })
        .expect(201);
      expect(r.body).toMatchObject({
        moneda: 'BS',
        tasa: '125.00000000',
        total: '2030.00',
        facturaCompraId: null,
        vencimiento: hoy,
      });
      expect(await producto(martillo)).toMatchObject({ existencia: '12.000', costoUsd: '7.0000' }); // 875 / 125
      const libroCompras = (
        await gerente
          .get('/fiscal/libro-compras')
          .query({ mes: hoy.slice(0, 7) })
          .expect(200)
      ).body;
      expect(libroCompras.filas).toHaveLength(1);
    });

    it('sin actualizar costos, el costo del producto no cambia', async () => {
      await almacen
        .post('/compras')
        .send({
          ...base(),
          numero: '4513',
          numeroControl: '00-8892',
          actualizarCostos: false,
          lineas: [{ productoId: libro, cantidad: '2', costoUnitario: '20' }],
        })
        .expect(201);
      // Sigue en 12 (lo fijó la compra anterior), aunque esta llegó a 20.
      expect(await producto(libro)).toMatchObject({ existencia: '3.000', costoUsd: '12.0000' });
    });
  });

  describe('cuentas por pagar', () => {
    it('registra abonos sin pasar del saldo', async () => {
      const r1 = await gerente
        .post(`/compras/${compraUsd}/pagos`)
        .send({ fecha: hoy, metodo: 'ZELLE', monto: '50', referencia: 'Z-1' })
        .expect(201);
      expect(r1.body.saldo).toBe('37.40');
      const r2 = await gerente
        .post(`/compras/${compraUsd}/pagos`)
        .send({ fecha: hoy, metodo: 'TRANSFERENCIA', monto: '40' })
        .expect(400);
      expect(r2.body.message).toMatch(/supera el saldo pendiente \(\$ 37.40\)/);
      await almacen.post(`/compras/${compraUsd}/pagos`).send({ fecha: hoy, metodo: 'ZELLE', monto: '1' }).expect(403);
      const r3 = await gerente
        .post(`/compras/${compraUsd}/pagos`)
        .send({ fecha: hoy, metodo: 'EFECTIVO_USD', monto: '37.40' })
        .expect(201);
      expect(r3.body.saldo).toBe('0.00');
      expect(r3.body.pagos).toHaveLength(2);
    });

    it('lista lo pendiente por pagar con totales por moneda', async () => {
      const r = (await gerente.get('/compras/por-pagar').expect(200)).body;
      expect(
        r.cuentas.map((c: { numero: string; saldo: string; diasVencida: number }) => [c.numero, c.saldo, c.diasVencida]),
      ).toEqual([
        ['NE-77', '2030.00', 0],
        ['4513', '40.00', -30],
      ]);
      expect(r.totales).toEqual([
        { moneda: 'USD', saldo: '40.00', vencido: '0.00' },
        { moneda: 'BS', saldo: '2030.00', vencido: '0.00' },
      ]);
      await almacen.get('/compras/por-pagar').expect(403);
      expect(
        (await almacen.get('/compras').query({ pago: 'pagadas' }).expect(200)).body.datos.map(
          (c: { numero: string }) => c.numero,
        ),
      ).toEqual(['4512']);
    });
  });
});
