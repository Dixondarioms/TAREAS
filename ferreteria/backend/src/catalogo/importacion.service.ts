import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import ExcelJS from 'exceljs';
import { DataSource, EntityManager } from 'typeorm';
import { dec, DECIMALES_USD } from '../comun/dinero';
import { UsuarioSesion } from '../comun/decoradores';
import { validarRif } from '../comun/rif';
import { ProductoProveedor } from '../proveedores/producto-proveedor.entity';
import { Proveedor } from '../proveedores/proveedor.entity';
import { Categoria } from './entidades/categoria.entity';
import { CodigoBarras } from './entidades/codigo-barras.entity';
import { HistorialCosto } from './entidades/historial-costo.entity';
import { ListaPrecio } from './entidades/lista-precio.entity';
import { Marca } from './entidades/marca.entity';
import { ModoPrecio, PrecioProducto } from './entidades/precio-producto.entity';
import { AlicuotaIva, Producto } from './entidades/producto.entity';
import { UnidadMedida } from './entidades/unidad-medida.entity';
import { FilaPlanilla, leerPlanilla, normalizarNumero } from './lectura-planilla';
import { calcularFilaPrecio, normalizarCodigo, ProductosService } from './productos.service';
import { InventarioService } from '../inventario/inventario.service';
import { TipoMovimiento } from '../inventario/movimiento-inventario.entity';

export const MAX_FILAS_IMPORTACION = 20_000;

export interface ErrorImportacion {
  fila: number;
  codigo?: string;
  mensaje: string;
}

export interface ResultadoImportacion {
  simulado: boolean;
  filasLeidas: number;
  creados: number;
  actualizados: number;
  categoriasCreadas: number;
  marcasCreadas: number;
  errores: ErrorImportacion[];
}

class ErrorFila extends Error {}

/** Nombres alternativos de columnas que suelen venir en las planillas de proveedores. */
const ALIAS_COLUMNAS: Record<string, string> = {
  cod: 'codigo',
  codigo_interno: 'codigo',
  referencia: 'codigo',
  descripcion_del_producto: 'descripcion',
  nombre: 'descripcion',
  producto: 'descripcion',
  codigo_de_barras: 'codigo_barras',
  codigos_de_barras: 'codigo_barras',
  ean: 'codigo_barras',
  costo: 'costo_usd',
  costo_dolares: 'costo_usd',
  costo_unitario: 'costo_usd',
  alicuota: 'iva',
  alicuota_iva: 'iva',
  unidad_de_medida: 'unidad',
  rif_proveedor: 'proveedor_rif',
  codigo_del_proveedor: 'codigo_proveedor',
  stock_min: 'stock_minimo',
  stock_max: 'stock_maximo',
  minimo: 'stock_minimo',
  maximo: 'stock_maximo',
};

const IVA_POR_TEXTO: Record<string, AlicuotaIva> = {
  GENERAL: AlicuotaIva.GENERAL,
  G: AlicuotaIva.GENERAL,
  '16': AlicuotaIva.GENERAL,
  REDUCIDA: AlicuotaIva.REDUCIDA,
  R: AlicuotaIva.REDUCIDA,
  '8': AlicuotaIva.REDUCIDA,
  EXENTO: AlicuotaIva.EXENTO,
  E: AlicuotaIva.EXENTO,
  '0': AlicuotaIva.EXENTO,
};

/**
 * Carga masiva del catálogo desde Excel/CSV. Cada fila se procesa con un
 * punto de guardado: una fila con error se descarta sin afectar a las demás.
 * Los productos existentes (mismo código) se actualizan solo en las columnas con valor.
 */
@Injectable()
export class ImportacionService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly productos: ProductosService,
    private readonly inventario: InventarioService,
  ) {}

  async plantilla(): Promise<Buffer> {
    const listas = await this.ds.getRepository(ListaPrecio).find({ where: { activa: true }, order: { orden: 'ASC' } });
    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet('Productos');
    const columnas = [
      'codigo',
      'descripcion',
      'categoria',
      'marca',
      'unidad',
      'costo_usd',
      'iva',
      'codigo_barras',
      'stock_minimo',
      'stock_maximo',
      'ubicacion',
      'existencia',
      'proveedor_rif',
      'codigo_proveedor',
      ...listas.flatMap((l) => [`margen_${l.codigo.toLowerCase()}`, `precio_${l.codigo.toLowerCase()}`]),
    ];
    hoja.addRow(columnas).font = { bold: true };
    hoja.addRow([
      'TOR-0614',
      'Tornillo drywall punta fina 6 x 1"',
      'Tornillería > Drywall',
      'Fixser',
      'UND',
      '0.025',
      'GENERAL',
      '7591234567890',
      '200',
      '2000',
      'P3-E2',
      '1500',
      '',
      'FX-614',
      ...listas.flatMap((l) => [l.margenPorDefecto, '']),
    ]);
    hoja.columns.forEach((c) => (c.width = 18));

    const ayuda = libro.addWorksheet('Instrucciones');
    [
      ['Columna', 'Descripción'],
      ['codigo', 'Obligatorio. Código interno único. Si ya existe, el producto se actualiza.'],
      ['descripcion', 'Obligatorio para productos nuevos.'],
      ['categoria', 'Nombre, o ruta con ">" para subcategorías (se crean si no existen).'],
      ['marca', 'Se crea si no existe.'],
      ['unidad', 'Código de unidad base (UND, M, KG, L, GAL...). Por defecto UND.'],
      ['costo_usd', 'Costo en USD por unidad base, sin IVA. Acepta 1.234,56 o 1234.56'],
      ['iva', 'GENERAL (16), REDUCIDA (8) o EXENTO (0). Por defecto GENERAL.'],
      ['codigo_barras', 'Uno o varios separados por "|". Se agregan a los existentes.'],
      [
        'existencia',
        'Opcional. Cantidad contada en unidad base. Si difiere de la del sistema, se registra un ajuste de conteo en el kardex.',
      ],
      ['proveedor_rif / codigo_proveedor', 'RIF de un proveedor ya registrado y su código para el producto.'],
      ['margen_<lista>', 'Margen % sobre el costo para esa lista (el precio se recalcula al cambiar el costo).'],
      ['precio_<lista>', 'Precio fijo en USD sin IVA para esa lista (tiene prioridad sobre el margen).'],
    ].forEach((fila, i) => {
      const r = ayuda.addRow(fila);
      if (i === 0) r.font = { bold: true };
    });
    ayuda.getColumn(1).width = 32;
    ayuda.getColumn(2).width = 90;
    return Buffer.from(await libro.xlsx.writeBuffer());
  }

  async importar(
    nombreArchivo: string,
    contenido: Buffer,
    simular: boolean,
    usuario: UsuarioSesion,
  ): Promise<ResultadoImportacion> {
    let filas: FilaPlanilla[];
    let encabezados: string[];
    try {
      ({ filas, encabezados } = await leerPlanilla(nombreArchivo, contenido, MAX_FILAS_IMPORTACION));
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    encabezados = encabezados.map((e) => ALIAS_COLUMNAS[e] ?? e);
    const conNombre = encabezados.filter(Boolean);
    if (new Set(conNombre).size !== conNombre.length) throw new BadRequestException('Hay columnas repetidas en la planilla');
    if (!encabezados.includes('codigo')) throw new BadRequestException('Falta la columna "codigo"');
    filas = filas.map((f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [ALIAS_COLUMNAS[k] ?? k, v])));

    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    const m = qr.manager;
    const resultado: ResultadoImportacion = {
      simulado: simular,
      filasLeidas: filas.length,
      creados: 0,
      actualizados: 0,
      categoriasCreadas: 0,
      marcasCreadas: 0,
      errores: [],
    };
    const referencia = `Importación ${nombreArchivo}`.slice(0, 60);
    try {
      let ctx = await this.cargarContexto(m);
      for (let i = 0; i < filas.length; i++) {
        const numeroFila = i + 2; // fila 1 = encabezados
        const fila = filas[i];
        const creadasAntes = { categorias: resultado.categoriasCreadas, marcas: resultado.marcasCreadas };
        await qr.query('SAVEPOINT fila_importacion');
        try {
          const accion = await this.procesarFila(m, fila, ctx, resultado, usuario, referencia);
          resultado[accion === 'creado' ? 'creados' : 'actualizados']++;
          await qr.query('RELEASE SAVEPOINT fila_importacion');
        } catch (e) {
          await qr.query('ROLLBACK TO SAVEPOINT fila_importacion');
          const mensaje = e instanceof ErrorFila ? e.message : `Error inesperado: ${(e as Error).message}`;
          resultado.errores.push({ fila: numeroFila, codigo: fila.codigo || undefined, mensaje });
          // Lo creado por la fila fallida se deshizo: se recarga el contexto para no usar datos inexistentes.
          resultado.categoriasCreadas = creadasAntes.categorias;
          resultado.marcasCreadas = creadasAntes.marcas;
          ctx = await this.cargarContexto(m);
        }
      }
      if (simular) await qr.rollbackTransaction();
      else await qr.commitTransaction();
      return resultado;
    } catch (e) {
      if (qr.isTransactionActive) await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  private async cargarContexto(m: EntityManager) {
    // Una tras otra: dentro de la transacción todas usan la misma conexión,
    // y pg no admite consultas simultáneas sobre un mismo cliente.
    const unidades = await m.find(UnidadMedida);
    const categorias = await m.find(Categoria);
    const marcas = await m.find(Marca);
    const listas = await m.find(ListaPrecio);
    const proveedores = await m.find(Proveedor);
    return {
      unidades: new Map(unidades.map((u) => [u.codigo.toUpperCase(), u])),
      categorias,
      marcas: new Map(marcas.map((x) => [clave(x.nombre), x])),
      listas,
      proveedores: new Map(proveedores.map((p) => [p.rif, p])),
    };
  }

  private async procesarFila(
    m: EntityManager,
    f: FilaPlanilla,
    ctx: Awaited<ReturnType<ImportacionService['cargarContexto']>>,
    resultado: ResultadoImportacion,
    usuario: UsuarioSesion,
    referencia: string,
  ): Promise<'creado' | 'actualizado'> {
    const codigo = normalizarCodigo(f.codigo ?? '');
    if (!codigo) throw new ErrorFila('Falta el código');
    if (!/^[0-9A-Z./\-_#]{1,40}$/.test(codigo)) throw new ErrorFila('Código inválido (máx. 40 caracteres, sin espacios)');

    const existente = await m
      .getRepository(Producto)
      .createQueryBuilder('p')
      .where('upper(p.codigo) = :codigo', { codigo })
      .getOne();
    if (!existente && !f.descripcion) throw new ErrorFila('Falta la descripción para un producto nuevo');
    if (f.descripcion && (f.descripcion.length < 2 || f.descripcion.length > 200)) {
      throw new ErrorFila('La descripción debe tener entre 2 y 200 caracteres');
    }

    const unidad = f.unidad ? ctx.unidades.get(f.unidad.toUpperCase()) : existente ? undefined : ctx.unidades.get('UND');
    if (f.unidad && !unidad) throw new ErrorFila(`Unidad "${f.unidad}" no existe`);
    if (!existente && !unidad) throw new ErrorFila('No existe la unidad UND; indique la unidad');

    const costo = numero(f.costo_usd, 'costo_usd', { min: 0 });
    const iva = f.iva ? IVA_POR_TEXTO[f.iva.toUpperCase().replace('%', '').trim()] : undefined;
    if (f.iva && !iva) throw new ErrorFila(`IVA "${f.iva}" no reconocido (use GENERAL, REDUCIDA o EXENTO)`);
    const stockMinimo = numero(f.stock_minimo, 'stock_minimo', { min: 0 });
    const stockMaximo = numero(f.stock_maximo, 'stock_maximo', { min: 0 });
    const existencia = numero(f.existencia, 'existencia', { min: 0 });
    if (f.ubicacion && f.ubicacion.length > 60) throw new ErrorFila('La ubicación supera 60 caracteres');

    const categoriaId = f.categoria ? await this.resolverCategoria(m, f.categoria, ctx, resultado) : undefined;
    const marcaId = f.marca ? await this.resolverMarca(m, f.marca, ctx, resultado) : undefined;

    let producto: Producto;
    let accion: 'creado' | 'actualizado';
    if (existente) {
      producto = existente;
      accion = 'actualizado';
      const cambios: Partial<Producto> = {};
      if (f.descripcion) cambios.descripcion = f.descripcion;
      if (categoriaId !== undefined) cambios.categoriaId = categoriaId;
      if (marcaId !== undefined) cambios.marcaId = marcaId;
      if (unidad) cambios.unidadBaseId = unidad.id;
      if (iva) cambios.alicuotaIva = iva;
      if (stockMinimo !== undefined) cambios.stockMinimo = stockMinimo;
      if (stockMaximo !== undefined) cambios.stockMaximo = stockMaximo;
      if (f.ubicacion) cambios.ubicacion = f.ubicacion;
      if (costo !== undefined && !dec(costo).eq(producto.costoUsd)) {
        const nuevo = dec(costo).toFixed(DECIMALES_USD);
        await m.insert(HistorialCosto, {
          productoId: producto.id,
          costoAnterior: producto.costoUsd,
          costoNuevo: nuevo,
          motivo: 'Importación de planilla',
          usuarioId: usuario.id,
        });
        cambios.costoUsd = nuevo;
        cambios.costoActualizadoEn = new Date();
      }
      const minimo = cambios.stockMinimo ?? producto.stockMinimo;
      const maximo = cambios.stockMaximo ?? producto.stockMaximo;
      if (maximo !== null && dec(maximo).lt(minimo)) throw new ErrorFila('El stock máximo es menor que el mínimo');
      if (Object.keys(cambios).length) await m.update(Producto, { id: producto.id }, cambios);
      Object.assign(producto, cambios);
      if (cambios.costoUsd) await this.productos.recalcularPreciosPorCosto(m, producto);
    } else {
      if (stockMaximo !== undefined && dec(stockMaximo).lt(stockMinimo ?? '0'))
        throw new ErrorFila('El stock máximo es menor que el mínimo');
      producto = await m.save(
        m.create(Producto, {
          codigo,
          descripcion: f.descripcion,
          categoriaId: categoriaId ?? null,
          marcaId: marcaId ?? null,
          unidadBaseId: unidad!.id,
          costoUsd: dec(costo ?? '0').toFixed(DECIMALES_USD),
          costoActualizadoEn: new Date(),
          alicuotaIva: iva ?? AlicuotaIva.GENERAL,
          stockMinimo: stockMinimo ?? '0',
          stockMaximo: stockMaximo ?? null,
          ubicacion: f.ubicacion || null,
        }),
      );
      accion = 'creado';
    }

    // Precios por lista: precio_<lista> (fijo) tiene prioridad sobre margen_<lista>.
    for (const lista of ctx.listas) {
      const sufijo = lista.codigo.toLowerCase();
      const precioFijo = numero(f[`precio_${sufijo}`], `precio_${sufijo}`, { min: 0 });
      const margen = numero(f[`margen_${sufijo}`], `margen_${sufijo}`, { min: -99.9999 });
      const existentePrecio =
        accion === 'actualizado' ? await m.findOneBy(PrecioProducto, { productoId: producto.id, listaId: lista.id }) : null;
      let fila;
      if (precioFijo !== undefined) {
        fila = calcularFilaPrecio(producto.costoUsd, { listaId: lista.id, modo: ModoPrecio.FIJO, precioUsd: precioFijo });
      } else if (margen !== undefined) {
        fila = calcularFilaPrecio(producto.costoUsd, { listaId: lista.id, modo: ModoPrecio.MARGEN, margen });
      } else if (!existentePrecio) {
        fila = calcularFilaPrecio(producto.costoUsd, {
          listaId: lista.id,
          modo: ModoPrecio.MARGEN,
          margen: lista.margenPorDefecto,
        });
      }
      if (fila)
        await m.upsert(PrecioProducto, { productoId: producto.id, listaId: lista.id, ...fila }, ['productoId', 'listaId']);
    }

    if (f.codigo_barras) {
      for (const cb of f.codigo_barras
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean)) {
        if (!/^[0-9A-Za-z.\-]{3,50}$/.test(cb)) throw new ErrorFila(`Código de barras inválido: ${cb}`);
        const usado = await m.findOne(CodigoBarras, { where: { codigo: cb }, relations: { producto: true } });
        if (usado && usado.productoId !== producto.id) {
          throw new ErrorFila(`El código de barras ${cb} ya pertenece al producto ${usado.producto.codigo}`);
        }
        if (!usado) await m.insert(CodigoBarras, { codigo: cb, productoId: producto.id, presentacionId: null });
      }
    }

    if (f.proveedor_rif) {
      const rif = validarRif(f.proveedor_rif);
      if (!rif.valido) throw new ErrorFila(`RIF de proveedor inválido: ${rif.error}`);
      const proveedor = ctx.proveedores.get(rif.normalizado!);
      if (!proveedor) throw new ErrorFila(`El proveedor ${rif.normalizado} no está registrado`);
      if (f.codigo_proveedor && f.codigo_proveedor.length > 60)
        throw new ErrorFila('El código de proveedor supera 60 caracteres');
      await m.upsert(
        ProductoProveedor,
        {
          productoId: producto.id,
          proveedorId: proveedor.id,
          codigoProveedor: f.codigo_proveedor || null,
          ...(costo !== undefined ? { costoUsd: dec(costo).toFixed(DECIMALES_USD) } : {}),
        },
        ['productoId', 'proveedorId'],
      );
    }

    if (existencia !== undefined) {
      const diferencia = dec(existencia).minus(producto.existencia ?? '0');
      if (!diferencia.isZero()) {
        try {
          await this.inventario.registrar(m, {
            productoId: producto.id,
            tipo: TipoMovimiento.CONTEO,
            cantidad: diferencia,
            motivo: 'Existencia cargada desde planilla',
            referencia,
            usuarioId: usuario.id,
          });
        } catch (e) {
          throw new ErrorFila(`existencia: ${(e as Error).message}`);
        }
      }
    }
    return accion;
  }

  private async resolverCategoria(
    m: EntityManager,
    ruta: string,
    ctx: Awaited<ReturnType<ImportacionService['cargarContexto']>>,
    resultado: ResultadoImportacion,
  ): Promise<number> {
    let padreId: number | null = null;
    for (const nombre of ruta
      .split('>')
      .map((n) => n.trim())
      .filter(Boolean)) {
      if (nombre.length > 100) throw new ErrorFila('Nombre de categoría demasiado largo');
      let cat = ctx.categorias.find((c) => c.padreId === padreId && clave(c.nombre) === clave(nombre));
      if (!cat) {
        cat = await m.save(m.create(Categoria, { nombre, padreId }));
        ctx.categorias.push(cat);
        resultado.categoriasCreadas++;
      }
      padreId = cat.id;
    }
    if (padreId === null) throw new ErrorFila('Categoría vacía');
    return padreId;
  }

  private async resolverMarca(
    m: EntityManager,
    nombre: string,
    ctx: Awaited<ReturnType<ImportacionService['cargarContexto']>>,
    resultado: ResultadoImportacion,
  ): Promise<number> {
    if (nombre.length > 100) throw new ErrorFila('Nombre de marca demasiado largo');
    let marca = ctx.marcas.get(clave(nombre));
    if (!marca) {
      marca = await m.save(m.create(Marca, { nombre }));
      ctx.marcas.set(clave(nombre), marca);
      resultado.marcasCreadas++;
    }
    return marca.id;
  }
}

function clave(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

function numero(texto: string | undefined, columna: string, opciones: { min?: number } = {}): string | undefined {
  if (texto === undefined || texto.trim() === '') return undefined;
  const n = normalizarNumero(texto);
  if (n === null) throw new ErrorFila(`${columna}: "${texto}" no es un número`);
  if (opciones.min !== undefined && dec(n).lt(opciones.min))
    throw new ErrorFila(`${columna} no puede ser menor que ${opciones.min}`);
  return dec(n).toDecimalPlaces(4).toString();
}
