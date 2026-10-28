import { aTexto, conIva, convertirABs, dec, DECIMALES_USD, redondear, redondearAMultiplo } from '../comun/dinero';
import { AlicuotasIva, ReglaRedondeoBs } from '../configuracion/configuracion.service';
import { AlicuotaIva } from './entidades/producto.entity';

export interface ContextoPrecios {
  /** Bs por USD vigente; nulo si aún no se ha cargado ninguna tasa. */
  tasaUsd: string | null;
  alicuotas: AlicuotasIva;
  redondeoBs: ReglaRedondeoBs;
}

export interface VistaPrecio {
  /** Precio unitario en USD sin IVA (4 decimales). */
  precioUsd: string;
  /** Precio unitario en USD con IVA (2 decimales). */
  precioUsdConIva: string;
  /** Precio unitario en Bs sin IVA, a la tasa vigente (2 decimales). */
  precioBs: string | null;
  /** Precio unitario en Bs con IVA, redondeado según la configuración (para etiquetas y mostrador). */
  precioBsConIva: string | null;
}

/**
 * Calcula cómo se muestra un precio en ambas monedas.
 * `factor` permite expresarlo por presentación (p. ej. caja de 100 unidades).
 */
export function calcularVistaPrecio(
  precioUsdBase: string,
  alicuota: AlicuotaIva,
  ctx: ContextoPrecios,
  factor: string = '1',
): VistaPrecio {
  const porcentajeIva = ctx.alicuotas[alicuota] ?? '0';
  const precioUsd = dec(precioUsdBase).times(factor);
  const vista: VistaPrecio = {
    precioUsd: aTexto(precioUsd, DECIMALES_USD),
    precioUsdConIva: aTexto(conIva(precioUsd, porcentajeIva), 2),
    precioBs: null,
    precioBsConIva: null,
  };
  if (ctx.tasaUsd) {
    const precioBs = redondear(convertirABs(precioUsd, ctx.tasaUsd), 2);
    vista.precioBs = precioBs.toFixed(2);
    vista.precioBsConIva = redondearAMultiplo(
      conIva(precioBs, porcentajeIva),
      ctx.redondeoBs.multiplo,
      ctx.redondeoBs.modo,
    ).toFixed(2);
  }
  return vista;
}
