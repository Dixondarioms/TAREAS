import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { Producto } from '../catalogo/entidades/producto.entity';
import { UsuarioSesion } from '../comun/decoradores';
import { dec, Dec, DECIMALES_BS, redondear } from '../comun/dinero';
import { hoyEnCaracas } from '../comun/fechas';
import { Pagina } from '../comun/paginacion';
import { Proveedor } from '../proveedores/proveedor.entity';
import { Moneda } from '../tasas/tasa-cambio.entity';
import { TasasService } from '../tasas/tasas.service';
import { Compra } from './compra.entity';
import { BuscarOrdenesDto, CrearOrdenDto, SugerenciaOrdenDto } from './compras.dto';
import { EstadoOrden, OrdenCompra, OrdenCompraLinea } from './orden-compra.entity';
import { unidadDeLinea } from './unidades';

export interface LineaSugerida {
  productoId: number;
  codigo: string;
  descripcion: string;
  unidad: string;
  existencia: string;
  stockMinimo: string;
  stockMaximo: string | null;
  /** Ya pedido en órdenes abiertas, en unidad base. */
  enCamino: string;
  cantidad: string;
  costoUnitario: string;
}

export type DetalleOrden = OrdenCompra & {
  compras: Pick<Compra, 'id' | 'fecha' | 'numero' | 'estado' | 'total' | 'moneda'>[];
};

const ABIERTAS = [EstadoOrden.PENDIENTE, EstadoOrden.PARCIAL];

/** Estado que corresponde a lo recibido en cada línea. */
export function estadoPorRecepcion(lineas: Pick<OrdenCompraLinea, 'cantidad' | 'cantidadRecibida'>[]): EstadoOrden {
  if (lineas.every((l) => dec(l.cantidadRecibida).gte(l.cantidad))) return EstadoOrden.RECIBIDA;
  if (lineas.some((l) => dec(l.cantidadRecibida).gt(0))) return EstadoOrden.PARCIAL;
  return EstadoOrden.PENDIENTE;
}

/**
 * Suma (o resta, con signo -1) lo recibido en una compra a las líneas de su
 * orden y actualiza el estado. Lo que no estaba pedido no cambia la orden.
 */
export async function aplicarRecepcion(
  m: EntityManager,
  ordenId: number,
  recibido: { productoId: number; presentacionId: number | null; cantidad: string }[],
  signo: 1 | -1,
): Promise<void> {
  const orden = await m.getRepository(OrdenCompra).findOne({ where: { id: ordenId }, lock: { mode: 'pessimistic_write' } });
  if (!orden) throw new NotFoundException('Orden de compra no encontrada');
  const lineas = await m.getRepository(OrdenCompraLinea).find({ where: { ordenId }, order: { id: 'ASC' } });
  for (const r of recibido) {
    const linea = lineas.find((l) => l.productoId === r.productoId && (l.presentacionId ?? null) === (r.presentacionId ?? null));
    if (!linea) continue;
    const nueva = dec(linea.cantidadRecibida).plus(dec(r.cantidad).times(signo));
    linea.cantidadRecibida = Dec.max(nueva, 0).toFixed(3);
  }
  await m.save(lineas);
  if (orden.estado !== EstadoOrden.CANCELADA) {
    await m.update(OrdenCompra, { id: ordenId }, { estado: estadoPorRecepcion(lineas) });
  }
}

@Injectable()
export class OrdenesService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly tasas: TasasService,
  ) {}

  async crear(dto: CrearOrdenDto, usuario: UsuarioSesion): Promise<DetalleOrden> {
    const proveedor = await this.ds.getRepository(Proveedor).findOneBy({ id: dto.proveedorId });
    if (!proveedor) throw new NotFoundException('Proveedor no encontrado');
    const ids = [...new Set(dto.lineas.map((l) => l.productoId))];
    const productos = await this.ds.getRepository(Producto).find({
      where: { id: In(ids) },
      relations: { unidadBase: true, presentaciones: { unidad: true } },
    });
    const porId = new Map(productos.map((p) => [p.id, p]));
    const lineas = dto.lineas.map((l) => {
      const p = porId.get(l.productoId);
      if (!p) throw new NotFoundException(`Producto ${l.productoId} no encontrado`);
      const { unidad, factor } = unidadDeLinea(p, l.presentacionId, l.cantidad);
      return { l, p, unidad, factor };
    });
    const subtotal = lineas.reduce((s, { l }) => s.plus(redondear(dec(l.costoUnitario).times(l.cantidad), DECIMALES_BS)), dec(0));
    const id = await this.ds.transaction(async (m) => {
      const orden = await m.save(
        m.create(OrdenCompra, {
          proveedorId: proveedor.id,
          fecha: dto.fecha,
          moneda: dto.moneda,
          subtotal: subtotal.toFixed(2),
          notas: dto.notas?.trim() || null,
          usuarioId: usuario.id,
        }),
      );
      await m.save(
        lineas.map(({ l, p, unidad, factor }) =>
          m.create(OrdenCompraLinea, {
            ordenId: orden.id,
            productoId: p.id,
            codigo: p.codigo,
            descripcion: p.descripcion,
            presentacionId: l.presentacionId ?? null,
            unidad,
            factor: dec(factor).toFixed(6),
            cantidad: dec(l.cantidad).toFixed(3),
            costoUnitario: dec(l.costoUnitario).toFixed(4),
          }),
        ),
      );
      return orden.id;
    });
    return this.detalle(id);
  }

  async cancelar(id: number): Promise<DetalleOrden> {
    await this.ds.transaction(async (m) => {
      const orden = await m.getRepository(OrdenCompra).findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!orden) throw new NotFoundException('Orden de compra no encontrada');
      if (!ABIERTAS.includes(orden.estado))
        throw new ConflictException('Solo se cancelan órdenes pendientes o recibidas en parte');
      await m.update(OrdenCompra, { id }, { estado: EstadoOrden.CANCELADA });
    });
    return this.detalle(id);
  }

  async detalle(id: number): Promise<DetalleOrden> {
    const orden = await this.ds.getRepository(OrdenCompra).findOne({
      where: { id },
      relations: { proveedor: true, lineas: true, usuario: true },
      order: { lineas: { id: 'ASC' } },
    });
    if (!orden) throw new NotFoundException('Orden de compra no encontrada');
    const compras = await this.ds.getRepository(Compra).find({
      where: { ordenId: id },
      select: { id: true, fecha: true, numero: true, estado: true, total: true, moneda: true },
      order: { id: 'ASC' },
    });
    return Object.assign(orden, { compras });
  }

  async buscar(c: BuscarOrdenesDto): Promise<Pagina<OrdenCompra>> {
    const pagina = c.pagina ?? 1;
    const porPagina = c.porPagina ?? 50;
    const q = this.ds
      .getRepository(OrdenCompra)
      .createQueryBuilder('o')
      .innerJoinAndSelect('o.proveedor', 'p')
      .orderBy('o.fecha', 'DESC')
      .addOrderBy('o.id', 'DESC');
    if (c.proveedorId) q.andWhere('o.proveedor_id = :prov', { prov: c.proveedorId });
    if (c.estado === 'abiertas') q.andWhere('o.estado IN (:...abiertas)', { abiertas: ABIERTAS });
    else if (c.estado) q.andWhere('o.estado = :estado', { estado: c.estado });
    const [datos, total] = await q
      .skip((pagina - 1) * porPagina)
      .take(porPagina)
      .getManyAndCount();
    return { datos, total, pagina, porPagina };
  }

  /**
   * Productos de un proveedor que están bajo el mínimo: se pide hasta la
   * existencia máxima (o el doble del mínimo si no tiene), descontando lo que
   * ya viene en otras órdenes abiertas.
   */
  async sugerencia(c: SugerenciaOrdenDto): Promise<LineaSugerida[]> {
    let tasa: Dec | null = null;
    if (c.moneda === 'BS') {
      const vigente = await this.tasas.vigente(Moneda.USD, hoyEnCaracas());
      if (!vigente) throw new BadRequestException('No hay tasa BCV del día para calcular los costos en bolívares');
      tasa = dec(vigente.valor);
    }
    const filas: {
      id: number;
      codigo: string;
      descripcion: string;
      unidad: string;
      permite_decimales: boolean;
      existencia: string;
      stock_minimo: string;
      stock_maximo: string | null;
      costo: string;
      en_camino: string;
    }[] = await this.ds.query(
      `SELECT p.id, p.codigo, p.descripcion, u.codigo AS unidad, u.permite_decimales, p.existencia,
              p.stock_minimo, p.stock_maximo, coalesce(pp.costo_usd, p.costo_usd) AS costo,
              coalesce((SELECT sum((l.cantidad - l.cantidad_recibida) * l.factor)
                          FROM ordenes_compra_lineas l JOIN ordenes_compra o ON o.id = l.orden_id
                         WHERE l.producto_id = p.id AND o.estado IN ('PENDIENTE', 'PARCIAL')
                           AND l.cantidad > l.cantidad_recibida), 0) AS en_camino
         FROM productos p
         JOIN productos_proveedores pp ON pp.producto_id = p.id AND pp.proveedor_id = $1
         JOIN unidades_medida u ON u.id = p.unidad_base_id
        WHERE p.activo AND p.stock_minimo > 0 AND p.existencia < p.stock_minimo
        ORDER BY p.descripcion`,
      [c.proveedorId],
    );
    return filas.flatMap((f) => {
      const objetivo =
        f.stock_maximo !== null && dec(f.stock_maximo).gt(f.stock_minimo) ? dec(f.stock_maximo) : dec(f.stock_minimo).times(2);
      let cantidad = objetivo.minus(f.existencia).minus(f.en_camino);
      cantidad = f.permite_decimales ? cantidad.toDecimalPlaces(3, Dec.ROUND_UP) : cantidad.ceil();
      if (cantidad.lte(0)) return [];
      const costo = tasa ? dec(f.costo).times(tasa) : dec(f.costo);
      return [
        {
          productoId: f.id,
          codigo: f.codigo,
          descripcion: f.descripcion,
          unidad: f.unidad,
          existencia: dec(f.existencia).toString(),
          stockMinimo: dec(f.stock_minimo).toString(),
          stockMaximo: f.stock_maximo === null ? null : dec(f.stock_maximo).toString(),
          enCamino: dec(f.en_camino).toDecimalPlaces(3).toString(),
          cantidad: cantidad.toString(),
          costoUnitario: costo.toDecimalPlaces(4).toString(),
        },
      ];
    });
  }
}
