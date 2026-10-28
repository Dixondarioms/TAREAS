import { Injectable, Logger } from '@nestjs/common';
import { X509Certificate } from 'crypto';
import { get as obtenerHttp } from 'http';
import { get as obtenerHttps } from 'https';
import * as tls from 'tls';
import { dec } from '../comun/dinero';
import { Moneda } from './tasa-cambio.entity';

export interface TasasPublicadas {
  fechaValor: string;
  tasas: Partial<Record<Moneda, string>>;
}

const ID_POR_MONEDA: Record<Moneda, string> = { [Moneda.USD]: 'dolar', [Moneda.EUR]: 'euro' };

const TIEMPO_MAXIMO_MS = 20_000;
const TAMANO_MAXIMO_PAGINA = 5 * 1024 * 1024;
const TAMANO_MAXIMO_CERTIFICADO = 64 * 1024;
const AGENTE = 'Mozilla/5.0 (Sistema Ferreteria)';

/** Errores de TLS que indican que el servidor no envió la cadena intermedia. */
const ERRORES_CADENA_INCOMPLETA = new Set(['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY']);

const MENSAJES_POR_CODIGO: Record<string, string> = {
  ENOTFOUND: 'no se encontró el servidor (¿hay internet?)',
  EAI_AGAIN: 'no se pudo resolver el nombre del servidor (¿hay internet?)',
  ECONNREFUSED: 'el servidor rechazó la conexión',
  ECONNRESET: 'la conexión se cortó',
  ETIMEDOUT: 'el servidor no respondió a tiempo',
  CERT_HAS_EXPIRED: 'el certificado del sitio está vencido',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'el certificado del sitio llegó sin su cadena intermedia',
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY: 'el certificado del sitio llegó sin su cadena intermedia',
  UNABLE_TO_GET_ISSUER_CERT: 'el certificado del sitio no es de confianza',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'el certificado del sitio no es de confianza',
  SELF_SIGNED_CERT_IN_CHAIN: 'el certificado del sitio no es de confianza',
  ERR_TLS_CERT_ALTNAME_INVALID: 'el certificado no corresponde al sitio',
};

/** Código del error o de su causa (fetch y los sockets anidan el error real). */
export function codigoDeError(e: unknown): string | undefined {
  for (let actual = e as { code?: unknown; cause?: unknown } | undefined, i = 0; actual && i < 5; i++) {
    if (typeof actual.code === 'string') return actual.code;
    actual = actual.cause as typeof actual;
  }
  return undefined;
}

/** Mensaje en español que explica por qué falló la consulta, con el código técnico para soporte. */
export function describirError(e: unknown): string {
  const codigo = codigoDeError(e);
  if ((e as Error)?.name === 'TimeoutError' || codigo === 'ABORT_ERR') return 'el servidor no respondió a tiempo';
  if (!codigo) return (e as Error)?.message ?? String(e);
  const explicacion = MENSAJES_POR_CODIGO[codigo];
  return explicacion ? `${explicacion} (${codigo})` : `${(e as Error).message} (${codigo})`;
}

/**
 * Extrae las tasas oficiales del HTML de la página principal del BCV.
 * El BCV publica cifras con coma decimal ("36,51270000") y una "Fecha Valor"
 * con atributo content="AAAA-MM-DDT00:00:00-04:00". La cifra va en un
 * <strong>, con o sin atributos (desde 2026: <strong class="strong-tb">).
 */
export function interpretarPaginaBcv(html: string): TasasPublicadas {
  const fecha = /Fecha\s+Valor:[\s\S]{0,300}?content="(\d{4}-\d{2}-\d{2})/i.exec(html);
  if (!fecha) throw new Error('No se encontró la "Fecha Valor" en la página del BCV');

  const tasas: Partial<Record<Moneda, string>> = {};
  for (const moneda of Object.values(Moneda)) {
    const bloque = new RegExp(
      `id="${ID_POR_MONEDA[moneda]}"[\\s\\S]{0,1500}?<strong(?:\\s[^>]*)?>\\s*([\\d.,]+)\\s*</strong>`,
      'i',
    ).exec(html);
    if (!bloque) continue;
    // "1.234,56789" → "1234.56789"
    const normalizado = bloque[1].replace(/\./g, '').replace(',', '.');
    const valor = dec(normalizado);
    if (valor.isFinite() && valor.gt(0)) tasas[moneda] = valor.toFixed(8);
  }
  if (!tasas[Moneda.USD]) throw new Error('No se encontró la tasa del dólar en la página del BCV');
  return { fechaValor: fecha[1], tasas };
}

function descargar(
  url: string,
  ca: string[] | undefined,
  limite: number,
): Promise<{ estado: number; cuerpo: Buffer; destino?: string }> {
  return new Promise((resolver, rechazar) => {
    const opciones = { headers: { 'User-Agent': AGENTE }, timeout: TIEMPO_MAXIMO_MS, ...(ca ? { ca } : {}) };
    const solicitud = (url.startsWith('https:') ? obtenerHttps : obtenerHttp)(url, opciones, (respuesta) => {
      const partes: Buffer[] = [];
      let total = 0;
      respuesta.on('data', (parte: Buffer) => {
        total += parte.length;
        if (total > limite) solicitud.destroy(new Error('La respuesta es demasiado grande'));
        else partes.push(parte);
      });
      respuesta.on('end', () =>
        resolver({ estado: respuesta.statusCode ?? 0, cuerpo: Buffer.concat(partes), destino: respuesta.headers.location }),
      );
      respuesta.on('error', rechazar);
    });
    solicitud.on('timeout', () => solicitud.destroy(Object.assign(new Error('Tiempo agotado'), { code: 'ETIMEDOUT' })));
    solicitud.on('error', rechazar);
  });
}

/** Certificado que presenta el servidor. Solo se lee; la conexión se cierra sin enviar datos. */
function leerCertificadoDelServidor(url: string): Promise<tls.DetailedPeerCertificate> {
  const { hostname, port } = new URL(url);
  return new Promise((resolver, rechazar) => {
    const socket = tls.connect(
      { host: hostname, port: Number(port) || 443, servername: hostname, rejectUnauthorized: false, timeout: TIEMPO_MAXIMO_MS },
      () => {
        const certificado = socket.getPeerCertificate(true);
        socket.destroy();
        resolver(certificado);
      },
    );
    socket.on('timeout', () => socket.destroy(Object.assign(new Error('Tiempo agotado'), { code: 'ETIMEDOUT' })));
    socket.on('error', rechazar);
  });
}

@Injectable()
export class ClienteBcv {
  private readonly log = new Logger(ClienteBcv.name);

  /** Autoridades raíz de confianza. Por defecto, las de Node más las de NODE_EXTRA_CA_CERTS. */
  raices: string[] = typeof tls.getCACertificates === 'function' ? tls.getCACertificates('default') : [...tls.rootCertificates];

  /** Certificados intermedios obtenidos de los propios certificados del sitio (en memoria). */
  private readonly intermedios: string[] = [];

  /**
   * El servidor del BCV a veces envía su certificado sin la cadena intermedia.
   * Los navegadores la completan descargando el intermedio desde la dirección
   * «CA Issuers» del propio certificado; aquí se hace lo mismo. El intermedio
   * solo se acepta si firmó el certificado del sitio y, en la consulta real,
   * la cadena completa debe llegar a una autoridad raíz de confianza: nunca se
   * desactiva la verificación TLS.
   */
  async consultar(url: string): Promise<TasasPublicadas> {
    let html: string;
    try {
      html = await this.pagina(url);
    } catch (e) {
      if (!url.startsWith('https:') || !ERRORES_CADENA_INCOMPLETA.has(codigoDeError(e) ?? '')) throw new Error(describirError(e));
      this.log.warn(
        'El BCV envió su certificado sin la cadena intermedia; se completa desde la dirección indicada en el certificado.',
      );
      try {
        await this.completarCadena(url);
        html = await this.pagina(url);
      } catch (e2) {
        throw new Error(describirError(e2));
      }
    }
    const resultado = interpretarPaginaBcv(html);
    this.log.log(`Tasas BCV obtenidas para ${resultado.fechaValor}: ${JSON.stringify(resultado.tasas)}`);
    return resultado;
  }

  private async pagina(url: string, redirecciones = 2): Promise<string> {
    const ca = this.intermedios.length ? [...this.raices, ...this.intermedios] : this.raices;
    const r = await descargar(url, ca, TAMANO_MAXIMO_PAGINA);
    if (r.estado >= 300 && r.estado < 400 && r.destino && redirecciones > 0) {
      return this.pagina(new URL(r.destino, url).toString(), redirecciones - 1);
    }
    if (r.estado !== 200) throw new Error(`El BCV respondió HTTP ${r.estado}`);
    return r.cuerpo.toString('utf8');
  }

  private async completarCadena(url: string): Promise<void> {
    const certificado = await leerCertificadoDelServidor(url);
    const hoja = new X509Certificate(certificado.raw);
    const direccion = certificado.infoAccess?.['CA Issuers - URI']?.find((u) => /^https?:\/\//i.test(u));
    if (!direccion)
      throw Object.assign(new Error('El certificado no indica dónde obtener el intermedio'), { cause: certificado });

    const r = await descargar(direccion, this.raices, TAMANO_MAXIMO_CERTIFICADO);
    if (r.estado !== 200) throw new Error(`No se pudo descargar el certificado intermedio (HTTP ${r.estado})`);
    const intermedio = new X509Certificate(r.cuerpo);
    if (!intermedio.ca || !hoja.checkIssued(intermedio) || !hoja.verify(intermedio.publicKey)) {
      throw new Error('El certificado intermedio descargado no corresponde al del sitio');
    }
    const pem = intermedio.toString();
    if (!this.intermedios.includes(pem)) this.intermedios.push(pem);
    this.log.log(`Certificado intermedio agregado: ${intermedio.subject.replace(/\n/g, ', ')}`);
  }
}
