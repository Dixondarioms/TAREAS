import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { servirAplicacionWeb } from './servir-web';

/** Configuración común a la aplicación real y a las pruebas de integración. */
export function configurarApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  if (process.env.FRONTEND_DIR) servirAplicacionWeb(app, process.env.FRONTEND_DIR);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const documento = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('API La Casa del Inyector').setVersion('0.1.0').addBearerAuth().build(),
  );
  SwaggerModule.setup('api/docs', app, documento);
}
