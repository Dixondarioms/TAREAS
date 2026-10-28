import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { api, CLAVE_ADMIN, ClienteBcvFalso, crearAppDePrueba, iniciarSesion } from './utilidades';

describe('Fase 1: catálogo, precios y tasas (integración)', () => {
  let app: INestApplication<App>;
  let bcv: ClienteBcvFalso;
  let admin: ReturnType<typeof api>;
  let gerente: ReturnType<typeof api>;
  let almacen: ReturnType<typeof api>;
  let cajero: ReturnType<typeof api>;
  const ids: Record<string, number> = {};

  beforeAll(async () => {
    ({ app, bcv } = await crearAppDePrueba());
    admin = api(app, await iniciarSesion(app, 'admin', CLAVE_ADMIN));
    for (const [usuario, rol] of [
      ['gerente', 'GERENTE'],
      ['almacen', 'ALMACEN'],
      ['cajero', 'CAJERO'],
    ]) {
      await admin.post('/usuarios').send({ usuario, nombre: usuario, clave: 'Clave-12345', rol }).expect(201);
    }
    gerente = api(app, await iniciarSesion(app, 'gerente', 'Clave-12345'));
    almacen = api(app, await iniciarSesion(app, 'almacen', 'Clave-12345'));
    cajero = api(app, await iniciarSesion(app, 'cajero', 'Clave-12345'));

    const unidades = (await admin.get('/unidades').expect(200)).body as { id: number; codigo: string }[];
    for (const u of unidades) ids[`unidad_${u.codigo}`] = u.id;
    const listas = (await admin.get('/listas-precio').expect(200)).body as { id: number; codigo: string }[];
    for (const l of listas) ids[`lista_${l.codigo}`] = l.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('autenticación y permisos', () => {
    it('rechaza clave incorrecta y rutas sin sesión', async () => {
      await request(app.getHttpServer()).post('/api/auth/login').send({ usuario: 'admin', clave: 'mala' }).expect(401);
      await request(app.getHttpServer()).get('/api/productos').expect(401);
      await request(app.getHttpServer()).get('/api/salud').expect(200);
    });

    it('bloquea temporalmente tras varios intentos fallidos', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer()).post('/api/auth/login').send({ usuario: 'intruso', clave: 'x' }).expect(401);
      }
      const r = await request(app.getHttpServer()).post('/api/auth/login').send({ usuario: 'intruso', clave: 'x' }).expect(401);
      expect(r.body.message).toMatch(/Demasiados intentos/);
    });

    it('solo el administrador gestiona usuarios', async () => {
      await gerente.get('/usuarios').expect(403);
      await cajero.post('/usuarios').send({ usuario: 'x', nombre: 'x', clave: '12345678', rol: 'ADMIN' }).expect(403);
    });

    it('no permite dejar el sistema sin administrador', async () => {
      const yo = (await admin.get('/auth/yo').expect(200)).body;
      await admin.put(`/usuarios/${yo.id}`).send({ activo: false }).expect(400);
    });
  });

  describe('tasa de cambio', () => {
    it('obtiene la tasa del BCV y no la duplica', async () => {
      const r1 = await gerente.post('/tasas/actualizar-bcv').expect(201);
      expect(r1.body.registradas).toHaveLength(2);
      const r2 = await gerente.post('/tasas/actualizar-bcv').expect(201);
      expect(r2.body.registradas).toHaveLength(0);
      expect(r2.body.sinCambios).toEqual(['USD', 'EUR']);
    });

    it('descarta una lectura del BCV con variación absurda', async () => {
      bcv.respuesta = { fechaValor: '2026-10-28', tasas: { USD: '2.15' } };
      const r = await gerente.post('/tasas/actualizar-bcv').expect(201);
      expect(r.body.registradas).toHaveLength(0);
      bcv.respuesta = { fechaValor: '2026-10-28', tasas: { USD: '215.47290000' } };
    });

    it('una corrección manual del mismo día prevalece; el cajero no puede cargar tasas', async () => {
      await cajero.post('/tasas').send({ moneda: 'USD', valor: '200', fechaValor: '2026-10-28' }).expect(403);
      await gerente.post('/tasas').send({ moneda: 'USD', valor: '0', fechaValor: '2026-10-28' }).expect(400);
      // Se carga con fecha pasada para que rija hoy independientemente del día en que corran las pruebas.
      await gerente.post('/tasas').send({ moneda: 'USD', valor: '200.00', fechaValor: '2026-01-01' }).expect(201);
      const estado = (await cajero.get('/tasas/estado').expect(200)).body;
      expect(estado.USD.vigente).toBeTruthy();
    });
  });

  describe('productos', () => {
    beforeAll(async () => {
      ids.marca = (await almacen.post('/marcas').send({ nombre: 'Pavco' }).expect(201)).body.id;
      await almacen.post('/marcas').send({ nombre: 'pavco' }).expect(409);
      ids.catPadre = (await almacen.post('/categorias').send({ nombre: 'Electricidad' }).expect(201)).body.id;
      ids.catHija = (await almacen.post('/categorias').send({ nombre: 'Cables', padreId: ids.catPadre }).expect(201)).body.id;
    });

    it('impide ciclos en categorías', async () => {
      await gerente.put(`/categorias/${ids.catPadre}`).send({ nombre: 'Electricidad', padreId: ids.catHija }).expect(400);
      const plano = (await cajero.get('/categorias').expect(200)).body;
      expect(plano.find((c: { id: number }) => c.id === ids.catHija).ruta).toBe('Electricidad > Cables');
    });

    it('gerencia crea un producto con presentación, códigos de barras y precios', async () => {
      const r = await gerente
        .post('/productos')
        .send({
          codigo: 'cab-12',
          descripcion: 'Cable THW calibre 12 AWG',
          categoriaId: ids.catHija,
          marcaId: ids.marca,
          unidadBaseId: ids.unidad_M,
          costoUsd: '0.80',
          codigosBarras: ['7590001112223'],
          presentaciones: [{ unidadId: ids.unidad_ROLLO, factor: '100', codigosBarras: ['7590001112230'] }],
          precios: [{ listaId: ids.lista_MAYOR, modo: 'FIJO', precioUsd: '0.95' }],
        })
        .expect(201);
      ids.cable = r.body.id;
      expect(r.body.codigo).toBe('CAB-12');
      const publico = r.body.precios.find((p: { lista: { codigo: string } }) => p.lista.codigo === 'PUBLICO');
      expect(publico).toMatchObject({ modo: 'MARGEN', margen: '30.0000', precioUsd: '1.0400', precioUsdConIva: '1.21' });
      const mayor = r.body.precios.find((p: { lista: { codigo: string } }) => p.lista.codigo === 'MAYOR');
      expect(mayor).toMatchObject({ modo: 'FIJO', precioUsd: '0.9500', margen: '18.7500' });
      expect(r.body.presentaciones[0].precios[0].precioUsd).toBe('104.0000');
      expect(publico.precioBs).not.toBeNull();
    });

    it('valida duplicados de código y de código de barras', async () => {
      await gerente.post('/productos').send({ codigo: 'CAB-12', descripcion: 'Otro', unidadBaseId: ids.unidad_UND }).expect(409);
      const r = await gerente
        .post('/productos')
        .send({ codigo: 'X-1', descripcion: 'Otro', unidadBaseId: ids.unidad_UND, codigosBarras: ['7590001112230'] })
        .expect(409);
      expect(r.body.message).toMatch(/CAB-12/);
      await gerente
        .post('/productos')
        .send({ codigo: 'X-2', descripcion: 'Otro', unidadBaseId: ids.unidad_UND, costoUsd: 'abc' })
        .expect(400);
    });

    it('busca por palabras sin acentos, por código de barras y con errores de tipeo', async () => {
      await gerente
        .post('/productos')
        .send({
          codigo: 'TUB-05',
          descripcion: 'Tubería PVC ½" presión',
          unidadBaseId: ids.unidad_M,
          costoUsd: '1.5',
          marcaId: ids.marca,
        })
        .expect(201);
      const porPalabras = (await cajero.get('/productos').query({ q: 'tuberia pvc' }).expect(200)).body;
      expect(porPalabras.datos.map((p: { codigo: string }) => p.codigo)).toEqual(['TUB-05']);
      const porMarca = (await cajero.get('/productos').query({ q: 'pavco cable' }).expect(200)).body;
      expect(porMarca.datos.map((p: { codigo: string }) => p.codigo)).toEqual(['CAB-12']);
      const porBarras = (await cajero.get('/productos').query({ q: '7590001112223' }).expect(200)).body;
      expect(porBarras.datos[0].codigo).toBe('CAB-12');
      const aproximada = (await cajero.get('/productos').query({ q: 'cabel thw' }).expect(200)).body;
      expect(aproximada.busquedaAproximada).toBe(true);
      expect(aproximada.datos[0].codigo).toBe('CAB-12');
      const porCategoria = (await cajero.get('/productos').query({ categoriaId: ids.catPadre }).expect(200)).body;
      expect(porCategoria.total).toBe(1);
    });

    it('el lector de código de barras identifica la presentación', async () => {
      const r = (await cajero.get('/productos/por-codigo/7590001112230').expect(200)).body;
      expect(r.producto.codigo).toBe('CAB-12');
      expect(r.presentacionId).toBe(r.producto.presentaciones[0].id);
      await cajero.get('/productos/por-codigo/NOEXISTE').expect(404);
    });

    it('el cajero no ve costos ni márgenes ni puede editar', async () => {
      const detalle = (await cajero.get(`/productos/${ids.cable}`).expect(200)).body;
      expect(detalle.costoUsd).toBeUndefined();
      expect(detalle.precios[0].margen).toBeUndefined();
      const lista = (await cajero.get('/productos').expect(200)).body;
      expect(lista.datos[0].costoUsd).toBeUndefined();
      await cajero.put(`/productos/${ids.cable}`).send({ descripcion: 'x' }).expect(403);
    });

    it('almacén edita datos pero no costos ni precios', async () => {
      await almacen.put(`/productos/${ids.cable}`).send({ ubicacion: 'P2-E1', stockMinimo: '50' }).expect(200);
      await almacen.put(`/productos/${ids.cable}`).send({ costoUsd: '0.10' }).expect(403);
      await almacen
        .post('/productos')
        .send({ codigo: 'ALM-1', descripcion: 'Creado por almacén', unidadBaseId: ids.unidad_UND, costoUsd: '5' })
        .expect(403);
      await almacen
        .post('/productos')
        .send({ codigo: 'ALM-1', descripcion: 'Creado por almacén', unidadBaseId: ids.unidad_UND })
        .expect(201);
    });

    it('al cambiar el costo se recalculan los precios por margen y se registra el historial', async () => {
      const r = (
        await gerente
          .put(`/productos/${ids.cable}`)
          .send({ costoUsd: '1.00', motivoCambioCosto: 'Factura proveedor' })
          .expect(200)
      ).body;
      const publico = r.precios.find((p: { lista: { codigo: string } }) => p.lista.codigo === 'PUBLICO');
      const mayor = r.precios.find((p: { lista: { codigo: string } }) => p.lista.codigo === 'MAYOR');
      expect(publico.precioUsd).toBe('1.3000');
      expect(mayor).toMatchObject({ precioUsd: '0.9500', margen: '-5.0000' });
      expect(r.ubicacion).toBe('P2-E1');
      expect(r.presentaciones[0].codigosBarras).toEqual(['7590001112230']);
      const historial = (await gerente.get(`/productos/${ids.cable}/historial-costos`).expect(200)).body;
      expect(historial[0]).toMatchObject({ costoAnterior: '0.8000', costoNuevo: '1.0000', motivo: 'Factura proveedor' });
    });

    it('rechaza una presentación con la unidad base', async () => {
      await gerente
        .put(`/productos/${ids.cable}`)
        .send({ presentaciones: [{ unidadId: ids.unidad_M, factor: '1' }] })
        .expect(400);
    });
  });

  describe('ajuste masivo', () => {
    it('simula sin guardar y luego aplica un aumento de costo por marca', async () => {
      const dto = { filtro: { marcaId: ids.marca }, objetivo: 'COSTO', porcentaje: '10', simular: true };
      const sim = (await gerente.post('/precios/ajuste-masivo').send(dto).expect(201)).body;
      expect(sim).toMatchObject({ simulado: true, productosAfectados: 2 });
      const fila = sim.muestra.find((m: { codigo: string }) => m.codigo === 'CAB-12');
      expect(fila).toMatchObject({
        costoAnterior: '1.0000',
        costoNuevo: '1.1000',
        precioAnterior: '1.3000',
        precioNuevo: '1.4300',
      });
      expect((await gerente.get(`/productos/${ids.cable}`).expect(200)).body.costoUsd).toBe('1.0000');

      await gerente
        .post('/precios/ajuste-masivo')
        .send({ ...dto, simular: false })
        .expect(201);
      const despues = (await gerente.get(`/productos/${ids.cable}`).expect(200)).body;
      expect(despues.costoUsd).toBe('1.1000');
      expect(despues.precios.find((p: { lista: { codigo: string } }) => p.lista.codigo === 'MAYOR').precioUsd).toBe('0.9500');
    });

    it('ajusta el precio de una sola lista', async () => {
      await gerente
        .post('/precios/ajuste-masivo')
        .send({ filtro: { productoIds: [ids.cable] }, objetivo: 'PRECIO', porcentaje: '-10', listaId: ids.lista_MAYOR })
        .expect(201);
      const d = (await gerente.get(`/productos/${ids.cable}`).expect(200)).body;
      expect(d.precios.find((p: { lista: { codigo: string } }) => p.lista.codigo === 'MAYOR').precioUsd).toBe('0.8550');
      expect(d.precios.find((p: { lista: { codigo: string } }) => p.lista.codigo === 'PUBLICO').precioUsd).toBe('1.4300');
    });

    it('exige al menos un filtro y rol de gerencia', async () => {
      await gerente.post('/precios/ajuste-masivo').send({ filtro: {}, objetivo: 'COSTO', porcentaje: '5' }).expect(400);
      await almacen
        .post('/precios/ajuste-masivo')
        .send({ filtro: { marcaId: ids.marca }, objetivo: 'COSTO', porcentaje: '5' })
        .expect(403);
    });
  });

  describe('proveedores', () => {
    it('valida y normaliza el RIF', async () => {
      await almacen.post('/proveedores').send({ rif: 'J-07013380-4', razonSocial: 'Mal RIF' }).expect(400);
      const p = (
        await almacen.post('/proveedores').send({ rif: 'j070133805', razonSocial: 'Distribuidora Ejemplo, C.A.' }).expect(201)
      ).body;
      expect(p.rif).toBe('J-07013380-5');
      ids.proveedor = p.id;
      await almacen.post('/proveedores').send({ rif: 'J-07013380-5', razonSocial: 'Duplicado' }).expect(409);
      const busqueda = (await almacen.get('/proveedores').query({ q: 'distribuidora' }).expect(200)).body;
      expect(busqueda.total).toBe(1);
      await cajero.get('/proveedores').expect(403);
    });
  });

  describe('importación de planillas', () => {
    const csv = [
      'Código;Descripción;Categoría;Marca;Unidad;Costo USD;IVA;Código de barras;Proveedor RIF;Código proveedor;Margen Publico;Precio Mayor',
      'CLV-2;Clavo de acero 2";Ferretería > Clavos;Acme;KG;2,50;GENERAL;7591111111111|7591111111112;J-07013380-5;AC-2;40;',
      'CAB-12;;;;;1,20;;;;;;',
      'MAL-1;Producto con unidad inexistente;;;XYZ;1;;;;;;',
      'MAL-2;Producto con barras ajeno;;;;1;;7590001112223;;;;',
      'PIN-1;Pintura caucho blanco galón;Pinturas;Acme;GAL;12;EXENTO;;;;;15',
    ].join('\n');

    it('la simulación informa errores sin guardar nada', async () => {
      const r = (
        await gerente
          .post('/productos/importacion')
          .query({ simular: 'true' })
          .attach('archivo', Buffer.from(csv), 'productos.csv')
          .expect(201)
      ).body;
      expect(r).toMatchObject({
        simulado: true,
        filasLeidas: 5,
        creados: 2,
        actualizados: 1,
        marcasCreadas: 1,
        categoriasCreadas: 3,
      });
      expect(r.errores.map((e: { fila: number }) => e.fila)).toEqual([4, 5]);
      await gerente.get('/productos/por-codigo/CLV-2').expect(404);
    });

    it('importa las filas válidas', async () => {
      const r = (await gerente.post('/productos/importacion').attach('archivo', Buffer.from(csv), 'productos.csv').expect(201))
        .body;
      expect(r).toMatchObject({ simulado: false, creados: 2, actualizados: 1 });

      const clavo = (await gerente.get('/productos/por-codigo/7591111111112').expect(200)).body.producto;
      expect(clavo).toMatchObject({ codigo: 'CLV-2', costoUsd: '2.5000', unidadBase: { codigo: 'KG' } });
      expect(clavo.precios.find((p: { lista: { codigo: string } }) => p.lista.codigo === 'PUBLICO')).toMatchObject({
        margen: '40.0000',
        precioUsd: '3.5000',
      });
      expect(clavo.proveedores[0]).toMatchObject({ codigoProveedor: 'AC-2', costoUsd: '2.5000' });

      const pintura = (await gerente.get('/productos/por-codigo/PIN-1').expect(200)).body.producto;
      expect(pintura.alicuotaIva).toBe('EXENTO');
      expect(pintura.precios.find((p: { lista: { codigo: string } }) => p.lista.codigo === 'MAYOR')).toMatchObject({
        modo: 'FIJO',
        precioUsd: '15.0000',
      });

      const cable = (await gerente.get(`/productos/${ids.cable}`).expect(200)).body;
      expect(cable.costoUsd).toBe('1.2000');
      expect(cable.descripcion).toBe('Cable THW calibre 12 AWG');
    });

    it('entrega la plantilla en Excel', async () => {
      const r = await gerente.get('/productos/importacion/plantilla').buffer(true).expect(200);
      expect(r.headers['content-type']).toContain('spreadsheetml');
      await cajero.get('/productos/importacion/plantilla').expect(403);
    });
  });

  describe('configuración', () => {
    it('el administrador cambia el redondeo y se refleja en los precios en Bs', async () => {
      await gerente
        .put('/configuracion')
        .send({ redondeoBs: { multiplo: '10', modo: 'ARRIBA' } })
        .expect(403);
      await admin
        .put('/configuracion')
        .send({ empresa: { rif: 'J-1' } })
        .expect(400);
      await admin
        .put('/configuracion')
        .send({ redondeoBs: { multiplo: '10', modo: 'ARRIBA' } })
        .expect(200);
      const d = (await cajero.get(`/productos/${ids.cable}`).expect(200)).body;
      expect(Number(d.precios[0].precioBsConIva) % 10).toBe(0);
      await admin
        .put('/configuracion')
        .send({ redondeoBs: { multiplo: '0.01', modo: 'CERCANO' } })
        .expect(200);
    });
  });
});
