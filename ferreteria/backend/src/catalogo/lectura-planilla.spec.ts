import { leerCsv, normalizarEncabezado, normalizarNumero } from './lectura-planilla';

describe('lectura de planillas', () => {
  it('normaliza encabezados', () => {
    expect(normalizarEncabezado(' Código de Barras ')).toBe('codigo_de_barras');
    expect(normalizarEncabezado('Costo USD')).toBe('costo_usd');
  });

  it('interpreta números en formato venezolano e internacional', () => {
    expect(normalizarNumero('1.234,56')).toBe('1234.56');
    expect(normalizarNumero('12,5')).toBe('12.5');
    expect(normalizarNumero('1,234.56')).toBe('1234.56');
    expect(normalizarNumero('$ 3.75')).toBe('3.75');
    expect(normalizarNumero('abc')).toBeNull();
    expect(normalizarNumero('')).toBeNull();
  });

  it('lee CSV con ; y comillas', () => {
    const csv = '﻿codigo;descripcion;costo_usd\r\nT-1;"Tornillo ""drywall"" 6x1";0,05\r\n\r\nT-2;Clavo;1,2\n';
    expect(leerCsv(csv)).toEqual([
      ['codigo', 'descripcion', 'costo_usd'],
      ['T-1', 'Tornillo "drywall" 6x1', '0,05'],
      ['T-2', 'Clavo', '1,2'],
    ]);
  });

  it('tolera comillas de pulgadas dentro de campos sin entrecomillar', () => {
    expect(leerCsv('codigo;descripcion\nCLV-2;Clavo de acero 2";x\nTUB;Tubo ½" PVC\n')).toEqual([
      ['codigo', 'descripcion'],
      ['CLV-2', 'Clavo de acero 2"', 'x'],
      ['TUB', 'Tubo ½" PVC'],
    ]);
  });
});
