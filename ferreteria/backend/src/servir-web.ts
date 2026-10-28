import { INestApplication, Logger } from '@nestjs/common';
import express, { NextFunction, Request, Response } from 'express';
import { existsSync } from 'fs';
import { join, resolve } from 'path';

/**
 * Sirve la aplicación web (frontend compilado) desde la misma API.
 * Se usa en la instalación de Windows, donde no hay nginx delante.
 * Las rutas /api siguen yendo a la API; cualquier otra ruta devuelve index.html.
 */
export function servirAplicacionWeb(app: INestApplication, directorio: string): void {
  const raiz = resolve(directorio);
  const indice = join(raiz, 'index.html');
  if (!existsSync(indice)) {
    new Logger('Web').warn(`FRONTEND_DIR=${raiz} no contiene index.html; no se servirá la aplicación web`);
    return;
  }
  app.use(
    express.static(raiz, {
      index: false,
      setHeaders: (res, ruta) => {
        // Los archivos de /assets llevan un hash en el nombre: se pueden guardar en caché.
        res.setHeader(
          'Cache-Control',
          ruta.includes(`${join(raiz, 'assets')}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
      },
    }),
  );
  app.use((req: Request, res: Response, siguiente: NextFunction) => {
    if (req.method !== 'GET' || req.path === '/api' || req.path.startsWith('/api/')) return siguiente();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indice);
  });
}
