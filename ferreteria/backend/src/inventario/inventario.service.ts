import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { UsuarioSesion } from '../comun/decoradores';
import { dec, Decimalizable } from '../comun/dinero';
import { ZONA_HORARIA } from '../comun/fechas';
import { Pagina } from '../comun/paginacion';
import { ROLES_VEN_COSTOS } from '../usuarios/rol.enum';
import { AjusteInventarioDto, ConsultaMovimientosDto, ConteoDto } from './inventario.dto';
import { MovimientoInventario, TipoMovimiento } from './movimiento-inventario.entity';

export const DECIMALES_CANTIDAD = 3;

export interface DatosMovimiento {
  productoId: number;
  tipo: TipoMovimiento;
  /** Positiva si entra, negativa si sale. */
  cantidad: Decimalizable;
  motivo: string;
  referencia?: string | null;
  usuarioId: number | null;
}

export interface MovimientoListado {
  id: number;
  tipo: TipoMovimiento;
  cantidad: string;
  existenciaResultante: string;
  costoUsd?: string;
  motivo: string;
  referencia: string | null;
  usuario: string | null;
  creadoEn: Date;
}

export interface ResultadoConteo {
  referencia: string;
  lineas: { productoId: number; codigo: string; descripcion: string; anterior: string; contado: string; diferencia: string }[];
  ajustados: number;
}

export interface ResumenInventario {
  productosActivos: number;
  bajoMinimo: number;
  sinExistencia: number;
  valorUsd?: string;
}

interface FilaBloqueada {
  id: number;
  codigo: string;
  descripcion: string;
  existencia: string;
  costo_usd: string;
  permite_decimales: boolean;
  unidad: string;
}

const SIGNO_AJUSTE: Record<string, 1 | -1> = {
  [TipoMovimiento.ENTRADA]: 1,
  [TipoMovimiento.SALIDA]: -1,
  [TipoMovimiento.MERMA]: -1,
};

@Injectable()
export class InventarioService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /** Bloquea los productos (en orden de id, para evitar bloqueos cruzados) hasta el fin de la transacción. */
  private async bloquear(m: EntityManager, ids: number[]): Promise<Map<number, FilaBloqueada>> {
    const filas: FilaBloqueada[] = await m.query(
      `SELECT p.id, p.codigo, p.descripcion, p.existencia, p.costo_usd, u.permite_decimales, u.codigo AS unidad
         FROM productos p JOIN unidades_medida u ON u.id = p.unidad_base_id
        WHERE p.id = ANY($1::int[])
        ORDER BY p.id
        FOR UPDATE OF p`,
      [ids],
    );
    const porId = new Map(filas.map((f) => [f.id, f]));
    const faltante = ids.find((id) => !porId.has(id));
    if (faltante !== undefined) throw new NotFoundException(`Producto ${faltante} no encontrado`);
    return porId;
  }

  /**
   * Registra un movimiento y actualiza la existencia, dentro de la transacción
   * recibida. Es la única forma de cambiar la existencia de un producto; la
   * usarán también compras y punto de venta.
   */
  async registrar(m: EntityManager, datos: DatosMovimiento): Promise<MovimientoInventario> {
    const producto = (await this.bloquear(m, [datos.productoId])).get(datos.productoId)!;
    const cantidad = dec(datos.cantidad);
    if (cantidad.isZero()) throw new BadRequestException('La cantidad no puede ser cero');
    if (cantidad.decimalPlaces() > DECIMALES_CANTIDAD) {
      throw new BadRequestException(`La cantidad admite máximo ${DECIMALES_CANTIDAD} decimales`);
    }
    if (!producto.permite_decimales && !cantidad.isInteger()) {
      throw new BadRequestException(`${producto.codigo} se maneja por ${producto.unidad}: la cantidad debe ser un número entero`);
    }
    const nueva = dec(producto.existencia).plus(cantidad);
    if (nueva.isNegative()) {
      throw new BadRequestException(
        `Existencia insuficiente de ${producto.codigo}: hay ${dec(producto.existencia).toString()} ${producto.unidad} y se quieren descontar ${cantidad.abs().toString()}`,
      );
    }
    await m.query(`UPDATE productos SET existencia = $2 WHERE id = $1`, [producto.id, nueva.toFixed(DECIMALES_CANTIDAD)]);
    return m.save(
      m.create(MovimientoInventario, {
        productoId: producto.id,
        tipo: datos.tipo,
        cantidad: cantidad.toFixed(DECIMALES_CANTIDAD),
        existenciaResultante: nueva.toFixed(DECIMALES_CANTIDAD),
        costoUsd: producto.costo_usd,
        motivo: datos.motivo.trim(),
        referencia: datos.referencia?.trim() || null,
        usuarioId: datos.usuarioId,
      }),
    );
  }

  ajustar(dto: AjusteInventarioDto, usuario: UsuarioSesion): Promise<MovimientoInventario> {
    return this.ds.transaction((m) =>
      this.registrar(m, {
        productoId: dto.productoId,
        tipo: dto.tipo,
        cantidad: dec(dto.cantidad).times(SIGNO_AJUSTE[dto.tipo]),
        motivo: dto.motivo,
        usuarioId: usuario.id,
      }),
    );
  }

  /**
   * Conteo físico: para cada producto se registra la diferencia entre lo
   * contado y la existencia del sistema. Todo o nada: si una línea es
   * inválida no se ajusta ningún producto.
   */
  conteo(dto: ConteoDto, usuario: UsuarioSesion): Promise<ResultadoConteo> {
    const ids = dto.lineas.map((l) => l.productoId);
    const repetido = ids.find((id, i) => ids.indexOf(id) !== i);
    if (repetido !== undefined) throw new BadRequestException(`El producto ${repetido} aparece más de una vez en el conteo`);
    const referencia = dto.referencia?.trim() || `Conteo ${fechaHoraLocal()}`;

    return this.ds.transaction(async (m) => {
      const productos = await this.bloquear(m, ids);
      const resultado: ResultadoConteo = { referencia, lineas: [], ajustados: 0 };
      for (const linea of dto.lineas) {
        const p = productos.get(linea.productoId)!;
        const diferencia = dec(linea.contado).minus(p.existencia);
        if (!diferencia.isZero()) {
          await this.registrar(m, {
            productoId: p.id,
            tipo: TipoMovimiento.CONTEO,
            cantidad: diferencia,
            motivo: 'Diferencia en conteo físico',
            referencia,
            usuarioId: usuario.id,
          });
          resultado.ajustados++;
        }
        resultado.lineas.push({
          productoId: p.id,
          codigo: p.codigo,
          descripcion: p.descripcion,
          anterior: dec(p.existencia).toFixed(DECIMALES_CANTIDAD),
          contado: dec(linea.contado).toFixed(DECIMALES_CANTIDAD),
          diferencia: diferencia.toFixed(DECIMALES_CANTIDAD),
        });
      }
      return resultado;
    });
  }

  async movimientos(productoId: number, c: ConsultaMovimientosDto, usuario: UsuarioSesion): Promise<Pagina<MovimientoListado>> {
    const existe = await this.ds.query(`SELECT 1 FROM productos WHERE id = $1`, [productoId]);
    if (!existe.length) throw new NotFoundException('Producto no encontrado');
    const pagina = c.pagina ?? 1;
    const porPagina = c.porPagina ?? 50;
    const [filas, total] = await this.ds.getRepository(MovimientoInventario).findAndCount({
      where: { productoId },
      relations: { usuario: true },
      order: { id: 'DESC' },
      skip: (pagina - 1) * porPagina,
      take: porPagina,
    });
    const verCostos = ROLES_VEN_COSTOS.includes(usuario.rol);
    return {
      datos: filas.map((f) => ({
        id: f.id,
        tipo: f.tipo,
        cantidad: f.cantidad,
        existenciaResultante: f.existenciaResultante,
        ...(verCostos ? { costoUsd: f.costoUsd } : {}),
        motivo: f.motivo,
        referencia: f.referencia,
        usuario: f.usuario?.nombre ?? null,
        creadoEn: f.creadoEn,
      })),
      total,
      pagina,
      porPagina,
    };
  }

  async resumen(usuario: UsuarioSesion): Promise<ResumenInventario> {
    const [r] = await this.ds.query(
      `SELECT count(*) FILTER (WHERE activo) AS activos,
              count(*) FILTER (WHERE activo AND stock_minimo > 0 AND existencia <= stock_minimo) AS bajo_minimo,
              count(*) FILTER (WHERE activo AND existencia = 0) AS sin_existencia,
              coalesce(sum(existencia * costo_usd) FILTER (WHERE activo), 0) AS valor
         FROM productos`,
    );
    const resumen: ResumenInventario = {
      productosActivos: Number(r.activos),
      bajoMinimo: Number(r.bajo_minimo),
      sinExistencia: Number(r.sin_existencia),
    };
    if (ROLES_VEN_COSTOS.includes(usuario.rol)) resumen.valorUsd = dec(r.valor).toFixed(2);
    return resumen;
  }
}

/** "28/10/2026 18:45" en hora de Venezuela, para referencias legibles. */
function fechaHoraLocal(): string {
  return new Intl.DateTimeFormat('es-VE', {
    timeZone: ZONA_HORARIA,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(new Date())
    .replace(',', '');
}
