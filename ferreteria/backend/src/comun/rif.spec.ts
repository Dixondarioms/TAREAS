import { calcularDigitoVerificador, validarRif } from './rif';

describe('validarRif', () => {
  it('acepta RIF reales con dígito verificador correcto', () => {
    expect(validarRif('J-00002961-0')).toMatchObject({ valido: true, normalizado: 'J-00002961-0' });
    expect(validarRif('j070133805')).toMatchObject({ valido: true, normalizado: 'J-07013380-5' });
    expect(validarRif('G-20000303-0')).toMatchObject({ valido: true, tipo: 'G' });
  });

  it('rechaza dígito verificador incorrecto', () => {
    expect(validarRif('J-07013380-4')).toMatchObject({ valido: false });
  });

  it('acepta cédulas sin dígito verificador', () => {
    expect(validarRif('v 12.345.678')).toMatchObject({ valido: true, esCedula: true, normalizado: 'V-12345678' });
    expect(validarRif('E-81234567')).toMatchObject({ valido: true, esCedula: true });
  });

  it('rechaza formatos inválidos', () => {
    expect(validarRif('')).toMatchObject({ valido: false });
    expect(validarRif('X-12345678-9')).toMatchObject({ valido: false });
    expect(validarRif('J-1234')).toMatchObject({ valido: false });
    expect(validarRif('V-0')).toMatchObject({ valido: false });
  });

  it('solo valida formato para consejos comunales (C)', () => {
    expect(validarRif('C-12345678-1')).toMatchObject({ valido: true, tipo: 'C' });
    expect(calcularDigitoVerificador('C', '12345678')).toBeNull();
  });
});
