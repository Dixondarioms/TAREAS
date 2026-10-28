import {
  aTexto,
  conIva,
  convertirABs,
  esDecimalValido,
  margenDesdePrecio,
  precioDesdeMargen,
  redondearAMultiplo,
} from './dinero';

describe('dinero', () => {
  it('no acumula errores de coma flotante', () => {
    expect(aTexto(conIva('0.1', '16').plus('0.2'), 4)).toBe('0.3160');
    expect(aTexto(convertirABs('1.10', '36.51270000'), 2)).toBe('40.16');
  });

  it('calcula precio desde margen y margen desde precio', () => {
    expect(aTexto(precioDesdeMargen('10', '30'), 4)).toBe('13.0000');
    expect(aTexto(margenDesdePrecio('10', '13')!, 2)).toBe('30.00');
    expect(margenDesdePrecio('0', '13')).toBeNull();
  });

  it('redondea a múltiplos', () => {
    expect(redondearAMultiplo('123.24', '0.50').toFixed(2)).toBe('123.00');
    expect(redondearAMultiplo('123.25', '0.50').toFixed(2)).toBe('123.50');
    expect(redondearAMultiplo('123.01', '0.50', 'ARRIBA').toFixed(2)).toBe('123.50');
    expect(redondearAMultiplo('1234.5', '10').toFixed(0)).toBe('1230');
    expect(() => redondearAMultiplo('1', '0')).toThrow();
  });

  it('valida cadenas decimales', () => {
    expect(esDecimalValido('12.50')).toBe(true);
    expect(esDecimalValido('abc')).toBe(false);
    expect(esDecimalValido('Infinity')).toBe(false);
    expect(esDecimalValido(undefined)).toBe(false);
  });
});
