import ExcelJS from 'exceljs';

export type FilaPlanilla = Record<string, string>;

/** "Código de Barras" → "codigo_de_barras" */
export function normalizarEncabezado(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Acepta números escritos al estilo venezolano o internacional:
 * "1.234,56" → "1234.56", "12,5" → "12.5", "1,234.56" → "1234.56".
 * Devuelve null si el texto no es un número.
 */
export function normalizarNumero(texto: string): string | null {
  let t = texto
    .trim()
    .replace(/\s/g, '')
    .replace(/^\$|\$$/g, '');
  if (!t) return null;
  const ultimaComa = t.lastIndexOf(',');
  const ultimoPunto = t.lastIndexOf('.');
  if (ultimaComa > -1 && ultimoPunto > -1) {
    t = ultimaComa > ultimoPunto ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (ultimaComa > -1) {
    t = t.replace(',', '.');
  }
  return /^-?\d+(\.\d+)?$/.test(t) ? t : null;
}

function textoCelda(valor: ExcelJS.CellValue): string {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'number') return String(valor);
  if (typeof valor === 'string') return valor.trim();
  if (typeof valor === 'boolean') return valor ? 'SI' : 'NO';
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  if (typeof valor === 'object') {
    if ('result' in valor) return textoCelda(valor.result as ExcelJS.CellValue);
    if ('richText' in valor)
      return valor.richText
        .map((r) => r.text)
        .join('')
        .trim();
    if ('text' in valor) return String(valor.text).trim();
  }
  return String(valor).trim();
}

/** Parser CSV mínimo con comillas (RFC 4180, tolerante a comillas sueltas); detecta ";" o "," como separador. */
export function leerCsv(contenido: string): string[][] {
  const texto = contenido.replace(/^﻿/, '');
  const primeraLinea = texto.split(/\r?\n/, 1)[0] ?? '';
  const separador = (primeraLinea.match(/;/g)?.length ?? 0) > (primeraLinea.match(/,/g)?.length ?? 0) ? ';' : ',';
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let entreComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entreComillas) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') {
        entreComillas = false;
      } else {
        campo += c;
      }
    } else if (c === '"' && campo.trim() === '') {
      // Solo una comilla al inicio abre un campo entrecomillado; así 'Clavo 2"' (pulgadas) se lee tal cual.
      entreComillas = true;
      campo = '';
    } else if (c === separador) {
      fila.push(campo.trim());
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo.trim());
      filas.push(fila);
      fila = [];
      campo = '';
    } else {
      campo += c;
    }
  }
  if (campo !== '' || fila.length) {
    fila.push(campo.trim());
    filas.push(fila);
  }
  return filas.filter((f) => f.some((v) => v !== ''));
}

/** Lee la primera hoja de un .xlsx o un .csv y devuelve filas indexadas por encabezado normalizado. */
export async function leerPlanilla(
  nombreArchivo: string,
  contenido: Buffer,
  maxFilas: number,
): Promise<{ filas: FilaPlanilla[]; encabezados: string[] }> {
  let matriz: string[][];
  if (/\.csv$/i.test(nombreArchivo) || /\.txt$/i.test(nombreArchivo)) {
    matriz = leerCsv(contenido.toString('utf8'));
  } else if (/\.xlsx$/i.test(nombreArchivo)) {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(contenido as unknown as ExcelJS.Buffer);
    const hoja = libro.worksheets[0];
    if (!hoja) throw new Error('El archivo no tiene hojas');
    matriz = [];
    hoja.eachRow({ includeEmpty: false }, (row) => {
      const valores: string[] = [];
      for (let col = 1; col <= hoja.columnCount; col++) valores.push(textoCelda(row.getCell(col).value));
      if (valores.some((v) => v !== '')) matriz.push(valores);
    });
  } else {
    throw new Error('Formato no soportado: use .xlsx o .csv');
  }

  if (matriz.length < 2) throw new Error('El archivo no tiene filas de datos');
  if (matriz.length - 1 > maxFilas) throw new Error(`El archivo supera el máximo de ${maxFilas} filas`);
  const encabezados = matriz[0].map(normalizarEncabezado);
  const filas = matriz.slice(1).map((valores) => {
    const fila: FilaPlanilla = {};
    encabezados.forEach((enc, i) => {
      if (enc) fila[enc] = (valores[i] ?? '').trim();
    });
    return fila;
  });
  return { filas, encabezados };
}
