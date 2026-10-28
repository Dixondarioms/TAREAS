import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { restablecerAdministrador } from '../src/restablecer-admin';
import { api, CLAVE_ADMIN, crearAppDePrueba, iniciarSesion } from './utilidades';

describe('Restablecer la clave del administrador (integración)', () => {
  let app: INestApplication<App>;
  let fuente: DataSource;

  beforeAll(async () => {
    ({ app } = await crearAppDePrueba());
    fuente = app.get(DataSource);
    const admin = api(app, await iniciarSesion(app, 'admin', CLAVE_ADMIN));
    await admin.post('/usuarios').send({ usuario: 'cajero', nombre: 'Cajero', clave: 'Clave-12345', rol: 'CAJERO' }).expect(201);
  });

  afterAll(async () => {
    await app?.close();
  });

  const login = (usuario: string, clave: string) => request(app.getHttpServer()).post('/api/auth/login').send({ usuario, clave });

  it('genera una clave nueva legible y la anterior deja de funcionar', async () => {
    const clave = await restablecerAdministrador(fuente, 'ADMIN');
    expect(clave).toMatch(/^[A-HJKMNP-Za-hjkmnp-z2-9]{12}$/);
    await login('admin', CLAVE_ADMIN).expect(401);
    await login('admin', clave).expect(200);
  });

  it('reactiva al administrador si estaba desactivado', async () => {
    await fuente.query(`UPDATE usuarios SET activo = false WHERE usuario = 'admin'`);
    const clave = await restablecerAdministrador(fuente, 'admin');
    await login('admin', clave).expect(200);
  });

  it('no restablece usuarios que no son administradores ni usuarios inexistentes', async () => {
    await expect(restablecerAdministrador(fuente, 'cajero')).rejects.toThrow('no es administrador');
    await expect(restablecerAdministrador(fuente, 'nadie')).rejects.toThrow('No existe el usuario "nadie"');
    await login('cajero', 'Clave-12345').expect(200);
  });
});
