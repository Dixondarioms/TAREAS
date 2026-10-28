import { readFileSync } from 'fs';
import { join } from 'path';
import { interpretarPaginaBcv } from './bcv.cliente';

describe('interpretarPaginaBcv', () => {
  const html = readFileSync(join(__dirname, '__fixtures__', 'bcv.html'), 'utf8');

  it('extrae fecha valor y tasas con coma decimal y separador de miles', () => {
    expect(interpretarPaginaBcv(html)).toEqual({
      fechaValor: '2026-10-29',
      tasas: { USD: '215.47290000', EUR: '1234.12345678' },
    });
  });

  it('falla si la página cambió y no trae la tasa del dólar', () => {
    expect(() => interpretarPaginaBcv(html.replace('id="dolar"', 'id="otro"'))).toThrow(/dólar/);
  });

  it('falla si no hay fecha valor', () => {
    expect(() => interpretarPaginaBcv(html.replace('Fecha Valor', 'Fecha'))).toThrow(/Fecha Valor/);
  });
});
