import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { hoyEnCaracas } from '../src/comun/fechas';
import { api, CLAVE_ADMIN, crearAppDePrueba, iniciarSesion } from './utilidades';

describe('Fase 3: punto de venta, caja y talonarios (integración)', () => {
  let app: INestApplication<App>;
  let admin: ReturnType<typeof api>;
  let gerente: ReturnType<typeof api>;
  let cajero: ReturnType<typeof api>;
  let cajero2: ReturnType<typeof api>;
  let almacen: ReturnType<typeof api>;
  let martillo: number;
  let cable: number;
  let libro: number;
  const ventas: Record<string, number> = {};

  beforeAll(async () => {
    ({ app } = await crearAppDePrueba());
    admin = api(app, await iniciarSesion(app, 'admin', CLAVE_ADMIN));
    for (const [usuario, rol] of [
      ['gerente', 'GERENTE'],
      ['cajero', 'CAJERO'],
      ['cajero2', 'CAJERO'],
      ['almacen', 'ALMACEN'],
    ]) {
      await admin
        .post('/usuarios')
        .send({ usuario, nombre: `Usuario ${usuario}`, clave: 'Clave-12345', rol })
        .expect(201);
    }
    gerente = api(app, await iniciarSesion(app, 'gerente', 'Clave-12345'));
    cajero = api(app, await iniciarSesion(app, 'cajero', 'Clave-12345'));
    cajero2 = api(app, await iniciarSesion(app, 'cajero2', 'Clave-12345'));
    almacen = api(app, await iniciarSesion(app, 'almacen', 'Clave-12345'));

    await gerente.post('/tasas').send({ moneda: 'USD', valor: '100', fechaValor: hoyEnCaracas() }).expect(201);
    const unidades = (await admin.get('/unidades').expect(200)).body as { id: number; codigo: string }[];
    const unidad = (codigo: string) => unidades.find((u) => u.codigo === codigo)!.id;
    // Precio al público = costo + 30 %: martillo 6,50; cable 1,30 el metro; libro (exento) 13,00.
    const crear = async (cuerpo: object) => (await gerente.post('/productos').send(cuerpo).expect(201)).body.id as number;
    martillo = await crear({ codigo: 'MAR', descripcion: 'Martillo', unidadBaseId: unidad('UND'), costoUsd: '5' });
    cable = await crear({
      codigo: 'CAB',
      descripcion: 'Cable',
      unidadBaseId: unidad('M'),
      costoUsd: '1',
      presentaciones: [{ unidadId: unidad('ROLLO'), factor: '100' }],
    });
    libro = await crear({
      codigo: 'LIB',
      descripcion: 'Manual',
      unidadBaseId: unidad('UND'),
      costoUsd: '10',
      alicuotaIva: 'EXENTO',
    });
    for (const [productoId, cantidad] of [
      [martillo, '10'],
      [cable, '250'],
      [libro, '3'],
    ] as const) {
      await almacen
        .post('/inventario/ajustes')
        .send({ productoId, tipo: 'ENTRADA', cantidad, motivo: 'Inventario inicial' })
        .expect(201);
    }
  });

  afterAll(async () => {
    await app?.close();
  });

  const existencia = async (id: number) => (await gerente.get(`/productos/${id}`).expect(200)).body.existencia;
  const unMartillo = () => ({ lineas: [{ productoId: martillo, cantidad: '1' }] });

  describe('requisitos para vender', () => {
    it('exige caja abierta y talonario', async () => {
      const sinCaja = await cajero
        .post('/ventas')
        .send({ ...unMartillo(), pagos: [{ metodo: 'EFECTIVO_BS', monto: '754' }] })
        .expect(400);
      expect(sinCaja.body.message).toMatch(/Abra la caja/);

      await cajero.post('/caja/abrir').send({ fondoBs: '100', fondoUsd: '10' }).expect(201);
      await cajero.post('/caja/abrir').send({ fondoBs: '0', fondoUsd: '0' }).expect(409);
      const sinTalonario = await cajero
        .post('/ventas')
        .send({ ...unMartillo(), pagos: [{ metodo: 'EFECTIVO_BS', monto: '754' }] })
        .expect(400);
      expect(sinTalonario.body.message).toMatch(/talonario/);
    });

    it('registra talonarios sin números cruzados; solo gerencia', async () => {
      await cajero.post('/talonarios').send({ numeroDesde: 1, numeroHasta: 5, controlDesde: 100 }).expect(403);
      await gerente.post('/talonarios').send({ numeroDesde: 1, numeroHasta: 5, controlDesde: 100 }).expect(201);
      await gerente.post('/talonarios').send({ numeroDesde: 5, numeroHasta: 9, controlDesde: 200 }).expect(409);
      await gerente.post('/talonarios').send({ numeroDesde: 9, numeroHasta: 3, controlDesde: 200 }).expect(400);
      expect((await cajero.get('/talonarios/estado').expect(200)).body).toEqual({
        proxima: { talonarioId: expect.any(Number), serie: '', numero: '000001', numeroControl: '00-000100' },
        restantes: 5,
        pocas: true,
      });
    });
  });

  describe('ventas', () => {
    it('cotiza sin guardar', async () => {
      const r = await cajero
        .post('/ventas/cotizar')
        .send({ lineas: [{ productoId: martillo, cantidad: '2' }], pagos: [] })
        .expect(200);
      // 6,50 × 100 = 650; × 2 = 1.300; IVA 208
      expect(r.body).toMatchObject({
        baseGeneralBs: '1300.00',
        ivaGeneralBs: '208.00',
        totalBs: '1508.00',
        faltanteBs: '1508.00',
      });
      expect(await existencia(martillo)).toBe('10.000');
    });

    it('exige referencia en pagos electrónicos y el pago completo', async () => {
      const lineas = [{ productoId: martillo, cantidad: '2' }];
      const r1 = await cajero
        .post('/ventas')
        .send({ lineas, pagos: [{ metodo: 'PAGO_MOVIL', monto: '1508' }] })
        .expect(400);
      expect(r1.body.message).toMatch(/referencia/);
      const r2 = await cajero
        .post('/ventas')
        .send({ lineas, pagos: [{ metodo: 'EFECTIVO_BS', monto: '1000' }] })
        .expect(400);
      expect(r2.body.message).toBe('Faltan Bs 508.00 por cobrar');
      expect((await cajero.get('/talonarios/estado').expect(200)).body.proxima.numero).toBe('000001');
    });

    it('vende con pagos mixtos, asigna la factura y descuenta el inventario', async () => {
      const r = await cajero
        .post('/ventas')
        .send({
          lineas: [
            { productoId: martillo, cantidad: '2' },
            { productoId: cable, presentacionId: null, cantidad: '12.5' },
          ],
          pagos: [
            { metodo: 'EFECTIVO_USD', monto: '10' },
            { metodo: 'PAGO_MOVIL', monto: '2393', referencia: '0123456' },
          ],
        })
        .expect(201);
      ventas.mixta = r.body.id;
      // Cable: 1,30 × 100 = 130 × 12,5 = 1.625 → base general 2.925, IVA 468, total 3.393
      expect(r.body).toMatchObject({
        estado: 'COMPLETADA',
        numeroFactura: 1,
        numeroControl: '00-000100',
        clienteNombre: 'Consumidor final',
        baseGeneralBs: '2925.00',
        ivaGeneralBs: '468.00',
        totalBs: '3393.00',
        igtfBs: '0.00',
        totalPagarBs: '3393.00',
        totalPagarUsd: '33.93',
        vueltoBs: '0.00',
        vueltoMetodo: null,
      });
      expect(r.body.pagos.map((p: { metodo: string; montoBs: string }) => [p.metodo, p.montoBs])).toEqual([
        ['EFECTIVO_USD', '1000.00'],
        ['PAGO_MOVIL', '2393.00'],
      ]);
      expect(await existencia(martillo)).toBe('8.000');
      expect(await existencia(cable)).toBe('237.500');
      const kardex = (await gerente.get(`/inventario/productos/${martillo}/movimientos`).expect(200)).body.datos[0];
      expect(kardex).toMatchObject({ tipo: 'VENTA', cantidad: '-2.000', referencia: 'Factura 000001' });
    });

    it('vende por presentación, a un cliente registrado y con vuelto', async () => {
      const cliente = (
        await cajero
          .post('/clientes')
          .send({ documento: 'v12345678', nombre: 'Pedro Pérez', direccion: 'San Juan de los Morros' })
          .expect(201)
      ).body;
      expect(cliente.documento).toBe('V-12345678');
      await cajero.post('/clientes').send({ documento: 'V-12345678', nombre: 'Otro' }).expect(409);
      expect((await cajero.get('/clientes').query({ q: '1234567' }).expect(200)).body.total).toBe(1);

      const producto = (await gerente.get(`/productos/${cable}`).expect(200)).body;
      const rollo = producto.presentaciones[0].id;
      const r = await cajero
        .post('/ventas')
        .send({
          clienteId: cliente.id,
          lineas: [
            { productoId: cable, presentacionId: rollo, cantidad: '1' },
            { productoId: libro, cantidad: '1' },
          ],
          pagos: [{ metodo: 'EFECTIVO_BS', monto: '17000' }],
        })
        .expect(201);
      ventas.vuelto = r.body.id;
      // Rollo: 130 × 100 = 13.000 + IVA 2.080; libro exento 1.300 → total 16.380; vuelto 620
      expect(r.body).toMatchObject({
        numeroFactura: 2,
        clienteDocumento: 'V-12345678',
        clienteNombre: 'Pedro Pérez',
        baseExentaBs: '1300.00',
        totalBs: '16380.00',
        vueltoMetodo: 'EFECTIVO_BS',
        vueltoMonto: '620.00',
      });
      expect(r.body.lineas[0]).toMatchObject({ unidad: 'ROLLO', factor: '100.000000', cantidad: '1.000', precioBs: '13000.00' });
      expect(await existencia(cable)).toBe('137.500');

      const decimales = await cajero
        .post('/ventas')
        .send({
          lineas: [{ productoId: cable, presentacionId: rollo, cantidad: '0.5' }],
          pagos: [{ metodo: 'EFECTIVO_BS', monto: '9000' }],
        })
        .expect(400);
      expect(decimales.body.message).toMatch(/ROLLO/);
    });

    it('cobra IGTF a contribuyentes especiales sobre lo pagado en divisas', async () => {
      await admin
        .put('/configuracion')
        .send({ empresa: { contribuyenteEspecial: true } })
        .expect(200);
      const r = await cajero
        .post('/ventas')
        .send({ ...unMartillo(), pagos: [{ metodo: 'ZELLE', monto: '7.77', referencia: 'ZL-1' }], vueltoMetodo: 'EFECTIVO_BS' })
        .expect(201);
      ventas.igtf = r.body.id;
      // Total 754; base IGTF 754; IGTF 22,62 → a pagar 776,62; Zelle 777 → vuelto 0,38 Bs
      expect(r.body).toMatchObject({
        numeroFactura: 3,
        baseIgtfBs: '754.00',
        igtfBs: '22.62',
        totalPagarBs: '776.62',
        vueltoBs: '0.38',
      });
      await admin
        .put('/configuracion')
        .send({ empresa: { contribuyenteEspecial: false } })
        .expect(200);
    });

    it('anula una hoja dañada del talonario y avisa cuando se agota', async () => {
      const anulada = (await cajero.post('/talonarios/anular-siguiente').send({ motivo: 'Se manchó' }).expect(201)).body;
      expect(anulada).toMatchObject({ numero: 4, numeroControl: '00-000103' });
      ventas.ultima = (
        await cajero
          .post('/ventas')
          .send({ ...unMartillo(), pagos: [{ metodo: 'PUNTO_VENTA', monto: '754' }] })
          .expect(201)
      ).body.id;
      const agotado = await cajero
        .post('/ventas')
        .send({ ...unMartillo(), pagos: [{ metodo: 'PUNTO_VENTA', monto: '754' }] })
        .expect(400);
      expect(agotado.body.message).toMatch(/No hay facturas disponibles/);
      expect((await gerente.get('/talonarios').expect(200)).body[0]).toMatchObject({ siguiente: 6, restantes: 0 });
    });

    it('cada cajero ve solo sus ventas; gerencia ve todas', async () => {
      await cajero2.get(`/ventas/${ventas.mixta}`).expect(403);
      expect((await cajero2.get('/ventas').expect(200)).body.total).toBe(0);
      expect((await gerente.get('/ventas').expect(200)).body.total).toBe(4);
      expect((await gerente.get('/ventas').query({ q: 'pedro' }).expect(200)).body.datos[0].id).toBe(ventas.vuelto);
      await almacen.get('/ventas').expect(403);
    });

    it('anula una venta y devuelve la mercancía al inventario', async () => {
      await cajero2.post(`/ventas/${ventas.ultima}/anular`).send({ motivo: 'Error' }).expect(403);
      await cajero.post(`/ventas/${ventas.ultima}/anular`).send({ motivo: '' }).expect(400);
      expect(await existencia(martillo)).toBe('6.000');
      const r = await cajero.post(`/ventas/${ventas.ultima}/anular`).send({ motivo: 'El cliente desistió' }).expect(200);
      expect(r.body).toMatchObject({ estado: 'ANULADA', motivoAnulacion: 'El cliente desistió' });
      expect(await existencia(martillo)).toBe('7.000');
      await cajero.post(`/ventas/${ventas.ultima}/anular`).send({ motivo: 'Otra vez' }).expect(400);
    });
  });

  describe('caja', () => {
    it('calcula lo esperado por método: fondo + cobrado − vuelto ± movimientos', async () => {
      const r = (await cajero.get('/caja/actual').expect(200)).body;
      expect(r.ventas).toEqual({ cantidad: 3, anuladas: 1, totalBs: '20527.00', igtfBs: '22.62', creditoBs: '0.00' });
      expect(r.cobrado).toEqual({ EFECTIVO_USD: '10.00', PAGO_MOVIL: '2393.00', EFECTIVO_BS: '17000.00', ZELLE: '7.77' });
      expect(r.esperado).toEqual({
        EFECTIVO_BS: '16479.62', // 100 + 17.000 − 620 − 0,38
        EFECTIVO_USD: '20.00',
        PAGO_MOVIL: '2393.00',
        ZELLE: '7.77',
      });
    });

    it('registra retiros y gastos de efectivo sin dejar la caja en negativo', async () => {
      const r1 = await cajero
        .post('/caja/movimientos')
        .send({ tipo: 'RETIRO', metodo: 'EFECTIVO_USD', monto: '25', motivo: 'Depósito' })
        .expect(400);
      expect(r1.body.message).toMatch(/No hay suficiente/);
      await cajero.post('/caja/movimientos').send({ tipo: 'GASTO', metodo: 'ZELLE', monto: '1', motivo: 'x' }).expect(400);
      const r2 = await cajero
        .post('/caja/movimientos')
        .send({ tipo: 'GASTO', metodo: 'EFECTIVO_BS', monto: '479.62', motivo: 'Café y agua' })
        .expect(201);
      expect(r2.body.esperado.EFECTIVO_BS).toBe('16000.00');
    });

    it('cierra con arqueo y diferencias; después no se puede anular ni vender', async () => {
      const r = await cajero
        .post('/caja/cerrar')
        .send({ contado: { EFECTIVO_BS: '15990', EFECTIVO_USD: '20', PAGO_MOVIL: '2393' }, observaciones: 'Faltan 10 Bs' })
        .expect(200);
      expect(r.body.sesion.estado).toBe('CERRADA');
      expect(r.body.diferencias).toEqual({ EFECTIVO_BS: '-10.00', EFECTIVO_USD: '0.00', PAGO_MOVIL: '0.00', ZELLE: '-7.77' });

      const anular = await gerente.post(`/ventas/${ventas.mixta}/anular`).send({ motivo: 'Tarde' }).expect(400);
      expect(anular.body.message).toMatch(/nota de crédito/);
      expect((await cajero.get('/caja/actual').expect(200)).body).toEqual({ sesion: null });
      await cajero.post('/caja/cerrar').send({ contado: {} }).expect(400);
    });

    it('gerencia consulta el historial de cajas', async () => {
      await cajero.get('/caja/sesiones').expect(403);
      const lista = (await gerente.get('/caja/sesiones').expect(200)).body;
      expect(lista.total).toBe(1);
      const id = lista.datos[0].id;
      expect((await gerente.get(`/caja/sesiones/${id}`).expect(200)).body.sesion.contado.EFECTIVO_BS).toBe('15990.00');
      await cajero2.get(`/caja/sesiones/${id}`).expect(403);
    });
  });
});
