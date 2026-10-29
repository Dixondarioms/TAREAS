import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { hoyEnCaracas } from '../src/comun/fechas';
import { api, CLAVE_ADMIN, crearAppDePrueba, iniciarSesion } from './utilidades';

describe('Órdenes de compra y anulación de compras (integración)', () => {
  let app: INestApplication<App>;
  let admin: ReturnType<typeof api>;
  let gerente: ReturnType<typeof api>;
  let almacen: ReturnType<typeof api>;
  let proveedor: number;
  let otroProveedor: number;
  let martillo: number;
  let tornillo: number;
  let clavo: number;
  let caja: number;
  let orden: number;
  const hoy = hoyEnCaracas();

  beforeAll(async () => {
    ({ app } = await crearAppDePrueba());
    admin = api(app, await iniciarSesion(app, 'admin', CLAVE_ADMIN));
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
    otroProveedor = (await gerente.post('/proveedores').send({ rif: 'J-00000002-6', razonSocial: 'Ferremayor Dos' }).expect(201))
      .body.id;
    const unidades = (await admin.get('/unidades').expect(200)).body as { id: number; codigo: string }[];
    const unidad = (codigo: string) => unidades.find((u) => u.codigo === codigo)!.id;
    const crear = async (cuerpo: object) => (await gerente.post('/productos').send(cuerpo).expect(201)).body.id as number;
    martillo = await crear({
      codigo: 'MAR',
      descripcion: 'Martillo',
      unidadBaseId: unidad('UND'),
      costoUsd: '5',
      stockMinimo: '10',
      stockMaximo: '30',
      proveedores: [{ proveedorId: proveedor, costoUsd: '4.5' }],
    });
    tornillo = await crear({
      codigo: 'TOR',
      descripcion: 'Tornillo',
      unidadBaseId: unidad('UND'),
      costoUsd: '0.03',
      stockMinimo: '500',
      presentaciones: [{ unidadId: unidad('CAJA'), factor: '100' }],
      proveedores: [{ proveedorId: proveedor }],
    });
    // Sin mínimo: nunca se sugiere.
    clavo = await crear({
      codigo: 'CLA',
      descripcion: 'Clavo',
      unidadBaseId: unidad('UND'),
      costoUsd: '0.02',
      proveedores: [{ proveedorId: proveedor }],
    });
    caja = (await gerente.get(`/productos/${tornillo}`).expect(200)).body.presentaciones[0].id;
    await gerente
      .post('/inventario/ajustes')
      .send({ productoId: martillo, tipo: 'ENTRADA', cantidad: '4', motivo: 'Inicial' })
      .expect(201);
  });

  afterAll(async () => {
    await app?.close();
  });

  const producto = async (id: number) => (await gerente.get(`/productos/${id}`).expect(200)).body;
  const compra = (extra: object = {}) => ({
    proveedorId: proveedor,
    fecha: hoy,
    numero: '7001',
    numeroControl: '00-7001',
    moneda: 'USD',
    condicion: 'CONTADO',
    facturaFiscal: true,
    actualizarCostos: true,
    lineas: [
      { productoId: martillo, cantidad: '10', costoUnitario: '6' },
      { productoId: tornillo, presentacionId: caja, cantidad: '3', costoUnitario: '2.50' },
    ],
    ...extra,
  });

  describe('órdenes de compra', () => {
    it('sugiere los productos del proveedor bajo el mínimo, hasta el máximo', async () => {
      const r = await almacen.get('/compras/ordenes/sugerencia').query({ proveedorId: proveedor, moneda: 'USD' }).expect(200);
      expect(r.body).toEqual([
        // 30 − 4 = 26, al costo del proveedor
        expect.objectContaining({ productoId: martillo, cantidad: '26', costoUnitario: '4.5', existencia: '4' }),
        // Sin máximo: hasta el doble del mínimo, al costo del producto
        expect.objectContaining({ productoId: tornillo, cantidad: '1000', costoUnitario: '0.03' }),
      ]);
      const enBs = await almacen.get('/compras/ordenes/sugerencia').query({ proveedorId: proveedor, moneda: 'BS' }).expect(200);
      expect(enBs.body[0]).toMatchObject({ productoId: martillo, costoUnitario: '450' });
      const otro = await almacen
        .get('/compras/ordenes/sugerencia')
        .query({ proveedorId: otroProveedor, moneda: 'USD' })
        .expect(200);
      expect(otro.body).toEqual([]);
    });

    it('almacén crea la orden con su subtotal estimado', async () => {
      const r = await almacen
        .post('/compras/ordenes')
        .send({
          proveedorId: proveedor,
          fecha: hoy,
          moneda: 'USD',
          notas: 'Entregar en la mañana',
          lineas: [
            { productoId: martillo, cantidad: '26', costoUnitario: '4.5' },
            { productoId: tornillo, presentacionId: caja, cantidad: '10', costoUnitario: '2.5' },
          ],
        })
        .expect(201);
      orden = r.body.id;
      expect(r.body).toMatchObject({ estado: 'PENDIENTE', subtotal: '142.00', moneda: 'USD', compras: [] });
      expect(r.body.lineas[1]).toMatchObject({
        unidad: 'CAJA',
        factor: '100.000000',
        cantidad: '10.000',
        cantidadRecibida: '0.000',
      });

      await almacen
        .post('/compras/ordenes')
        .send({
          proveedorId: proveedor,
          fecha: hoy,
          moneda: 'USD',
          lineas: [{ productoId: tornillo, presentacionId: caja, cantidad: '0.5', costoUnitario: '2.5' }],
        })
        .expect(400);
    });

    it('lo pedido en órdenes abiertas se descuenta de la sugerencia', async () => {
      const r = await almacen.get('/compras/ordenes/sugerencia').query({ proveedorId: proveedor, moneda: 'USD' }).expect(200);
      // Martillo: 26 pedidos cubren el faltante. Tornillo: 1000 − 1000 en camino.
      expect(r.body).toEqual([]);
    });

    it('recibir una parte deja la orden PARCIAL; el resto, RECIBIDA', async () => {
      await gerente
        .post('/compras')
        .send(compra({ ordenId: orden, proveedorId: otroProveedor }))
        .expect(400);

      const r = await gerente
        .post('/compras')
        .send(compra({ ordenId: orden }))
        .expect(201);
      expect(r.body.ordenId).toBe(orden);
      let o = (await gerente.get(`/compras/ordenes/${orden}`).expect(200)).body;
      expect(o.estado).toBe('PARCIAL');
      expect(o.lineas.map((l: { cantidadRecibida: string }) => l.cantidadRecibida)).toEqual(['10.000', '3.000']);
      expect(o.compras).toEqual([expect.objectContaining({ numero: '7001', estado: 'REGISTRADA' })]);

      const abiertas = (await gerente.get('/compras/ordenes').query({ estado: 'abiertas' }).expect(200)).body;
      expect(abiertas.datos.map((x: { id: number }) => x.id)).toEqual([orden]);

      await gerente
        .post('/compras')
        .send(
          compra({
            ordenId: orden,
            numero: '7002',
            numeroControl: '00-7002',
            actualizarCostos: false,
            lineas: [
              { productoId: martillo, cantidad: '16', costoUnitario: '6' },
              { productoId: tornillo, presentacionId: caja, cantidad: '7', costoUnitario: '2.50' },
              // No estaba pedido: entra al inventario sin tocar la orden.
              { productoId: clavo, cantidad: '100', costoUnitario: '0.02' },
            ],
          }),
        )
        .expect(201);
      o = (await gerente.get(`/compras/ordenes/${orden}`).expect(200)).body;
      expect(o.estado).toBe('RECIBIDA');

      // Una orden recibida ya no admite más recepciones ni se cancela.
      await gerente
        .post('/compras')
        .send(compra({ ordenId: orden, numero: '7003', numeroControl: '00-7003' }))
        .expect(409);
      await gerente.post(`/compras/ordenes/${orden}/cancelar`).expect(409);
    });

    it('se cancela una orden pendiente', async () => {
      const r = await almacen
        .post('/compras/ordenes')
        .send({
          proveedorId: otroProveedor,
          fecha: hoy,
          moneda: 'BS',
          lineas: [{ productoId: clavo, cantidad: '500', costoUnitario: '2' }],
        })
        .expect(201);
      expect((await almacen.post(`/compras/ordenes/${r.body.id}/cancelar`).expect(201)).body.estado).toBe('CANCELADA');
    });
  });

  describe('anulación de compras', () => {
    it('solo gerencia anula, con motivo', async () => {
      const id = (await gerente.get('/compras').query({ q: '7002' }).expect(200)).body.datos[0].id;
      await almacen.post(`/compras/${id}/anular`).send({ motivo: 'Error' }).expect(403);
      await gerente.post(`/compras/${id}/anular`).send({ motivo: '' }).expect(400);
    });

    it('revierte inventario, costo, libro de compras y lo recibido en la orden', async () => {
      const id = (await gerente.get('/compras').query({ q: '7001' }).expect(200)).body.datos[0].id;
      expect(await producto(martillo)).toMatchObject({ existencia: '30.000', costoUsd: '6.0000' });

      const r = await gerente.post(`/compras/${id}/anular`).send({ motivo: 'Se cargó dos veces' }).expect(201);
      expect(r.body).toMatchObject({
        estado: 'ANULADA',
        motivoAnulacion: 'Se cargó dos veces',
        saldo: '0.00',
        facturaCompraId: null,
      });

      // Entraron 10 y 300: salen; el costo vuelve a 5 y el precio con él.
      expect(await producto(martillo)).toMatchObject({ existencia: '20.000', costoUsd: '5.0000' });
      expect(await producto(tornillo)).toMatchObject({ existencia: '700.000', costoUsd: '0.0300' });
      const kardex = (await gerente.get(`/inventario/productos/${martillo}/movimientos`).expect(200)).body.datos[0];
      expect(kardex).toMatchObject({ tipo: 'SALIDA', cantidad: '-10.000', motivo: 'Anulación de compra: Se cargó dos veces' });
      const historial = (await gerente.get(`/productos/${martillo}/historial-costos`).expect(200)).body;
      expect(historial[0]).toMatchObject({ costoAnterior: '6.0000', costoNuevo: '5.0000' });

      const libro = (
        await gerente
          .get('/fiscal/libro-compras')
          .query({ mes: hoy.slice(0, 7) })
          .expect(200)
      ).body;
      expect(libro.filas.map((f: { numero: string }) => f.numero)).toEqual(['7002']);

      const o = (await gerente.get(`/compras/ordenes/${orden}`).expect(200)).body;
      expect(o.estado).toBe('PARCIAL');
      expect(o.lineas.map((l: { cantidadRecibida: string }) => l.cantidadRecibida)).toEqual(['16.000', '7.000']);

      await gerente.post(`/compras/${id}/anular`).send({ motivo: 'Otra vez' }).expect(409);
      await gerente.post(`/compras/${id}/pagos`).send({ fecha: hoy, metodo: 'TRANSFERENCIA', monto: '1' }).expect(409);
      expect((await gerente.get('/compras').query({ pago: 'anuladas' }).expect(200)).body.datos).toHaveLength(1);
    });

    it('el mismo documento se puede volver a registrar después de anulado', async () => {
      const r = await gerente
        .post('/compras')
        .send(compra({ actualizarCostos: false, lineas: [{ productoId: martillo, cantidad: '1', costoUnitario: '6' }] }))
        .expect(201);
      expect(r.body.numero).toBe('7001');
    });

    it('no anula si ya tiene pagos o si la mercancía ya salió', async () => {
      const pagada = (
        await gerente
          .post('/compras')
          .send(
            compra({
              numero: '7010',
              numeroControl: '00-7010',
              condicion: 'CREDITO',
              vencimiento: hoy,
              actualizarCostos: false,
              lineas: [{ productoId: clavo, cantidad: '10', costoUnitario: '0.02' }],
            }),
          )
          .expect(201)
      ).body.id;
      await gerente.post(`/compras/${pagada}/pagos`).send({ fecha: hoy, metodo: 'TRANSFERENCIA', monto: '0.10' }).expect(201);
      expect((await gerente.post(`/compras/${pagada}/anular`).send({ motivo: 'Error' }).expect(400)).body.message).toMatch(
        /pagos/,
      );

      const vendida = (
        await gerente
          .post('/compras')
          .send(
            compra({
              numero: '7011',
              numeroControl: '00-7011',
              actualizarCostos: false,
              lineas: [{ productoId: martillo, cantidad: '5', costoUnitario: '6' }],
            }),
          )
          .expect(201)
      ).body.id;
      const existencia = Number((await producto(martillo)).existencia);
      await gerente
        .post('/inventario/ajustes')
        .send({ productoId: martillo, tipo: 'SALIDA', cantidad: String(existencia - 2), motivo: 'Consumo' })
        .expect(201);
      const e = await gerente.post(`/compras/${vendida}/anular`).send({ motivo: 'Error' }).expect(400);
      expect(e.body.message).toMatch(/ya salió del inventario/);
      // Nada cambió.
      expect((await producto(martillo)).existencia).toBe('2.000');
    });

    it('con comprobante de retención: solo si es el último emitido', async () => {
      await admin
        .put('/configuracion')
        .send({ empresa: { contribuyenteEspecial: true, rif: 'J-00000003-4' } })
        .expect(200);
      const linea = [{ productoId: clavo, cantidad: '1', costoUnitario: '10' }];
      const primera = (
        await gerente
          .post('/compras')
          .send(compra({ numero: '7020', numeroControl: '00-7020', actualizarCostos: false, lineas: linea }))
          .expect(201)
      ).body.id;
      const segunda = (
        await gerente
          .post('/compras')
          .send(compra({ numero: '7021', numeroControl: '00-7021', actualizarCostos: false, lineas: linea }))
          .expect(201)
      ).body.id;
      const e = await gerente.post(`/compras/${primera}/anular`).send({ motivo: 'Error' }).expect(400);
      expect(e.body.message).toMatch(/no es el último del mes/);
      await gerente.post(`/compras/${segunda}/anular`).send({ motivo: 'Error' }).expect(201);
      // Liberado el último número, ahora la primera es la última.
      await gerente.post(`/compras/${primera}/anular`).send({ motivo: 'Error' }).expect(201);
      const comprobantes = (
        await gerente
          .get('/fiscal/retenciones')
          .query({ mes: hoy.slice(0, 7) })
          .expect(200)
      ).body;
      expect(comprobantes).toEqual([]);
    });
  });
});
