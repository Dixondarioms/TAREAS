const formatos = new Map<string, Intl.NumberFormat>();

function formateador(decimales: number) {
  const clave = String(decimales);
  let f = formatos.get(clave);
  if (!f) {
    f = new Intl.NumberFormat('es-VE', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
    formatos.set(clave, f);
  }
  return f;
}

/** Formato venezolano: 1.234,56. Recibe cadenas decimales de la API. */
export function numero(valor: string | number | null | undefined, decimales = 2): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  const n = Number(valor);
  return Number.isFinite(n) ? formateador(decimales).format(n) : '—';
}

export const bs = (valor: string | null | undefined) => (valor == null ? '—' : `Bs ${numero(valor, 2)}`);

/** Precios en divisa: muestra 2 decimales, o 4 si el monto es de céntimos (tornillería). */
export function usd(valor: string | null | undefined): string {
  if (valor == null) return '—';
  const n = Number(valor);
  const decimales = n !== 0 && Math.abs(n) < 0.1 ? 4 : 2;
  return `$ ${numero(valor, decimales)}`;
}

export const porcentaje = (valor: string | null | undefined) => (valor == null ? '—' : `${numero(valor, 2)} %`);

export function fecha(iso: string | null | undefined): string {
  if (!iso) return '—';
  // Las fechas "AAAA-MM-DD" se muestran sin conversión de zona horaria.
  const soloFecha = /^\d{4}-\d{2}-\d{2}$/.exec(iso);
  if (soloFecha) {
    const [a, m, d] = iso.split('-');
    return `${d}/${m}/${a}`;
  }
  return new Date(iso).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' });
}

export const NOMBRE_ROL: Record<string, string> = {
  ADMIN: 'Administrador',
  GERENTE: 'Gerente',
  ALMACEN: 'Almacén',
  CAJERO: 'Cajero',
};

export const NOMBRE_IVA: Record<string, string> = {
  GENERAL: 'General',
  REDUCIDA: 'Reducida',
  EXENTO: 'Exento',
};

/** "100.000000" → "100", "0.0300" → "0.03" (para mostrar en campos editables). */
export function sinCeros(valor: string | null | undefined): string {
  if (valor == null || valor === '') return '';
  return valor.includes('.') ? valor.replace(/0+$/, '').replace(/\.$/, '') : valor;
}

/** Convierte "1.234,56" o "1234.56" escrito por el usuario a "1234.56" para la API. */
export function aDecimalApi(texto: string): string {
  let t = texto.trim().replace(/\s/g, '');
  if (t.includes(',') && t.includes('.')) {
    t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else {
    t = t.replace(',', '.');
  }
  return t;
}
