import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { aplicarPorcentaje, aTexto, DECIMALES_USD } from '../comun/dinero';
import { UsuarioSesion } from '../comun/decoradores';
import { AjustePreciosDto } from './dto/ajuste-precios.dto';
import { HistorialCosto } from './entidades/historial-costo.entity';
import { ListaPrecio } from './entidades/lista-precio.entity';
import { ModoPrecio, PrecioProducto } from './entidades/precio-producto.entity';
import { Producto } from './entidades/producto.entity';
import { calcularFilaPrecio } from './productos.service';

const TAMANO_MUESTRA = 50;

export interface FilaVistaPrevia {
  productoId: number;
  codigo: string;
  descripcion: string;
  costoAnterior: string;
  costoNuevo: string;
  precioAnterior: string | null;
  precioNuevo: string | null;
}

/** Ajustes masivos de costos y precios (p. ej. "el proveedor X subió 8 %"). */
@Injectable()
export class PreciosService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async ajusteMasivo(dto: AjustePreciosDto, usuario: UsuarioSesion) {
    const f = dto.filtro;
    if (!f.categoriaId && !f.marcaId && !f.proveedorId && !f.productoIds?.length) {
      throw new BadRequestException('Indique al menos un filtro (categoría, marca, proveedor o productos)');
    }
    if (dto.objetivo === 'COSTO' && dto.listaId) throw new BadRequestException('listaId solo aplica al ajustar precios');

    const ejecutar = async (m: EntityManager) => {
      const ids = await this.idsFiltrados(m, dto);
      const listas = await m.find(ListaPrecio, { order: { orden: 'ASC', id: 'ASC' } });
      const listaMuestra = dto.listaId ? listas.find((l) => l.id === dto.listaId) : listas[0];
      if (dto.listaId && !listaMuestra) throw new BadRequestException('La lista de precios no existe');

      const productos = ids.length
        ? await m.find(Producto, { where: { id: In(ids) }, order: { descripcion: 'ASC' }, lock: { mode: 'pessimistic_write' } })
        : [];
      const precios = ids.length ? await m.find(PrecioProducto, { where: { productoId: In(ids) } }) : [];
      const preciosPorProducto = new Map<number, PrecioProducto[]>();
      for (const pr of precios) preciosPorProducto.set(pr.productoId, [...(preciosPorProducto.get(pr.productoId) ?? []), pr]);

      const muestra: FilaVistaPrevia[] = [];
      for (const producto of productos) {
        const propios = preciosPorProducto.get(producto.id) ?? [];
        const precioMuestraAntes = propios.find((p) => p.listaId === listaMuestra?.id)?.precioUsd ?? null;
        const costoAnterior = producto.costoUsd;

        if (dto.objetivo === 'COSTO') {
          producto.costoUsd = aTexto(aplicarPorcentaje(costoAnterior, dto.porcentaje), DECIMALES_USD);
          for (const pr of propios) {
            Object.assign(
              pr,
              calcularFilaPrecio(
                producto.costoUsd,
                pr.modo === ModoPrecio.MARGEN
                  ? { listaId: pr.listaId, modo: pr.modo, margen: pr.margen ?? '0' }
                  : { listaId: pr.listaId, modo: pr.modo, precioUsd: pr.precioUsd },
              ),
            );
          }
        } else {
          for (const pr of propios.filter((p) => !dto.listaId || p.listaId === dto.listaId)) {
            const nuevoPrecio = aTexto(aplicarPorcentaje(pr.precioUsd, dto.porcentaje), DECIMALES_USD);
            // Se conserva el modo: en MARGEN cambia el margen; en FIJO, el precio.
            const fila = calcularFilaPrecio(producto.costoUsd, {
              listaId: pr.listaId,
              modo: ModoPrecio.FIJO,
              precioUsd: nuevoPrecio,
            });
            Object.assign(pr, { ...fila, modo: pr.modo, margen: fila.margen ?? pr.margen });
          }
        }
        const precioMuestraDespues = propios.find((p) => p.listaId === listaMuestra?.id)?.precioUsd ?? null;

        if (muestra.length < TAMANO_MUESTRA) {
          muestra.push({
            productoId: producto.id,
            codigo: producto.codigo,
            descripcion: producto.descripcion,
            costoAnterior,
            costoNuevo: producto.costoUsd,
            precioAnterior: precioMuestraAntes,
            precioNuevo: precioMuestraDespues,
          });
        }

        if (!dto.simular) {
          if (dto.objetivo === 'COSTO' && costoAnterior !== producto.costoUsd) {
            await m.update(Producto, { id: producto.id }, { costoUsd: producto.costoUsd, costoActualizadoEn: new Date() });
            await m.insert(HistorialCosto, {
              productoId: producto.id,
              costoAnterior,
              costoNuevo: producto.costoUsd,
              motivo: dto.motivo?.trim() || `Ajuste masivo ${dto.porcentaje}%`,
              usuarioId: usuario.id,
            });
          }
          for (const pr of propios) {
            await m.update(PrecioProducto, { id: pr.id }, { modo: pr.modo, margen: pr.margen, precioUsd: pr.precioUsd });
          }
        }
      }
      return {
        simulado: Boolean(dto.simular),
        productosAfectados: productos.length,
        listaMuestra: listaMuestra ? { id: listaMuestra.id, codigo: listaMuestra.codigo, nombre: listaMuestra.nombre } : null,
        muestra,
      };
    };

    return this.ds.transaction(ejecutar);
  }

  private async idsFiltrados(m: EntityManager, dto: AjustePreciosDto): Promise<number[]> {
    const f = dto.filtro;
    const qb = m.getRepository(Producto).createQueryBuilder('p').select('p.id', 'id').where('p.activo = true');
    if (f.productoIds?.length) qb.andWhere('p.id IN (:...ids)', { ids: f.productoIds });
    if (f.marcaId) qb.andWhere('p.marca_id = :marca', { marca: f.marcaId });
    if (f.proveedorId) {
      qb.andWhere('EXISTS (SELECT 1 FROM productos_proveedores pp WHERE pp.producto_id = p.id AND pp.proveedor_id = :prov)', {
        prov: f.proveedorId,
      });
    }
    if (f.categoriaId) {
      qb.andWhere(
        `p.categoria_id IN (WITH RECURSIVE sub AS (SELECT id FROM categorias WHERE id = :cat
           UNION ALL SELECT c.id FROM categorias c JOIN sub ON c.padre_id = sub.id) SELECT id FROM sub)`,
        { cat: f.categoriaId },
      );
    }
    const filas: { id: number }[] = await qb.getRawMany();
    return filas.map((r) => Number(r.id));
  }
}
