export const ZONA_HORARIA = 'America/Caracas';

/** Fecha de hoy (YYYY-MM-DD) en hora de Venezuela, sin depender de la zona del servidor. */
export function hoyEnCaracas(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);
}
