import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import request from 'supertest';
import { App } from 'supertest/types';
import { ClienteBcv, TasasPublicadas } from '../src/tasas/bcv.cliente';

export const CLAVE_ADMIN = 'Admin-Prueba-123';

/** BCV simulado: las pruebas nunca salen a internet. */
export class ClienteBcvFalso {
  respuesta: TasasPublicadas = { fechaValor: '2026-10-28', tasas: { USD: '215.47290000', EUR: '250.10000000' } };
  async consultar(): Promise<TasasPublicadas> {
    return this.respuesta;
  }
}

/** Crea la API completa contra una base de datos de pruebas vacía. */
export async function crearAppDePrueba(): Promise<{ app: INestApplication<App>; bcv: ClienteBcvFalso }> {
  process.env.DB_NOMBRE = process.env.DB_NOMBRE_PRUEBAS ?? 'ferreteria_test';
  process.env.ADMIN_CLAVE_INICIAL = CLAVE_ADMIN;
  process.env.BCV_ACTUALIZACION_AUTOMATICA = 'false';

  const cliente = new Client({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PUERTO ?? 5432),
    user: process.env.DB_USUARIO ?? 'ferreteria',
    password: process.env.DB_CLAVE ?? 'ferreteria',
    database: process.env.DB_NOMBRE,
  });
  await cliente.connect();
  await cliente.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await cliente.end();

  // Importaciones diferidas: la configuración se lee de process.env al crear los módulos.
  const { AppModule } = await import('../src/app.module');
  const { configurarApp } = await import('../src/configurar-app');
  const bcv = new ClienteBcvFalso();
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ClienteBcv)
    .useValue(bcv)
    .compile();
  const app = modulo.createNestApplication<INestApplication<App>>({ logger: ['error'] });
  configurarApp(app);
  await app.init();
  return { app, bcv };
}

export async function iniciarSesion(app: INestApplication<App>, usuario: string, clave: string): Promise<string> {
  const r = await request(app.getHttpServer()).post('/api/auth/login').send({ usuario, clave }).expect(200);
  return r.body.token;
}

/** Atajo para peticiones autenticadas. */
export function api(app: INestApplication<App>, token: string) {
  const servidor = app.getHttpServer();
  const conToken = <T extends request.Test>(r: T) => r.set('Authorization', `Bearer ${token}`);
  return {
    get: (url: string) => conToken(request(servidor).get(`/api${url}`)),
    post: (url: string) => conToken(request(servidor).post(`/api${url}`)),
    put: (url: string) => conToken(request(servidor).put(`/api${url}`)),
    delete: (url: string) => conToken(request(servidor).delete(`/api${url}`)),
  };
}
