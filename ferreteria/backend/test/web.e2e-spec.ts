import { INestApplication } from '@nestjs/common';
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import { App } from 'supertest/types';
import { crearAppDePrueba } from './utilidades';

/** Instalación de Windows: la API sirve también la aplicación web (FRONTEND_DIR). */
describe('Aplicación web servida por la API', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'web-'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>La Casa del Inyector</title>');
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'assets', 'app-123.js'), 'console.log(1)');
    process.env.FRONTEND_DIR = dir;
    ({ app } = await crearAppDePrueba());
  });

  afterAll(async () => {
    delete process.env.FRONTEND_DIR;
    await app?.close();
  });

  it('entrega index.html en la raíz y en rutas de la aplicación', async () => {
    for (const ruta of ['/', '/productos/5', '/tasas']) {
      const r = await request(app.getHttpServer()).get(ruta).expect(200);
      expect(r.text).toContain('La Casa del Inyector');
      expect(r.headers['cache-control']).toBe('no-cache');
    }
  });

  it('entrega los archivos estáticos con caché larga', async () => {
    const r = await request(app.getHttpServer()).get('/assets/app-123.js').expect(200);
    expect(r.headers['cache-control']).toContain('immutable');
  });

  it('no interfiere con la API', async () => {
    const salud = await request(app.getHttpServer()).get('/api/salud').expect(200);
    expect(salud.body.estado).toBe('ok');
    const r = await request(app.getHttpServer()).get('/api/no-existe').expect(404);
    expect(r.headers['content-type']).toContain('json');
  });
});
