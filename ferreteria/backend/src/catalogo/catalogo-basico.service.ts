import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';
import { dec } from '../comun/dinero';
import { CategoriaDto, ListaPrecioDto, MarcaDto, UnidadDto } from './dto/catalogo-basico.dto';
import { Categoria } from './entidades/categoria.entity';
import { ListaPrecio } from './entidades/lista-precio.entity';
import { Marca } from './entidades/marca.entity';
import { Producto } from './entidades/producto.entity';
import { UnidadMedida } from './entidades/unidad-medida.entity';

export interface NodoCategoria extends Categoria {
  ruta: string;
  hijos: NodoCategoria[];
}

/** Traduce violaciones de unicidad de PostgreSQL a un 409 legible. */
export async function conUnicidad<T>(accion: () => Promise<T>, mensaje: string): Promise<T> {
  try {
    return await accion();
  } catch (e) {
    if (e instanceof QueryFailedError && (e as QueryFailedError & { code?: string }).code === '23505') {
      throw new ConflictException(mensaje);
    }
    throw e;
  }
}

/** Unidades de medida, categorías, marcas y listas de precio. */
@Injectable()
export class CatalogoBasicoService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  // ---- Unidades ----
  listarUnidades() {
    return this.ds.getRepository(UnidadMedida).find({ order: { codigo: 'ASC' } });
  }

  crearUnidad(dto: UnidadDto) {
    const repo = this.ds.getRepository(UnidadMedida);
    return conUnicidad(
      () =>
        repo.save(
          repo.create({
            codigo: dto.codigo.toUpperCase(),
            nombre: dto.nombre.trim(),
            permiteDecimales: dto.permiteDecimales ?? false,
          }),
        ),
      'Ya existe una unidad con ese código',
    );
  }

  async actualizarUnidad(id: number, dto: UnidadDto) {
    const repo = this.ds.getRepository(UnidadMedida);
    const u = await repo.findOneBy({ id });
    if (!u) throw new NotFoundException('Unidad no encontrada');
    Object.assign(u, {
      codigo: dto.codigo.toUpperCase(),
      nombre: dto.nombre.trim(),
      permiteDecimales: dto.permiteDecimales ?? u.permiteDecimales,
    });
    return conUnicidad(() => repo.save(u), 'Ya existe una unidad con ese código');
  }

  // ---- Categorías ----
  async arbolCategorias(): Promise<NodoCategoria[]> {
    const todas = await this.ds.getRepository(Categoria).find({ order: { nombre: 'ASC' } });
    const nodos = new Map<number, NodoCategoria>(todas.map((c) => [c.id, { ...c, ruta: c.nombre, hijos: [] }]));
    const raices: NodoCategoria[] = [];
    for (const nodo of nodos.values()) {
      const padre = nodo.padreId ? nodos.get(nodo.padreId) : undefined;
      if (padre) padre.hijos.push(nodo);
      else raices.push(nodo);
    }
    const asignarRutas = (lista: NodoCategoria[], prefijo: string) => {
      for (const n of lista) {
        n.ruta = prefijo ? `${prefijo} > ${n.nombre}` : n.nombre;
        asignarRutas(n.hijos, n.ruta);
      }
    };
    asignarRutas(raices, '');
    return raices;
  }

  /** Lista plana con la ruta completa ("Electricidad > Cables"), útil para selectores. */
  async listarCategoriasPlano(): Promise<Omit<NodoCategoria, 'hijos'>[]> {
    const resultado: Omit<NodoCategoria, 'hijos'>[] = [];
    const recorrer = (lista: NodoCategoria[]) => {
      for (const { hijos, ...resto } of lista) {
        resultado.push(resto);
        recorrer(hijos);
      }
    };
    recorrer(await this.arbolCategorias());
    return resultado;
  }

  async crearCategoria(dto: CategoriaDto) {
    const repo = this.ds.getRepository(Categoria);
    if (dto.padreId && !(await repo.existsBy({ id: dto.padreId }))) throw new BadRequestException('La categoría padre no existe');
    return conUnicidad(
      () => repo.save(repo.create({ nombre: dto.nombre.trim(), padreId: dto.padreId ?? null })),
      'Ya existe una categoría con ese nombre en el mismo nivel',
    );
  }

  async actualizarCategoria(id: number, dto: CategoriaDto) {
    const repo = this.ds.getRepository(Categoria);
    const c = await repo.findOneBy({ id });
    if (!c) throw new NotFoundException('Categoría no encontrada');
    const padreId = dto.padreId === undefined ? c.padreId : dto.padreId;
    if (padreId) {
      // Evita ciclos: el nuevo padre no puede ser la misma categoría ni una descendiente.
      let actual: number | null = padreId;
      while (actual) {
        if (actual === id) throw new BadRequestException('Una categoría no puede ser subcategoría de sí misma');
        const sig: Categoria | null = await repo.findOneBy({ id: actual });
        if (!sig) throw new BadRequestException('La categoría padre no existe');
        actual = sig.padreId;
      }
    }
    c.nombre = dto.nombre.trim();
    c.padreId = padreId ?? null;
    return conUnicidad(() => repo.save(c), 'Ya existe una categoría con ese nombre en el mismo nivel');
  }

  async eliminarCategoria(id: number) {
    const repo = this.ds.getRepository(Categoria);
    if (await repo.existsBy({ padreId: id })) throw new BadRequestException('La categoría tiene subcategorías');
    if (await this.ds.getRepository(Producto).existsBy({ categoriaId: id })) {
      throw new BadRequestException('La categoría tiene productos asignados');
    }
    const r = await repo.delete({ id });
    if (!r.affected) throw new NotFoundException('Categoría no encontrada');
  }

  // ---- Marcas ----
  listarMarcas() {
    return this.ds.getRepository(Marca).find({ order: { nombre: 'ASC' } });
  }

  crearMarca(dto: MarcaDto) {
    const repo = this.ds.getRepository(Marca);
    return conUnicidad(() => repo.save(repo.create({ nombre: dto.nombre.trim() })), 'Ya existe esa marca');
  }

  async actualizarMarca(id: number, dto: MarcaDto) {
    const repo = this.ds.getRepository(Marca);
    const m = await repo.findOneBy({ id });
    if (!m) throw new NotFoundException('Marca no encontrada');
    m.nombre = dto.nombre.trim();
    return conUnicidad(() => repo.save(m), 'Ya existe esa marca');
  }

  async eliminarMarca(id: number) {
    if (await this.ds.getRepository(Producto).existsBy({ marcaId: id })) {
      throw new BadRequestException('La marca tiene productos asignados');
    }
    const r = await this.ds.getRepository(Marca).delete({ id });
    if (!r.affected) throw new NotFoundException('Marca no encontrada');
  }

  // ---- Listas de precio ----
  listarListas(soloActivas = false) {
    return this.ds
      .getRepository(ListaPrecio)
      .find({ where: soloActivas ? { activa: true } : {}, order: { orden: 'ASC', id: 'ASC' } });
  }

  async listaPorDefecto(): Promise<ListaPrecio> {
    const [lista] = await this.listarListas(true);
    if (!lista) throw new BadRequestException('No hay listas de precio activas');
    return lista;
  }

  /**
   * Una lista nueva se rellena con precios para todos los productos usando su
   * margen por defecto, para que ningún producto quede sin precio en ella.
   */
  async crearLista(dto: ListaPrecioDto) {
    return conUnicidad(
      () =>
        this.ds.transaction(async (m) => {
          const lista = await m.save(
            m.create(ListaPrecio, {
              codigo: dto.codigo.toUpperCase(),
              nombre: dto.nombre.trim(),
              margenPorDefecto: dec(dto.margenPorDefecto).toFixed(4),
              orden: dto.orden ?? 0,
              activa: dto.activa ?? true,
            }),
          );
          await m.query(
            `INSERT INTO precios_producto (producto_id, lista_id, modo, margen, precio_usd)
             SELECT id, $1, 'MARGEN', $2, round(costo_usd * (1 + $2::numeric / 100), 4) FROM productos`,
            [lista.id, lista.margenPorDefecto],
          );
          return lista;
        }),
      'Ya existe una lista con ese código',
    );
  }

  async actualizarLista(id: number, dto: ListaPrecioDto) {
    const repo = this.ds.getRepository(ListaPrecio);
    const l = await repo.findOneBy({ id });
    if (!l) throw new NotFoundException('Lista no encontrada');
    Object.assign(l, {
      codigo: dto.codigo.toUpperCase(),
      nombre: dto.nombre.trim(),
      margenPorDefecto: dec(dto.margenPorDefecto).toFixed(4),
      orden: dto.orden ?? l.orden,
      activa: dto.activa ?? l.activa,
    });
    return conUnicidad(() => repo.save(l), 'Ya existe una lista con ese código');
  }
}
