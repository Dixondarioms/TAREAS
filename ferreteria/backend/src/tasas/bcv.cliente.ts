import { Injectable, Logger } from '@nestjs/common';
import { dec } from '../comun/dinero';
import { Moneda } from './tasa-cambio.entity';

export interface TasasPublicadas {
  fechaValor: string;
  tasas: Partial<Record<Moneda, string>>;
}

const ID_POR_MONEDA: Record<Moneda, string> = { [Moneda.USD]: 'dolar', [Moneda.EUR]: 'euro' };

/**
 * Extrae las tasas oficiales del HTML de la página principal del BCV.
 * El BCV publica cifras con coma decimal ("36,51270000") y una "Fecha Valor"
 * con atributo content="AAAA-MM-DDT00:00:00-04:00".
 */
export function interpretarPaginaBcv(html: string): TasasPublicadas {
  const fecha = /Fecha\s+Valor:[\s\S]{0,300}?content="(\d{4}-\d{2}-\d{2})/i.exec(html);
  if (!fecha) throw new Error('No se encontró la "Fecha Valor" en la página del BCV');

  const tasas: Partial<Record<Moneda, string>> = {};
  for (const moneda of Object.values(Moneda)) {
    const bloque = new RegExp(`id="${ID_POR_MONEDA[moneda]}"[\\s\\S]{0,1500}?<strong>\\s*([\\d.,]+)\\s*</strong>`, 'i').exec(
      html,
    );
    if (!bloque) continue;
    // "1.234,56789" → "1234.56789"
    const normalizado = bloque[1].replace(/\./g, '').replace(',', '.');
    const valor = dec(normalizado);
    if (valor.isFinite() && valor.gt(0)) tasas[moneda] = valor.toFixed(8);
  }
  if (!tasas[Moneda.USD]) throw new Error('No se encontró la tasa del dólar en la página del BCV');
  return { fechaValor: fecha[1], tasas };
}

@Injectable()
export class ClienteBcv {
  private readonly log = new Logger(ClienteBcv.name);

  /**
   * Nota: el certificado TLS del BCV a veces no incluye la cadena intermedia.
   * Si la consulta falla con UNABLE_TO_VERIFY_LEAF_SIGNATURE, agregue el
   * certificado intermedio con NODE_EXTRA_CA_CERTS (ver README); nunca se
   * desactiva la verificación TLS.
   */
  async consultar(url: string): Promise<TasasPublicadas> {
    const respuesta = await fetch(url, {
      signal: AbortSignal.timeout(20_000),
      headers: { 'User-Agent': 'Mozilla/5.0 (Sistema Ferreteria)' },
    });
    if (!respuesta.ok) throw new Error(`El BCV respondió HTTP ${respuesta.status}`);
    const resultado = interpretarPaginaBcv(await respuesta.text());
    this.log.log(`Tasas BCV obtenidas para ${resultado.fechaValor}: ${JSON.stringify(resultado.tasas)}`);
    return resultado;
  }
}
