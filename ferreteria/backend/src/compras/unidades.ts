import { BadRequestException } from '@nestjs/common';
import { Producto } from '../catalogo/entidades/producto.entity';
import { dec } from '../comun/dinero';

/**
 * Unidad y factor de una línea de compra u orden: la unidad base o la
 * presentación indicada (caja, rollo...). Valida que la cantidad sea entera
 * si la unidad no admite decimales.
 */
export function unidadDeLinea(
  p: Producto,
  presentacionId: number | null | undefined,
  cantidad: string,
): { unidad: string; factor: string } {
  let unidad = p.unidadBase;
  let factor = '1';
  if (presentacionId) {
    const pre = p.presentaciones.find((x) => x.id === presentacionId);
    if (!pre) throw new BadRequestException(`La presentación indicada no pertenece a ${p.codigo}`);
    unidad = pre.unidad;
    factor = pre.factor;
  }
  if (!unidad.permiteDecimales && !dec(cantidad).isInteger()) {
    throw new BadRequestException(`${p.codigo} se maneja por ${unidad.codigo}: la cantidad debe ser un número entero`);
  }
  return { unidad: unidad.codigo, factor };
}
