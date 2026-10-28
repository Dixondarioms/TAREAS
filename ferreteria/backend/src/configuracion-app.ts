/** Configuración leída de variables de entorno (ver .env.example). */
export interface ConfiguracionApp {
  puerto: number;
  produccion: boolean;
  bd: { host: string; puerto: number; usuario: string; clave: string; nombre: string };
  jwt: { secreto: string; duracion: string };
  admin: { usuario: string; claveInicial?: string };
  bcv: { url: string; actualizacionAutomatica: boolean };
}

function requerida(nombre: string, valor: string | undefined): string {
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre}`);
  return valor;
}

export function leerConfiguracion(env: NodeJS.ProcessEnv = process.env): ConfiguracionApp {
  const produccion = env.NODE_ENV === 'production';
  const secreto = produccion
    ? requerida('JWT_SECRETO', env.JWT_SECRETO)
    : (env.JWT_SECRETO ?? 'secreto-solo-para-desarrollo-local-0000');
  if (secreto.length < 32) throw new Error('JWT_SECRETO debe tener al menos 32 caracteres');
  return {
    puerto: Number(env.PUERTO ?? 3000),
    produccion,
    bd: {
      host: env.DB_HOST ?? 'localhost',
      puerto: Number(env.DB_PUERTO ?? 5432),
      usuario: env.DB_USUARIO ?? 'ferreteria',
      clave: produccion ? requerida('DB_CLAVE', env.DB_CLAVE) : (env.DB_CLAVE ?? 'ferreteria'),
      nombre: env.DB_NOMBRE ?? 'ferreteria',
    },
    jwt: { secreto, duracion: env.JWT_DURACION ?? '12h' },
    admin: { usuario: (env.ADMIN_USUARIO ?? 'admin').toLowerCase(), claveInicial: env.ADMIN_CLAVE_INICIAL || undefined },
    bcv: {
      url: env.BCV_URL ?? 'https://www.bcv.org.ve/',
      actualizacionAutomatica: (env.BCV_ACTUALIZACION_AUTOMATICA ?? 'true') !== 'false',
    },
  };
}
