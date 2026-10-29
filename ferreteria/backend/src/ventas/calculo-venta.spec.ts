import { AlicuotaIva } from '../catalogo/entidades/producto.entity';
import { calcularVenta, ContextoVenta } from './calculo-venta';
import { MetodoPago } from './metodos-pago';

const ctx: ContextoVenta = { tasa: '888.12', alicuotas: { GENERAL: '16', REDUCIDA: '8', EXENTO: '0' }, cobraIgtf: false };
const bombillo = { precioUsd: '2.08', cantidad: '1', alicuotaIva: AlicuotaIva.GENERAL };

describe('calcularVenta', () => {
  it('convierte a Bs línea por línea y calcula el IVA sobre la base', () => {
    // 2,08 × 888,12 = 1.847,2896 → 1.847,29; IVA 16 % = 295,5664 → 295,57
    const r = calcularVenta([bombillo], [{ metodo: MetodoPago.EFECTIVO_BS, monto: '2142.86' }], ctx);
    expect(r).toMatchObject({
      lineas: [{ precioUsd: '2.0800', precioBs: '1847.29', subtotalBs: '1847.29' }],
      baseGeneralBs: '1847.29',
      ivaGeneralBs: '295.57',
      totalBs: '2142.86',
      igtfBs: '0.00',
      totalPagarBs: '2142.86',
      totalPagarUsd: '2.41',
      faltanteBs: '0.00',
      vueltoBs: '0.00',
    });
  });

  it('separa bases por alícuota', () => {
    const r = calcularVenta(
      [
        { precioUsd: '10', cantidad: '2', alicuotaIva: AlicuotaIva.EXENTO },
        { precioUsd: '1.5', cantidad: '3', alicuotaIva: AlicuotaIva.REDUCIDA },
        { precioUsd: '0.03', cantidad: '100', alicuotaIva: AlicuotaIva.GENERAL },
      ],
      [],
      { ...ctx, tasa: '100' },
    );
    expect(r).toMatchObject({
      baseExentaBs: '2000.00',
      baseReducidaBs: '450.00',
      ivaReducidaBs: '36.00',
      baseGeneralBs: '300.00',
      ivaGeneralBs: '48.00',
      totalBs: '2834.00',
      faltanteBs: '2834.00',
    });
  });

  it('cuadra pagos mixtos en Bs y USD y calcula el vuelto en la moneda elegida', () => {
    const exacto = calcularVenta(
      [bombillo],
      [
        { metodo: MetodoPago.EFECTIVO_USD, monto: '2' },
        { metodo: MetodoPago.PAGO_MOVIL, monto: '366.62' },
      ],
      ctx,
    );
    expect(exacto.pagos.map((p) => p.montoBs)).toEqual(['1776.24', '366.62']);
    expect(exacto).toMatchObject({ pagadoBs: '2142.86', faltanteBs: '0.00', vueltoBs: '0.00' });

    const conVuelto = calcularVenta([bombillo], [{ metodo: MetodoPago.EFECTIVO_USD, monto: '5' }], ctx, MetodoPago.EFECTIVO_USD);
    // 5 × 888,12 = 4.440,60 − 2.142,86 = 2.297,74 Bs = 2,59 USD
    expect(conVuelto).toMatchObject({ vueltoBs: '2297.74', vueltoMonto: '2.59' });
  });

  describe('IGTF (contribuyente especial)', () => {
    const especial = { ...ctx, cobraIgtf: true };

    it('cobra 3 % sobre la parte pagada en divisas', () => {
      const r = calcularVenta(
        [bombillo],
        [
          { metodo: MetodoPago.ZELLE, monto: '1' },
          { metodo: MetodoPago.PUNTO_VENTA, monto: '1381.38' },
        ],
        especial,
      );
      // base = 888,12; IGTF = 26,6436 → 26,64; total a pagar = 2.169,50
      expect(r).toMatchObject({ baseIgtfBs: '888.12', igtfBs: '26.64', totalPagarBs: '2169.50', faltanteBs: '0.00' });
    });

    it('no cobra IGTF sobre pagos en Bs', () => {
      const r = calcularVenta([bombillo], [{ metodo: MetodoPago.PAGO_MOVIL, monto: '2142.86' }], especial);
      expect(r).toMatchObject({ igtfBs: '0.00', totalPagarBs: '2142.86' });
    });

    it('la base nunca supera el total de la factura y descuenta el vuelto entregado en divisas', () => {
      const vueltoBs = calcularVenta(
        [bombillo],
        [{ metodo: MetodoPago.EFECTIVO_USD, monto: '3' }],
        especial,
        MetodoPago.EFECTIVO_BS,
      );
      // 3 × 888,12 = 2.664,36; base = 2.142,86; IGTF = 64,29; vuelto = 2.664,36 − 2.207,15
      expect(vueltoBs).toMatchObject({ baseIgtfBs: '2142.86', igtfBs: '64.29', totalPagarBs: '2207.15', vueltoBs: '457.21' });

      const vueltoUsd = calcularVenta(
        [bombillo],
        [{ metodo: MetodoPago.EFECTIVO_USD, monto: '10' }],
        especial,
        MetodoPago.EFECTIVO_USD,
      );
      expect(vueltoUsd).toMatchObject({ baseIgtfBs: '2142.86', igtfBs: '64.29', totalPagarBs: '2207.15' });
      // 8.881,20 − 2.207,15 = 6.674,05 Bs → 7,51 USD
      expect(vueltoUsd).toMatchObject({ vueltoBs: '6674.05', vueltoMonto: '7.51' });

      const parcial = calcularVenta(
        [bombillo],
        [
          { metodo: MetodoPago.EFECTIVO_USD, monto: '1' },
          { metodo: MetodoPago.EFECTIVO_BS, monto: '2000' },
        ],
        especial,
        MetodoPago.EFECTIVO_USD,
      );
      // Paga 2.888,12 y el vuelto sale en USD: esa parte de la divisa vuelve al cliente y no entra en la base.
      expect(Number(parcial.baseIgtfBs)).toBeLessThan(888.12);
      expect(parcial.faltanteBs).toBe('0.00');
      expect(Number(parcial.vueltoBs) + Number(parcial.totalPagarBs)).toBeCloseTo(2888.12, 2);
    });
  });
});
