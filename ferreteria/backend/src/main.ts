import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { leerConfiguracion } from './configuracion-app';
import { configurarApp } from './configurar-app';

async function iniciar() {
  process.env.TZ = 'America/Caracas';
  const config = leerConfiguracion();
  const app = await NestFactory.create(AppModule);
  configurarApp(app);
  app.enableShutdownHooks();
  await app.listen(config.puerto, '0.0.0.0');
  new Logger('Inicio').log(`API escuchando en el puerto ${config.puerto} (documentación en /api/docs)`);
}

void iniciar();
