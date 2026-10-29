import { readFileSync } from 'fs';
import { createServer as crearServidorHttp, Server as ServidorHttp } from 'http';
import { createServer as crearServidorHttps, Server as ServidorHttps } from 'https';
import { AddressInfo } from 'net';
import { join } from 'path';
import { ClienteBcv, describirError, interpretarPaginaBcv } from './bcv.cliente';

const fixture = (...ruta: string[]) => readFileSync(join(__dirname, '__fixtures__', ...ruta));

describe('interpretarPaginaBcv', () => {
  const html = fixture('bcv.html').toString('utf8');

  it('extrae fecha valor y tasas con coma decimal y separador de miles', () => {
    expect(interpretarPaginaBcv(html)).toEqual({
      fechaValor: '2026-10-29',
      tasas: { USD: '215.47290000', EUR: '1234.12345678' },
    });
  });

  it('lee el formato actual del BCV, con atributos en <strong>', () => {
    expect(interpretarPaginaBcv(fixture('bcv-2026.html').toString('utf8'))).toEqual({
      fechaValor: '2026-10-29',
      tasas: { USD: '888.89090000', EUR: '989.38890515' },
    });
  });

  it('falla si la página cambió y no trae la tasa del dólar', () => {
    expect(() => interpretarPaginaBcv(html.replace('id="dolar"', 'id="otro"'))).toThrow(/dólar/);
  });

  it('falla si no hay fecha valor', () => {
    expect(() => interpretarPaginaBcv(html.replace('Fecha Valor', 'Fecha'))).toThrow(/Fecha Valor/);
  });
});

describe('describirError', () => {
  it('explica el código de la causa que anida fetch', () => {
    const e = new TypeError('fetch failed', { cause: Object.assign(new Error('x'), { code: 'ENOTFOUND' }) });
    expect(describirError(e)).toBe('no se encontró el servidor (¿hay internet?) (ENOTFOUND)');
  });

  it('conserva el mensaje original si no hay código', () => {
    expect(describirError(new Error('El BCV respondió HTTP 503'))).toBe('El BCV respondió HTTP 503');
  });
});

/**
 * Cadena de prueba en __fixtures__/cadena: raíz → intermedio → hoja (localhost).
 * La hoja indica en «CA Issuers» http://127.0.0.1:47613/intermedio.der, igual
 * que el certificado del BCV apunta al de Sectigo.
 */
describe('ClienteBcv con un servidor que no envía la cadena intermedia', () => {
  const PUERTO_INTERMEDIO = 47613;
  const raiz = fixture('cadena', 'raiz.pem').toString('utf8');
  let sitio: ServidorHttps;
  let emisor: ServidorHttp;
  let url: string;
  let certificadoServido: Buffer;

  beforeAll(async () => {
    sitio = crearServidorHttps({ key: fixture('cadena', 'hoja.key'), cert: fixture('cadena', 'hoja.pem') }, (_, res) =>
      res.end(fixture('bcv.html')),
    );
    emisor = crearServidorHttp((_, res) => res.end(certificadoServido));
    await Promise.all([
      new Promise<void>((ok) => sitio.listen(0, '127.0.0.1', ok)),
      new Promise<void>((ok) => emisor.listen(PUERTO_INTERMEDIO, '127.0.0.1', ok)),
    ]);
    url = `https://localhost:${(sitio.address() as AddressInfo).port}/`;
  });

  afterAll(async () => {
    await Promise.all([new Promise((ok) => sitio.close(ok)), new Promise((ok) => emisor.close(ok))]);
  });

  beforeEach(() => {
    certificadoServido = fixture('cadena', 'intermedio.der');
  });

  function cliente(raices = [raiz]): ClienteBcv {
    const c = new ClienteBcv();
    c.raices = raices;
    return c;
  }

  it('descarga el intermedio indicado en el certificado y obtiene las tasas', async () => {
    const c = cliente();
    await expect(c.consultar(url)).resolves.toEqual({
      fechaValor: '2026-10-29',
      tasas: { USD: '215.47290000', EUR: '1234.12345678' },
    });
    // La segunda consulta usa el intermedio guardado, sin volver a descargarlo.
    certificadoServido = Buffer.from('ya no está disponible');
    await expect(c.consultar(url)).resolves.toMatchObject({ fechaValor: '2026-10-29' });
  });

  it('rechaza un intermedio que no firmó el certificado del sitio', async () => {
    certificadoServido = Buffer.from(raiz);
    await expect(cliente().consultar(url)).rejects.toThrow('El certificado intermedio descargado no corresponde al del sitio');
  });

  it('no desactiva la verificación: sin la raíz de confianza la consulta falla', async () => {
    await expect(cliente([]).consultar(url)).rejects.toThrow(/cadena intermedia|no es de confianza/);
  });

  it('informa la causa cuando no hay conexión', async () => {
    await expect(cliente().consultar('https://127.0.0.1:1/')).rejects.toThrow('el servidor rechazó la conexión (ECONNREFUSED)');
  });
});
