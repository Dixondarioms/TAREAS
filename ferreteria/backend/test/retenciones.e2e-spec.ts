import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { hoyEnCaracas } from '../src/comun/fechas';
import { api, CLAVE_ADMIN, crearAppDePrueba, iniciarSesion } from './utilidades';

describe('Retenciones de IVA y notas de débito (integración)', () => {
  let app: INestApplication<App>;
  let admin: ReturnType<typeof api>;
  let gerente: ReturnType<typeof api>;
  let cajero: ReturnType<typeof api>;
  let proveedor: number;
  let martillo: number;
  let cliente: number;
  let venta: { id: number };
  const hoy = hoyEnCaracas();
  const mes = hoy.slice(0, 7);
  const periodo = mes.replace('-', '');
  const quincena = Number(hoy.slice(8)) <= 15 ? 1 : 2;

  beforeAll(async () => {
    ({ app } = await crearAppDePrueba());
    admin = api(app, await iniciarSesion(app, 'admin', CLAVE_ADMIN));
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
    proveedor = (await gerente.post('/proveedores').send({ rif: 'J-00000001-8', razonSocial: 'Distribuidora Uno' }).expect(201))
      .body.id;
    const und = ((await admin.get('/unidades').expect(200)).body as { id: number; codigo: string }[]).find(
      (u) => u.codigo === 'UND',
    )!.id;
    martillo = (
      await gerente
        .post('/productos')
        .send({ codigo: 'MAR', descripcion: 'Martillo', unidadBaseId: und, costoUsd: '5' })
        .expect(201)
    ).body.id;
    await gerente
      .post('/inventario/ajustes')
      .send({ productoId: martillo, tipo: 'ENTRADA', cantidad: '10', motivo: 'Inicial' })
      .expect(201);
    await gerente.post('/talonarios').send({ numeroDesde: 1, numeroHasta: 50, controlDesde: 1 }).expect(201);
    await cajero.post('/caja/abrir').send({ fondoBs: '500', fondoUsd: '0' }).expect(201);
    cliente = (await cajero.post('/clientes').send({ documento: 'J-00000002-6', nombre: 'Constructora Dos C.A.' }).expect(201))
      .body.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  const factura = (numero: string, extra: object = {}) => ({
    proveedorId: proveedor,
    fecha: hoy,
    numero,
    numeroControl: `00-${numero}`,
    baseGeneralBs: '1000',
    ivaGeneralBs: '160',
    ...extra,
  });

  describe('retenciones que emite la ferretería', () => {
    it('si no es agente de retención no retiene', async () => {
      const r = await gerente.post('/fiscal/compras').send(factura('100')).expect(201);
      expect(r.body).toMatchObject({ ivaRetenidoBs: '0.00', numeroComprobante: null });
    });

    it('como agente retiene el 75 % (o el 100 %) con comprobante consecutivo del mes', async () => {
      await admin
        .put('/configuracion')
        .send({ empresa: { contribuyenteEspecial: true, rif: 'J-00000003-4' } })
        .expect(200);
      const r1 = await gerente.post('/fiscal/compras').send(factura('101')).expect(201);
      expect(r1.body).toMatchObject({
        porcentajeRetencion: '75.00',
        ivaRetenidoBs: '120.00',
        numeroComprobante: `${periodo}00000001`,
      });
      const r2 = await gerente
        .post('/fiscal/compras')
        .send(factura('102', { porcentajeRetencion: 100 }))
        .expect(201);
      expect(r2.body).toMatchObject({ ivaRetenidoBs: '160.00', numeroComprobante: `${periodo}00000002` });
      await gerente
        .post('/fiscal/compras')
        .send(factura('103', { porcentajeRetencion: 50 }))
        .expect(400);
      const eliminar = await gerente.delete(`/fiscal/compras/${r1.body.id}`).expect(400);
      expect(eliminar.body.message).toMatch(/comprobante de retención/);
    });

    it('en Compras la retención se descuenta de lo que se le debe al proveedor', async () => {
      const r = await gerente
        .post('/compras')
        .send({
          proveedorId: proveedor,
          fecha: hoy,
          numero: '200',
          numeroControl: '00-200',
          moneda: 'USD',
          condicion: 'CONTADO',
          facturaFiscal: true,
          actualizarCostos: false,
          lineas: [{ productoId: martillo, cantidad: '10', costoUnitario: '5' }],
        })
        .expect(201);
      // 50 + IVA 8 = 58 USD; en Bs: IVA 800, retención 600 = 6 USD
      expect(r.body).toMatchObject({ total: '58.00', retencionIva: '6.00', saldo: '52.00' });
      const libro = (await gerente.get('/fiscal/libro-compras').query({ mes }).expect(200)).body;
      expect(libro.totales.ivaRetenidoBs).toBe('880.00'); // 120 + 160 + 600
    });

    it('lista los comprobantes, da los datos para imprimir y genera el TXT de la quincena', async () => {
      const lista = (await gerente.get('/fiscal/retenciones').query({ mes }).expect(200)).body;
      expect(lista.map((f: { numeroComprobante: string }) => f.numeroComprobante)).toEqual([
        `${periodo}00000001`,
        `${periodo}00000002`,
        `${periodo}00000003`,
      ]);
      const c = (await gerente.get(`/fiscal/compras/${lista[0].id}/comprobante`).expect(200)).body;
      expect(c).toMatchObject({
        periodo,
        agente: { rif: 'J-00000003-4' },
        factura: { proveedor: { razonSocial: 'Distribuidora Uno' } },
      });

      const txt = await gerente.get('/fiscal/retenciones/txt').query({ mes, quincena }).buffer(true).expect(200);
      expect(txt.headers['content-disposition']).toContain(`retenciones-iva-${mes}-q${quincena}.txt`);
      const lineas = txt.text
        .trim()
        .split('\r\n')
        .map((l: string) => l.split('\t'));
      expect(lineas).toHaveLength(3);
      expect(lineas[0]).toEqual([
        'J000000034',
        periodo,
        hoy,
        'C',
        '01',
        'J000000018',
        '101',
        '00-101',
        '1160.00',
        '1000.00',
        '120.00',
        '0',
        `${periodo}00000001`,
        '0.00',
        '16.00',
        '0',
      ]);
      const otra = await gerente
        .get('/fiscal/retenciones/txt')
        .query({ mes, quincena: quincena === 1 ? 2 : 1 })
        .buffer(true)
        .expect(200);
      expect(otra.text).toBe('');
    });
  });

  describe('retenciones que le hacen a la ferretería', () => {
    it('el cliente agente paga el IVA retenido con su comprobante, fuera de la caja', async () => {
      const base = { clienteId: cliente, lineas: [{ productoId: martillo, cantidad: '1' }] };
      // Martillo: 650 + IVA 104 = 754; retiene 75 % del IVA = 78
      await cajero
        .post('/ventas')
        .send({
          ...base,
          pagos: [
            { metodo: 'EFECTIVO_BS', monto: '676' },
            { metodo: 'RETENCION_IVA', monto: '78' },
          ],
        })
        .expect(400); // sin número de comprobante
      const mucho = await cajero
        .post('/ventas')
        .send({
          ...base,
          pagos: [
            { metodo: 'EFECTIVO_BS', monto: '600' },
            { metodo: 'RETENCION_IVA', monto: '154', referencia: 'X' },
          ],
        })
        .expect(400);
      expect(mucho.body.message).toMatch(/supera el IVA de la factura/);
      await cajero
        .post('/ventas')
        .send({
          lineas: base.lineas,
          pagos: [
            { metodo: 'EFECTIVO_BS', monto: '676' },
            { metodo: 'RETENCION_IVA', monto: '78', referencia: '1' },
          ],
        })
        .expect(400); // sin cliente
      venta = (
        await cajero
          .post('/ventas')
          .send({
            ...base,
            pagos: [
              { metodo: 'EFECTIVO_BS', monto: '676' },
              { metodo: 'RETENCION_IVA', monto: '78', referencia: '20261000000123' },
            ],
          })
          .expect(201)
      ).body;
      const caja = (await cajero.get('/caja/actual').expect(200)).body;
      expect(caja.ventas.retencionesBs).toBe('78.00');
      expect(caja.esperado.EFECTIVO_BS).toBe('1176.00'); // 500 + 676
    });

    it('aparece en el libro de ventas y se resta de la cuota', async () => {
      const libro = (await gerente.get('/fiscal/libro-ventas').query({ mes }).expect(200)).body;
      expect(libro.filas[0]).toMatchObject({ ivaRetenidoBs: '78.00', comprobanteRetencion: '20261000000123' });
      const r = (await gerente.get('/fiscal/resumen').query({ mes }).expect(200)).body;
      // Débito 104; crédito 160 × 3 + 800 = 1.280 (100 + 101 + 102 + compra 200)
      expect(r).toMatchObject({
        debitoFiscalBs: '104.00',
        creditoFiscalBs: '1280.00',
        retencionesRecibidasBs: '78.00',
        diferenciaBs: '-1254.00',
      });
    });
  });

  describe('notas de débito', () => {
    it('necesitan su propio talonario y se cobran en caja', async () => {
      const cuerpo = { concepto: 'Flete de entrega', baseBs: '100', alicuotaIva: 'GENERAL', metodo: 'EFECTIVO_BS' };
      const sin = await cajero.post(`/ventas/${venta.id}/notas-debito`).send(cuerpo).expect(400);
      expect(sin.body.message).toMatch(/talonario/i);
      await gerente
        .post('/talonarios')
        .send({ tipo: 'NOTA_DEBITO', numeroDesde: 1, numeroHasta: 20, controlDesde: 700 })
        .expect(201);
      await cajero
        .post(`/ventas/${venta.id}/notas-debito`)
        .send({ ...cuerpo, metodo: 'CREDITO' })
        .expect(400);
      const r = await cajero.post(`/ventas/${venta.id}/notas-debito`).send(cuerpo).expect(201);
      expect(r.body).toMatchObject({
        numero: 1,
        numeroControl: '00-000700',
        baseBs: '100.00',
        ivaBs: '16.00',
        totalBs: '116.00',
        monto: '116.00',
      });
      const enUsd = await cajero
        .post(`/ventas/${venta.id}/notas-debito`)
        .send({ ...cuerpo, metodo: 'EFECTIVO_USD' })
        .expect(201);
      expect(enUsd.body.monto).toBe('1.16');

      const caja = (await cajero.get('/caja/actual').expect(200)).body;
      expect(caja.cobrado).toMatchObject({ EFECTIVO_BS: '792.00', EFECTIVO_USD: '1.16' });
      expect((await cajero.get(`/ventas/${venta.id}/notas-debito`).expect(200)).body).toHaveLength(2);
    });

    it('van al libro de ventas en positivo, con la factura que afectan', async () => {
      const libro = (await gerente.get('/fiscal/libro-ventas').query({ mes }).expect(200)).body;
      const nd = libro.filas.filter((f: { documento: string }) => f.documento === 'NOTA_DEBITO');
      expect(nd[0]).toMatchObject({
        numero: '000001',
        facturaAfectada: '000001',
        baseGeneralBs: '100.00',
        ivaGeneralBs: '16.00',
        totalBs: '116.00',
      });
      expect(libro.totales.ivaGeneralBs).toBe('136.00'); // 104 + 16 + 16
    });
  });
});
