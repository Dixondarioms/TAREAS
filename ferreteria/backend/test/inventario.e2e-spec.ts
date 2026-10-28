import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { api, CLAVE_ADMIN, crearAppDePrueba, iniciarSesion } from './utilidades';

describe('Fase 2: inventario y kardex (integración)', () => {
  let app: INestApplication<App>;
  let gerente: ReturnType<typeof api>;
  let almacen: ReturnType<typeof api>;
  let cajero: ReturnType<typeof api>;
  let martillo: number;
  let cable: number;

  beforeAll(async () => {
    ({ app } = await crearAppDePrueba());
    const admin = api(app, await iniciarSesion(app, 'admin', CLAVE_ADMIN));
    for (const [usuario, rol] of [
      ['gerente', 'GERENTE'],
      ['almacen', 'ALMACEN'],
      ['cajero', 'CAJERO'],
    ]) {
      await admin
        .post('/usuarios')
        .send({ usuario, nombre: `Usuario ${usuario}`, clave: 'Clave-12345', rol })
        .expect(201);
    }
    gerente = api(app, await iniciarSesion(app, 'gerente', 'Clave-12345'));
    almacen = api(app, await iniciarSesion(app, 'almacen', 'Clave-12345'));
    cajero = api(app, await iniciarSesion(app, 'cajero', 'Clave-12345'));

    const unidades = (await admin.get('/unidades').expect(200)).body as { id: number; codigo: string }[];
    const unidad = (codigo: string) => unidades.find((u) => u.codigo === codigo)!.id;
    martillo = (
      await gerente
        .post('/productos')
        .send({
          codigo: 'MAR-16',
          descripcion: 'Martillo 16 oz',
          unidadBaseId: unidad('UND'),
          costoUsd: '6.50',
          stockMinimo: '6',
        })
        .expect(201)
    ).body.id;
    cable = (
      await gerente
        .post('/productos')
        .send({ codigo: 'CAB-12', descripcion: 'Cable THW 12', unidadBaseId: unidad('M'), costoUsd: '0.55' })
        .expect(201)
    ).body.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  const existencia = async (id: number) => (await gerente.get(`/productos/${id}`).expect(200)).body.existencia;

  describe('ajustes', () => {
    it('un producto nuevo empieza sin existencia', async () => {
      expect(await existencia(martillo)).toBe('0.000');
    });

    it('registra entradas y salidas y actualiza la existencia', async () => {
      await almacen
        .post('/inventario/ajustes')
        .send({ productoId: martillo, tipo: 'ENTRADA', cantidad: '10', motivo: 'Mercancía encontrada' })
        .expect(201);
      const r = await almacen
        .post('/inventario/ajustes')
        .send({ productoId: martillo, tipo: 'SALIDA', cantidad: '3', motivo: 'Consumo interno' })
        .expect(201);
      expect(r.body).toMatchObject({ tipo: 'SALIDA', cantidad: '-3.000', existenciaResultante: '7.000', costoUsd: '6.5000' });
      expect(await existencia(martillo)).toBe('7.000');
    });

    it('acepta decimales solo en unidades que los permiten', async () => {
      await almacen
        .post('/inventario/ajustes')
        .send({ productoId: cable, tipo: 'ENTRADA', cantidad: '12.5', motivo: 'Rollo abierto' })
        .expect(201);
      const r = await almacen
        .post('/inventario/ajustes')
        .send({ productoId: martillo, tipo: 'MERMA', cantidad: '0.5', motivo: 'Dañado' })
        .expect(400);
      expect(r.body.message).toMatch(/número entero/);
    });

    it('no deja la existencia en negativo', async () => {
      const r = await almacen
        .post('/inventario/ajustes')
        .send({ productoId: martillo, tipo: 'MERMA', cantidad: '8', motivo: 'Dañado' })
        .expect(400);
      expect(r.body.message).toMatch(/Existencia insuficiente de MAR-16: hay 7 UND/);
      expect(await existencia(martillo)).toBe('7.000');
    });

    it('valida tipo, cantidad, motivo y producto', async () => {
      const base = { productoId: martillo, tipo: 'ENTRADA', cantidad: '1', motivo: 'Prueba' };
      await almacen
        .post('/inventario/ajustes')
        .send({ ...base, tipo: 'VENTA' })
        .expect(400);
      await almacen
        .post('/inventario/ajustes')
        .send({ ...base, cantidad: '0' })
        .expect(400);
      await almacen
        .post('/inventario/ajustes')
        .send({ ...base, cantidad: '-2' })
        .expect(400);
      await almacen
        .post('/inventario/ajustes')
        .send({ ...base, motivo: '' })
        .expect(400);
      await almacen
        .post('/inventario/ajustes')
        .send({ ...base, productoId: 99999 })
        .expect(404);
    });

    it('no permite cambiar la unidad base si hay existencia', async () => {
      const unidades = (await gerente.get('/unidades').expect(200)).body as { id: number; codigo: string }[];
      const caja = unidades.find((u) => u.codigo === 'CAJA')!.id;
      const r = await gerente.put(`/productos/${martillo}`).send({ unidadBaseId: caja }).expect(400);
      expect(r.body.message).toMatch(/tiene existencia/);
      // Editar otros datos no altera la existencia.
      await gerente.put(`/productos/${martillo}`).send({ ubicacion: 'Pasillo 1' }).expect(200);
      expect(await existencia(martillo)).toBe('7.000');
    });

    it('el cajero no puede ajustar', async () => {
      await cajero
        .post('/inventario/ajustes')
        .send({ productoId: martillo, tipo: 'ENTRADA', cantidad: '1', motivo: 'Prueba' })
        .expect(403);
    });
  });

  describe('conteo físico', () => {
    it('registra solo las diferencias, con una referencia común', async () => {
      const r = await almacen
        .post('/inventario/conteos')
        .send({
          referencia: 'Conteo pasillo 1',
          lineas: [
            { productoId: martillo, contado: '5' },
            { productoId: cable, contado: '12.5' },
          ],
        })
        .expect(201);
      expect(r.body).toMatchObject({ referencia: 'Conteo pasillo 1', ajustados: 1 });
      expect(r.body.lineas).toEqual([
        expect.objectContaining({ productoId: martillo, anterior: '7.000', contado: '5.000', diferencia: '-2.000' }),
        expect.objectContaining({ productoId: cable, anterior: '12.500', contado: '12.500', diferencia: '0.000' }),
      ]);
      expect(await existencia(martillo)).toBe('5.000');
    });

    it('es todo o nada: una línea inválida no ajusta ningún producto', async () => {
      await almacen
        .post('/inventario/conteos')
        .send({
          lineas: [
            { productoId: cable, contado: '20' },
            { productoId: martillo, contado: '4.5' },
          ],
        })
        .expect(400);
      expect(await existencia(cable)).toBe('12.500');
      await almacen
        .post('/inventario/conteos')
        .send({
          lineas: [
            { productoId: cable, contado: '1' },
            { productoId: cable, contado: '2' },
          ],
        })
        .expect(400);
      await almacen.post('/inventario/conteos').send({ lineas: [] }).expect(400);
    });
  });

  describe('consultas', () => {
    it('muestra el kardex del más reciente al más antiguo, sin costos para el cajero', async () => {
      const k = (await gerente.get(`/inventario/productos/${martillo}/movimientos`).expect(200)).body;
      expect(k.total).toBe(3);
      expect(
        k.datos.map((m: { tipo: string; cantidad: string; existenciaResultante: string }) => [
          m.tipo,
          m.cantidad,
          m.existenciaResultante,
        ]),
      ).toEqual([
        ['CONTEO', '-2.000', '5.000'],
        ['SALIDA', '-3.000', '7.000'],
        ['ENTRADA', '10.000', '10.000'],
      ]);
      expect(k.datos[0]).toMatchObject({ referencia: 'Conteo pasillo 1', usuario: 'Usuario almacen', costoUsd: '6.5000' });

      const delCajero = (await cajero.get(`/inventario/productos/${martillo}/movimientos`).expect(200)).body;
      expect(delCajero.datos[0].costoUsd).toBeUndefined();
      await gerente.get('/inventario/productos/99999/movimientos').expect(404);
    });

    it('filtra productos bajo el mínimo o sin existencia', async () => {
      const bajo = (await cajero.get('/productos').query({ existencia: 'bajo-minimo' }).expect(200)).body;
      expect(bajo.datos.map((p: { codigo: string }) => p.codigo)).toEqual(['MAR-16']);
      expect(bajo.datos[0]).toMatchObject({ existencia: '5.000', stockMinimo: '6.000' });
      const con = (await cajero.get('/productos').query({ existencia: 'con-existencia' }).expect(200)).body;
      expect(con.total).toBe(2);
      const sin = (await cajero.get('/productos').query({ existencia: 'sin-existencia' }).expect(200)).body;
      expect(sin.total).toBe(0);
    });

    it('resume el inventario y valoriza solo para quien ve costos', async () => {
      // 5 × 6,50 + 12,5 × 0,55 = 39,375
      expect((await gerente.get('/inventario/resumen').expect(200)).body).toEqual({
        productosActivos: 2,
        bajoMinimo: 1,
        sinExistencia: 0,
        valorUsd: '39.38',
      });
      expect((await cajero.get('/inventario/resumen').expect(200)).body.valorUsd).toBeUndefined();
    });
  });

  describe('carga de existencias desde planilla', () => {
    it('registra la diferencia como conteo y reporta errores por fila', async () => {
      const csv = ['codigo,existencia', 'MAR-16,12', 'CAB-12,abc', 'NUEVO-1,3'].join('\n');
      const r = (await gerente.post('/productos/importacion').attach('archivo', Buffer.from(csv), 'inicial.csv').expect(201))
        .body;
      expect(r).toMatchObject({ actualizados: 1, creados: 0 });
      expect(r.errores.map((e: { fila: number }) => e.fila)).toEqual([3, 4]);
      expect(await existencia(martillo)).toBe('12.000');
      const k = (await gerente.get(`/inventario/productos/${martillo}/movimientos`).expect(200)).body;
      expect(k.datos[0]).toMatchObject({ tipo: 'CONTEO', cantidad: '7.000', referencia: 'Importación inicial.csv' });
    });
  });
});
