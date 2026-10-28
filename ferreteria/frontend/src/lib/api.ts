const CLAVE_TOKEN = 'ferreteria.token';

export class ErrorApi extends Error {
  constructor(
    message: string,
    readonly estado: number,
  ) {
    super(message);
  }
}

let alExpirarSesion: () => void = () => {};

export function registrarExpiracionSesion(funcion: () => void) {
  alExpirarSesion = funcion;
}

export const token = {
  leer: () => {
    try {
      return localStorage.getItem(CLAVE_TOKEN);
    } catch {
      return null;
    }
  },
  guardar: (valor: string | null) => {
    try {
      if (valor) localStorage.setItem(CLAVE_TOKEN, valor);
      else localStorage.removeItem(CLAVE_TOKEN);
    } catch {
      /* almacenamiento no disponible */
    }
  },
};

type Parametros = Record<string, string | number | boolean | undefined | null>;

function construirUrl(ruta: string, parametros?: Parametros) {
  const url = new URL(`/api${ruta}`, window.location.origin);
  for (const [k, v] of Object.entries(parametros ?? {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  return url.toString();
}

async function solicitar<T>(
  metodo: string,
  ruta: string,
  opciones: { cuerpo?: unknown; parametros?: Parametros } = {},
): Promise<T> {
  const encabezados: Record<string, string> = {};
  const t = token.leer();
  if (t) encabezados.Authorization = `Bearer ${t}`;
  let cuerpo: BodyInit | undefined;
  if (opciones.cuerpo instanceof FormData) {
    cuerpo = opciones.cuerpo;
  } else if (opciones.cuerpo !== undefined) {
    encabezados['Content-Type'] = 'application/json';
    cuerpo = JSON.stringify(opciones.cuerpo);
  }

  let respuesta: Response;
  try {
    respuesta = await fetch(construirUrl(ruta, opciones.parametros), { method: metodo, headers: encabezados, body: cuerpo });
  } catch {
    throw new ErrorApi('No hay conexión con el servidor. Verifique la red local.', 0);
  }

  if (respuesta.status === 401 && ruta !== '/auth/login') {
    token.guardar(null);
    alExpirarSesion();
  }
  if (!respuesta.ok) {
    let mensaje = `Error ${respuesta.status}`;
    try {
      const datos = await respuesta.json();
      mensaje = Array.isArray(datos.message) ? datos.message.join('. ') : (datos.message ?? mensaje);
    } catch {
      /* respuesta sin JSON */
    }
    throw new ErrorApi(mensaje, respuesta.status);
  }
  if (respuesta.status === 204) return undefined as T;
  const tipo = respuesta.headers.get('content-type') ?? '';
  return (tipo.includes('application/json') ? respuesta.json() : respuesta.blob()) as Promise<T>;
}

export const api = {
  get: <T>(ruta: string, parametros?: Parametros) => solicitar<T>('GET', ruta, { parametros }),
  post: <T>(ruta: string, cuerpo?: unknown, parametros?: Parametros) => solicitar<T>('POST', ruta, { cuerpo, parametros }),
  put: <T>(ruta: string, cuerpo?: unknown) => solicitar<T>('PUT', ruta, { cuerpo }),
  delete: <T>(ruta: string) => solicitar<T>('DELETE', ruta),
};

/** Descarga un archivo binario autenticado (p. ej. la plantilla de Excel). */
export async function descargar(ruta: string, nombreArchivo: string) {
  const blob = await api.get<Blob>(ruta);
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(blob);
  enlace.download = nombreArchivo;
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
}
