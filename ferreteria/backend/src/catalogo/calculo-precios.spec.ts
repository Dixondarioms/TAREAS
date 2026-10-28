import { PARAMETROS_POR_DEFECTO } from '../configuracion/configuracion.service';
import { calcularVistaPrecio, ContextoPrecios } from './calculo-precios';
import { AlicuotaIva } from './entidades/producto.entity';

const ctx: ContextoPrecios = {
  tasaUsd: '215.47290000',
  alicuotas: PARAMETROS_POR_DEFECTO.alicuotasIva,
  redondeoBs: { multiplo: '0.01', modo: 'CERCANO' },
};

describe('calcularVistaPrecio', () => {
  it('calcula USD y Bs con IVA general', () => {
    expect(calcularVistaPrecio('1.2500', AlicuotaIva.GENERAL, ctx)).toEqual({
      precioUsd: '1.2500',
      precioUsdConIva: '1.45',
      precioBs: '269.34',
      precioBsConIva: '312.43',
    });
  });

  it('respeta productos exentos y presentaciones', () => {
    const v = calcularVistaPrecio('0.0850', AlicuotaIva.EXENTO, ctx, '100');
    expect(v.precioUsd).toBe('8.5000');
    expect(v.precioUsdConIva).toBe('8.50');
    expect(v.precioBsConIva).toBe(v.precioBs);
  });

  it('aplica el redondeo configurado al precio en Bs', () => {
    const v = calcularVistaPrecio('1.2500', AlicuotaIva.GENERAL, { ...ctx, redondeoBs: { multiplo: '5', modo: 'ARRIBA' } });
    expect(v.precioBsConIva).toBe('315.00');
  });

  it('sin tasa no inventa precios en Bs', () => {
    const v = calcularVistaPrecio('3', AlicuotaIva.REDUCIDA, { ...ctx, tasaUsd: null });
    expect(v).toMatchObject({ precioUsdConIva: '3.24', precioBs: null, precioBsConIva: null });
  });
});
