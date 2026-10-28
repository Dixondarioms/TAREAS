import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { aTexto, dec, DECIMALES_USD, margenDesdePrecio, precioDesdeMargen } from '../comun/dinero';
import { UsuarioSesion } from '../comun/decoradores';
import { Pagina } from '../comun/paginacion';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { ProductoProveedor } from '../proveedores/producto-proveedor.entity';
import { Proveedor } from '../proveedores/proveedor.entity';
import { Moneda } from '../tasas/tasa-cambio.entity';
import { TasasService } from '../tasas/tasas.service';
import { ROLES_FIJAN_PRECIOS, ROLES_VEN_COSTOS } from '../usuarios/rol.enum';
import { calcularVistaPrecio, ContextoPrecios, VistaPrecio } from './calculo-precios';
import { ActualizarProductoDto, BuscarProductosDto, CrearProductoDto, PrecioDto, PresentacionDto } from './dto/producto.dto';
import { Categoria } from './entidades/categoria.entity';
import { CodigoBarras } from './entidades/codigo-barras.entity';
import { HistorialCosto } from './entidades/historial-costo.entity';
import { ListaPrecio } from './entidades/lista-precio.entity';
import { Marca } from './entidades/marca.entity';
import { ModoPrecio, PrecioProducto } from './entidades/precio-producto.entity';
import { Presentacion } from './entidades/presentacion.entity';
import { Producto } from './entidades/producto.entity';
import { UnidadMedida } from './entidades/unidad-medida.entity';

export interface ProductoListado {
  id: number;
  codigo: string;
  descripcion: string;
  marca: string | null;
  categoria: string | null;
  unidad: string;
  alicuotaIva: string;
  ubicacion: string | null;
  activo: boolean;
  costoUsd?: string;
  precio: (VistaPrecio & { listaId: number; margen?: string | null; modo?: ModoPrecio }) | null;
}

export interface ResultadoBusqueda extends Pagina<ProductoListado> {
  busquedaAproximada: boolean;
  lista: Pick<ListaPrecio, 'id' | 'codigo' | 'nombre'>;
  tasa: { valor: string; fechaValor: string } | null;
}

/** Escapa los comodines de LIKE para que "50%" se busque literalmente. */
function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function normalizarCodigo(codigo: string): string {
  return codigo.trim().toUpperCase();
}

@Injectable()
export class ProductosService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly configuracion: ConfiguracionService,
    private readonly tasas: TasasService,
  ) {}

  async contextoPrecios(): Promise<ContextoPrecios> {
    const [config, tasa] = await Promise.all([this.configuracion.obtenerTodo(), this.tasas.vigente(Moneda.USD)]);
    return { tasaUsd: tasa?.valor ?? null, alicuotas: config.alicuotasIva, redondeoBs: config.redondeoBs };
  }

  // ------------------------------------------------------------------ búsqueda

  async buscar(consulta: BuscarProductosDto, usuario: UsuarioSesion): Promise<ResultadoBusqueda> {
    const listas = await this.ds.getRepository(ListaPrecio).find({ order: { orden: 'ASC', id: 'ASC' } });
    const lista = consulta.listaId ? listas.find((l) => l.id === consulta.listaId) : listas.find((l) => l.activa);
    if (!lista) throw new BadRequestException('Lista de precios no encontrada');

    const pagina = consulta.pagina ?? 1;
    const porPagina = consulta.porPagina ?? 50;
    const texto = (consulta.q ?? '').trim();

    let { ids, total } = await this.consultarIds(consulta, texto, false, pagina, porPagina);
    let busquedaAproximada = false;
    if (total === 0 && texto.length >= 3) {
      ({ ids, total } = await this.consultarIds(consulta, texto, true, pagina, porPagina));
      busquedaAproximada = total > 0;
    }

    const productos = ids.length
      ? await this.ds.getRepository(Producto).find({
          where: { id: In(ids) },
          relations: { marca: true, categoria: true, unidadBase: true, precios: true },
        })
      : [];
    const porId = new Map(productos.map((p) => [p.id, p]));
    const ctx = await this.contextoPrecios();
    const verCostos = ROLES_VEN_COSTOS.includes(usuario.rol);

    const datos = ids
      .map((id) => porId.get(id))
      .filter((p): p is Producto => Boolean(p))
      .map((p) => {
        const precio = p.precios.find((x) => x.listaId === lista.id);
        const fila: ProductoListado = {
          id: p.id,
          codigo: p.codigo,
          descripcion: p.descripcion,
          marca: p.marca?.nombre ?? null,
          categoria: p.categoria?.nombre ?? null,
          unidad: p.unidadBase.codigo,
          alicuotaIva: p.alicuotaIva,
          ubicacion: p.ubicacion,
          activo: p.activo,
          precio: precio
            ? {
                listaId: lista.id,
                ...calcularVistaPrecio(precio.precioUsd, p.alicuotaIva, ctx),
                ...(verCostos ? { margen: precio.margen, modo: precio.modo } : {}),
              }
            : null,
        };
        if (verCostos) fila.costoUsd = p.costoUsd;
        return fila;
      });

    const tasa = await this.tasas.vigente(Moneda.USD);
    return {
      datos,
      total,
      pagina,
      porPagina,
      busquedaAproximada,
      lista: { id: lista.id, codigo: lista.codigo, nombre: lista.nombre },
      tasa: tasa ? { valor: tasa.valor, fechaValor: tasa.fechaValor } : null,
    };
  }

  /**
   * Búsqueda en dos pasos: primero cada palabra debe aparecer (sin importar
   * acentos ni mayúsculas) en la descripción, código, marca o código de barras;
   * si no hay resultados, se buscan descripciones parecidas (errores de tipeo).
   */
  private async consultarIds(c: BuscarProductosDto, texto: string, aproximada: boolean, pagina: number, porPagina: number) {
    const params: unknown[] = [];
    const p = (valor: unknown) => {
      params.push(valor);
      return `$${params.length}`;
    };
    const condiciones: string[] = [];
    const estado = c.estado ?? 'activos';
    if (estado !== 'todos') condiciones.push(`p.activo = ${estado === 'activos'}`);
    if (c.marcaId) condiciones.push(`p.marca_id = ${p(c.marcaId)}`);
    if (c.proveedorId) {
      condiciones.push(
        `EXISTS (SELECT 1 FROM productos_proveedores pp WHERE pp.producto_id = p.id AND pp.proveedor_id = ${p(c.proveedorId)})`,
      );
    }
    if (c.categoriaId) {
      condiciones.push(`p.categoria_id IN (
        WITH RECURSIVE sub AS (SELECT id FROM categorias WHERE id = ${p(c.categoriaId)}
          UNION ALL SELECT cat.id FROM categorias cat JOIN sub ON cat.padre_id = sub.id)
        SELECT id FROM sub)`);
    }

    let orden = 'p.descripcion ASC, p.id ASC';
    if (texto) {
      const t = p(texto);
      if (aproximada) {
        condiciones.push(`word_similarity(f_normalizar(${t}), f_normalizar(p.descripcion)) >= 0.35`);
        orden = `word_similarity(f_normalizar(${t}), f_normalizar(p.descripcion)) DESC, p.descripcion ASC`;
      } else {
        for (const palabra of texto.split(/\s+/).slice(0, 8)) {
          const patron = p(`%${escaparLike(palabra)}%`);
          const exacto = p(palabra);
          condiciones.push(`(
            f_normalizar(p.descripcion) LIKE f_normalizar(${patron})
            OR f_normalizar(p.codigo) LIKE f_normalizar(${patron})
            OR f_normalizar(coalesce(m.nombre, '')) LIKE f_normalizar(${patron})
            OR EXISTS (SELECT 1 FROM codigos_barras cb WHERE cb.producto_id = p.id AND cb.codigo = ${exacto}))`);
        }
        orden = `CASE WHEN upper(p.codigo) = upper(${t})
                        OR EXISTS (SELECT 1 FROM codigos_barras cb WHERE cb.producto_id = p.id AND cb.codigo = ${t})
                      THEN 0 ELSE 1 END,
                 similarity(f_normalizar(p.descripcion), f_normalizar(${t})) DESC, p.descripcion ASC, p.id ASC`;
      }
    }

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const filas: { id: number; total: string }[] = await this.ds.query(
      `SELECT p.id, count(*) OVER () AS total
         FROM productos p LEFT JOIN marcas m ON m.id = p.marca_id
         ${where}
         ORDER BY ${orden}
         LIMIT ${p(porPagina)} OFFSET ${p((pagina - 1) * porPagina)}`,
      params,
    );
    let total = filas.length ? Number(filas[0].total) : 0;
    if (!filas.length && pagina > 1) {
      // Página fuera de rango: se informa el total real.
      const [{ cuenta }] = await this.ds.query(
        `SELECT count(*) AS cuenta FROM productos p LEFT JOIN marcas m ON m.id = p.marca_id ${where}`,
        params.slice(0, params.length - 2),
      );
      total = Number(cuenta);
    }
    return { ids: filas.map((f) => Number(f.id)), total };
  }

  // ------------------------------------------------------------------ detalle

  async detalle(id: number, usuario: UsuarioSesion) {
    const p = await this.ds.getRepository(Producto).findOne({
      where: { id },
      relations: {
        marca: true,
        categoria: true,
        unidadBase: true,
        codigosBarras: true,
        presentaciones: { unidad: true },
        precios: { lista: true },
      },
    });
    if (!p) throw new NotFoundException('Producto no encontrado');
    const verCostos = ROLES_VEN_COSTOS.includes(usuario.rol);
    const ctx = await this.contextoPrecios();
    const precios = [...p.precios].sort((a, b) => a.lista.orden - b.lista.orden || a.listaId - b.listaId);

    const proveedores = verCostos
      ? await this.ds.getRepository(ProductoProveedor).find({ where: { productoId: id }, relations: { proveedor: true } })
      : [];

    return {
      id: p.id,
      codigo: p.codigo,
      descripcion: p.descripcion,
      categoria: p.categoria ? { id: p.categoria.id, nombre: p.categoria.nombre } : null,
      marca: p.marca ? { id: p.marca.id, nombre: p.marca.nombre } : null,
      unidadBase: p.unidadBase,
      alicuotaIva: p.alicuotaIva,
      porcentajeIva: ctx.alicuotas[p.alicuotaIva],
      stockMinimo: p.stockMinimo,
      stockMaximo: p.stockMaximo,
      ubicacion: p.ubicacion,
      notas: p.notas,
      activo: p.activo,
      ...(verCostos ? { costoUsd: p.costoUsd, costoActualizadoEn: p.costoActualizadoEn } : {}),
      codigosBarras: p.codigosBarras.filter((c) => c.presentacionId === null).map((c) => c.codigo),
      precios: precios.map((pr) => ({
        lista: { id: pr.lista.id, codigo: pr.lista.codigo, nombre: pr.lista.nombre },
        ...(verCostos ? { modo: pr.modo, margen: pr.margen } : {}),
        ...calcularVistaPrecio(pr.precioUsd, p.alicuotaIva, ctx),
      })),
      presentaciones: p.presentaciones
        .sort((a, b) => dec(a.factor).cmp(b.factor))
        .map((pre) => ({
          id: pre.id,
          unidad: pre.unidad,
          factor: pre.factor,
          codigosBarras: p.codigosBarras.filter((c) => c.presentacionId === pre.id).map((c) => c.codigo),
          precios: precios.map((pr) => ({
            listaId: pr.listaId,
            ...calcularVistaPrecio(pr.precioUsd, p.alicuotaIva, ctx, pre.factor),
          })),
        })),
      proveedores: proveedores.map((pp) => ({
        proveedor: { id: pp.proveedor.id, rif: pp.proveedor.rif, razonSocial: pp.proveedor.razonSocial },
        codigoProveedor: pp.codigoProveedor,
        costoUsd: pp.costoUsd,
      })),
      tasa: ctx.tasaUsd,
      creadoEn: p.creadoEn,
      actualizadoEn: p.actualizadoEn,
    };
  }

  /** Busca por código de barras o código interno exacto (lector en mostrador). */
  async porCodigo(codigo: string, usuario: UsuarioSesion) {
    const limpio = codigo.trim();
    const barras = await this.ds.getRepository(CodigoBarras).findOneBy({ codigo: limpio });
    if (barras) {
      return { presentacionId: barras.presentacionId, producto: await this.detalle(barras.productoId, usuario) };
    }
    const producto = await this.ds
      .getRepository(Producto)
      .createQueryBuilder('p')
      .where('upper(p.codigo) = :c', { c: normalizarCodigo(limpio) })
      .getOne();
    if (!producto) throw new NotFoundException(`No hay ningún producto con el código "${limpio}"`);
    return { presentacionId: null, producto: await this.detalle(producto.id, usuario) };
  }

  historialCostos(id: number) {
    return this.ds.getRepository(HistorialCosto).find({
      where: { productoId: id },
      order: { creadoEn: 'DESC', id: 'DESC' },
      take: 100,
      relations: { usuario: true },
    });
  }

  // ------------------------------------------------------------------ escritura

  async crear(dto: CrearProductoDto, usuario: UsuarioSesion) {
    if (!ROLES_FIJAN_PRECIOS.includes(usuario.rol) && (dto.precios?.length || (dto.costoUsd && !dec(dto.costoUsd).isZero()))) {
      throw new ForbiddenException('Solo gerencia puede fijar costos y precios');
    }
    const id = await this.ds.transaction(async (m) => {
      const codigo = normalizarCodigo(dto.codigo);
      if (await m.getRepository(Producto).createQueryBuilder('p').where('upper(p.codigo) = :codigo', { codigo }).getExists()) {
        throw new ConflictException(`Ya existe un producto con el código ${codigo}`);
      }
      await this.validarReferencias(m, dto);
      const producto = await m.save(
        m.create(Producto, {
          codigo,
          descripcion: dto.descripcion.trim(),
          categoriaId: dto.categoriaId ?? null,
          marcaId: dto.marcaId ?? null,
          unidadBaseId: dto.unidadBaseId,
          costoUsd: dec(dto.costoUsd ?? '0').toFixed(DECIMALES_USD),
          costoActualizadoEn: new Date(),
          alicuotaIva: dto.alicuotaIva,
          stockMinimo: dto.stockMinimo ?? '0',
          stockMaximo: dto.stockMaximo ?? null,
          ubicacion: dto.ubicacion?.trim() || null,
          notas: dto.notas?.trim() || null,
          activo: dto.activo ?? true,
        }),
      );
      await this.guardarPresentacionesYCodigos(m, producto, dto.presentaciones ?? [], dto.codigosBarras ?? []);
      await this.guardarPrecios(m, producto, dto.precios ?? [], true);
      if (dto.proveedores) await this.guardarProveedores(m, producto.id, dto.proveedores);
      return producto.id;
    });
    return this.detalle(id, usuario);
  }

  async actualizar(id: number, dto: ActualizarProductoDto, usuario: UsuarioSesion) {
    await this.ds.transaction(async (m) => {
      const producto = await m.getRepository(Producto).findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!producto) throw new NotFoundException('Producto no encontrado');

      const cambiaCosto = dto.costoUsd !== undefined && !dec(dto.costoUsd).eq(producto.costoUsd);
      if (!ROLES_FIJAN_PRECIOS.includes(usuario.rol) && (cambiaCosto || dto.precios !== undefined)) {
        throw new ForbiddenException('Solo gerencia puede modificar costos y precios');
      }

      if (dto.codigo !== undefined) {
        const codigo = normalizarCodigo(dto.codigo);
        const duplicado = await m
          .getRepository(Producto)
          .createQueryBuilder('p')
          .where('upper(p.codigo) = :codigo AND p.id <> :id', { codigo, id })
          .getExists();
        if (duplicado) throw new ConflictException(`Ya existe un producto con el código ${codigo}`);
        producto.codigo = codigo;
      }
      await this.validarReferencias(m, { ...producto, ...dto });
      if (dto.unidadBaseId !== undefined && dto.presentaciones === undefined) {
        const choca = await m.existsBy(Presentacion, { productoId: id, unidadId: dto.unidadBaseId });
        if (choca) throw new BadRequestException('Una presentación del producto ya usa esa unidad; ajuste las presentaciones');
      }

      if (dto.descripcion !== undefined) producto.descripcion = dto.descripcion.trim();
      if (dto.categoriaId !== undefined) producto.categoriaId = dto.categoriaId;
      if (dto.marcaId !== undefined) producto.marcaId = dto.marcaId;
      if (dto.unidadBaseId !== undefined) producto.unidadBaseId = dto.unidadBaseId;
      if (dto.alicuotaIva !== undefined) producto.alicuotaIva = dto.alicuotaIva;
      if (dto.stockMinimo !== undefined) producto.stockMinimo = dto.stockMinimo;
      if (dto.stockMaximo !== undefined) producto.stockMaximo = dto.stockMaximo;
      if (dto.ubicacion !== undefined) producto.ubicacion = dto.ubicacion?.trim() || null;
      if (dto.notas !== undefined) producto.notas = dto.notas?.trim() || null;
      if (dto.activo !== undefined) producto.activo = dto.activo;
      if (producto.stockMaximo !== null && dec(producto.stockMaximo).lt(producto.stockMinimo)) {
        throw new BadRequestException('El stock máximo no puede ser menor que el mínimo');
      }

      if (cambiaCosto) {
        const nuevo = dec(dto.costoUsd!).toFixed(DECIMALES_USD);
        await m.save(
          m.create(HistorialCosto, {
            productoId: id,
            costoAnterior: producto.costoUsd,
            costoNuevo: nuevo,
            motivo: dto.motivoCambioCosto?.trim() || 'Edición manual',
            usuarioId: usuario.id,
          }),
        );
        producto.costoUsd = nuevo;
        producto.costoActualizadoEn = new Date();
      }
      // Evita que save() intente persistir relaciones cargadas.
      await m.update(
        Producto,
        { id },
        {
          codigo: producto.codigo,
          descripcion: producto.descripcion,
          categoriaId: producto.categoriaId,
          marcaId: producto.marcaId,
          unidadBaseId: producto.unidadBaseId,
          alicuotaIva: producto.alicuotaIva,
          stockMinimo: producto.stockMinimo,
          stockMaximo: producto.stockMaximo,
          ubicacion: producto.ubicacion,
          notas: producto.notas,
          activo: producto.activo,
          costoUsd: producto.costoUsd,
          costoActualizadoEn: producto.costoActualizadoEn,
        },
      );

      if (dto.presentaciones !== undefined || dto.codigosBarras !== undefined) {
        const actuales = await this.codigosActuales(m, id);
        await m.delete(CodigoBarras, { productoId: id });
        await m.delete(Presentacion, { productoId: id });
        await this.guardarPresentacionesYCodigos(
          m,
          producto,
          dto.presentaciones ?? actuales.presentaciones,
          dto.codigosBarras ?? actuales.codigosBase,
        );
      }
      if (dto.precios !== undefined) await this.guardarPrecios(m, producto, dto.precios, false);
      if (cambiaCosto) await this.recalcularPreciosPorCosto(m, producto);
      if (dto.proveedores !== undefined) await this.guardarProveedores(m, id, dto.proveedores);
    });
    return this.detalle(id, usuario);
  }

  // ------------------------------------------------------------------ auxiliares

  private async validarReferencias(
    m: EntityManager,
    d: { unidadBaseId?: number; categoriaId?: number | null; marcaId?: number | null; presentaciones?: PresentacionDto[] },
  ) {
    if (d.unidadBaseId !== undefined && !(await m.existsBy(UnidadMedida, { id: d.unidadBaseId }))) {
      throw new BadRequestException('La unidad de medida no existe');
    }
    if (d.categoriaId && !(await m.existsBy(Categoria, { id: d.categoriaId })))
      throw new BadRequestException('La categoría no existe');
    if (d.marcaId && !(await m.existsBy(Marca, { id: d.marcaId }))) throw new BadRequestException('La marca no existe');
    if (d.presentaciones?.length) {
      const ids = [...new Set(d.presentaciones.map((p) => p.unidadId))];
      if (ids.length !== d.presentaciones.length)
        throw new BadRequestException('Hay presentaciones repetidas con la misma unidad');
      if (d.unidadBaseId !== undefined && ids.includes(d.unidadBaseId)) {
        throw new BadRequestException('Una presentación no puede usar la unidad base del producto');
      }
      if ((await m.countBy(UnidadMedida, { id: In(ids) })) !== ids.length) {
        throw new BadRequestException('Alguna unidad de las presentaciones no existe');
      }
    }
  }

  private async codigosActuales(m: EntityManager, productoId: number) {
    const presentaciones = await m.find(Presentacion, { where: { productoId } });
    const codigos = await m.find(CodigoBarras, { where: { productoId } });
    return {
      codigosBase: codigos.filter((c) => c.presentacionId === null).map((c) => c.codigo),
      presentaciones: presentaciones.map<PresentacionDto>((p) => ({
        unidadId: p.unidadId,
        factor: p.factor,
        codigosBarras: codigos.filter((c) => c.presentacionId === p.id).map((c) => c.codigo),
      })),
    };
  }

  private async guardarPresentacionesYCodigos(
    m: EntityManager,
    producto: Producto,
    presentaciones: PresentacionDto[],
    codigosBase: string[],
  ) {
    const todos = [...codigosBase, ...presentaciones.flatMap((p) => p.codigosBarras ?? [])].map((c) => c.trim());
    const repetidos = todos.filter((c, i) => todos.indexOf(c) !== i);
    if (repetidos.length) throw new BadRequestException(`Código de barras repetido: ${repetidos[0]}`);
    if (todos.length) {
      const enUso = await m.find(CodigoBarras, { where: { codigo: In(todos) }, relations: { producto: true } });
      const ajeno = enUso.find((c) => c.productoId !== producto.id);
      if (ajeno) {
        throw new ConflictException(`El código de barras ${ajeno.codigo} ya pertenece al producto ${ajeno.producto.codigo}`);
      }
    }

    for (const codigo of codigosBase) {
      await m.save(m.create(CodigoBarras, { codigo: codigo.trim(), productoId: producto.id, presentacionId: null }));
    }
    for (const pre of presentaciones) {
      const guardada = await m.save(
        m.create(Presentacion, { productoId: producto.id, unidadId: pre.unidadId, factor: dec(pre.factor).toFixed(6) }),
      );
      for (const codigo of pre.codigosBarras ?? []) {
        await m.save(m.create(CodigoBarras, { codigo: codigo.trim(), productoId: producto.id, presentacionId: guardada.id }));
      }
    }
  }

  /**
   * Guarda precios por lista. Al crear, las listas no indicadas reciben el
   * margen por defecto de la lista, para que el producto nunca quede sin precio.
   */
  private async guardarPrecios(m: EntityManager, producto: Producto, precios: PrecioDto[], completarFaltantes: boolean) {
    const listas = await m.find(ListaPrecio);
    const porLista = new Map(precios.map((p) => [p.listaId, p]));
    if (porLista.size !== precios.length) throw new BadRequestException('Hay listas de precio repetidas');
    for (const p of precios) {
      if (!listas.some((l) => l.id === p.listaId)) throw new BadRequestException(`La lista de precios ${p.listaId} no existe`);
    }

    for (const lista of listas) {
      const indicado = porLista.get(lista.id);
      if (!indicado && !completarFaltantes) continue;
      const fila = calcularFilaPrecio(
        producto.costoUsd,
        indicado ?? { listaId: lista.id, modo: ModoPrecio.MARGEN, margen: lista.margenPorDefecto },
      );
      await m.upsert(PrecioProducto, { productoId: producto.id, listaId: lista.id, ...fila }, ['productoId', 'listaId']);
    }
  }

  /** Tras un cambio de costo: los precios por margen se recalculan; en los fijos se actualiza el margen resultante. */
  async recalcularPreciosPorCosto(m: EntityManager, producto: Pick<Producto, 'id' | 'costoUsd'>) {
    const precios = await m.find(PrecioProducto, { where: { productoId: producto.id } });
    for (const pr of precios) {
      const fila = calcularFilaPrecio(
        producto.costoUsd,
        pr.modo === ModoPrecio.MARGEN
          ? { listaId: pr.listaId, modo: pr.modo, margen: pr.margen ?? '0' }
          : { listaId: pr.listaId, modo: pr.modo, precioUsd: pr.precioUsd },
      );
      await m.update(PrecioProducto, { id: pr.id }, fila);
    }
  }

  private async guardarProveedores(
    m: EntityManager,
    productoId: number,
    proveedores: NonNullable<CrearProductoDto['proveedores']>,
  ) {
    const ids = proveedores.map((p) => p.proveedorId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Hay proveedores repetidos');
    if (ids.length && (await m.countBy(Proveedor, { id: In(ids) })) !== ids.length) {
      throw new BadRequestException('Algún proveedor no existe');
    }
    await m.delete(ProductoProveedor, { productoId });
    for (const p of proveedores) {
      await m.save(
        m.create(ProductoProveedor, {
          productoId,
          proveedorId: p.proveedorId,
          codigoProveedor: p.codigoProveedor?.trim() || null,
          costoUsd: p.costoUsd ? dec(p.costoUsd).toFixed(DECIMALES_USD) : null,
        }),
      );
    }
  }
}

/** Calcula precio y margen consistentes para una lista según su modo. */
export function calcularFilaPrecio(costoUsd: string, p: PrecioDto): Pick<PrecioProducto, 'modo' | 'margen' | 'precioUsd'> {
  if (p.modo === ModoPrecio.MARGEN) {
    if (p.margen === undefined) throw new BadRequestException(`Falta el margen para la lista ${p.listaId}`);
    return {
      modo: ModoPrecio.MARGEN,
      margen: dec(p.margen).toFixed(4),
      precioUsd: aTexto(precioDesdeMargen(costoUsd, p.margen), DECIMALES_USD),
    };
  }
  if (p.precioUsd === undefined) throw new BadRequestException(`Falta el precio para la lista ${p.listaId}`);
  const margen = margenDesdePrecio(costoUsd, p.precioUsd);
  return {
    modo: ModoPrecio.FIJO,
    margen: margen ? aTexto(margen, 4) : null,
    precioUsd: dec(p.precioUsd).toFixed(DECIMALES_USD),
  };
}
