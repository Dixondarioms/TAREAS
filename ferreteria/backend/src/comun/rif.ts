/**
 * Validación del Registro de Información Fiscal (RIF) venezolano y de cédulas.
 *
 * Formatos aceptados (con o sin guiones, puntos o espacios):
 *   J-12345678-9, G200003030, V-12345678 (cédula, sin dígito verificador)
 *
 * El dígito verificador se calcula con el módulo 11 que usa el SENIAT:
 * valor de la letra (V=1, E=2, J=3, P=4, G=5) y pesos 4,3,2,7,6,5,4,3,2.
 * Para la letra C (consejos comunales) solo se valida el formato.
 */
export type TipoRif = 'V' | 'E' | 'J' | 'P' | 'G' | 'C';

const VALOR_LETRA: Partial<Record<TipoRif, number>> = { V: 1, E: 2, J: 3, P: 4, G: 5 };
const PESOS = [4, 3, 2, 7, 6, 5, 4, 3, 2];

export interface ResultadoRif {
  valido: boolean;
  /** Forma canónica: "J-12345678-9" o "V-12345678" para cédulas. */
  normalizado?: string;
  tipo?: TipoRif;
  esCedula?: boolean;
  error?: string;
}

export function calcularDigitoVerificador(tipo: TipoRif, ochoDigitos: string): number | null {
  const valorLetra = VALOR_LETRA[tipo];
  if (valorLetra === undefined || !/^\d{8}$/.test(ochoDigitos)) return null;
  const cifras = [valorLetra, ...ochoDigitos.split('').map(Number)];
  const suma = cifras.reduce((acc, cifra, i) => acc + cifra * PESOS[i], 0);
  const digito = 11 - (suma % 11);
  return digito >= 10 ? 0 : digito;
}

export function validarRif(entrada: string | null | undefined): ResultadoRif {
  if (!entrada) return { valido: false, error: 'El RIF es obligatorio' };
  const limpio = entrada.toUpperCase().replace(/[\s.\-_/]/g, '');
  const coincidencia = /^([VEJPGC])(\d{1,9})$/.exec(limpio);
  if (!coincidencia) {
    return { valido: false, error: 'Formato inválido. Ejemplos: J-12345678-9, V-12345678' };
  }
  const tipo = coincidencia[1] as TipoRif;
  const numeros = coincidencia[2];

  // Personas naturales pueden identificarse solo con su cédula (hasta 8 dígitos).
  if ((tipo === 'V' || tipo === 'E') && numeros.length <= 8) {
    if (Number(numeros) === 0) return { valido: false, error: 'Cédula inválida' };
    return { valido: true, tipo, esCedula: true, normalizado: `${tipo}-${numeros}` };
  }

  if (numeros.length !== 9) {
    return { valido: false, error: 'El RIF debe tener 8 dígitos más el dígito verificador' };
  }
  const cuerpo = numeros.slice(0, 8);
  const digito = Number(numeros[8]);
  const esperado = calcularDigitoVerificador(tipo, cuerpo);
  if (esperado !== null && esperado !== digito) {
    return { valido: false, error: 'El dígito verificador del RIF no es correcto' };
  }
  return { valido: true, tipo, esCedula: false, normalizado: `${tipo}-${cuerpo}-${digito}` };
}
