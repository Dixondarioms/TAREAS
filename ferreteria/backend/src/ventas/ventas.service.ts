import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { ListaPrecio } from '../catalogo/entidades/lista-precio.entity';
import { Producto } from '../catalogo/entidades/producto.entity';
import { UsuarioSesion } from '../comun/decoradores';
import { dec, DECIMALES_BS, redondear } from '../comun/dinero';
import { ZONA_HORARIA } from '../comun/fechas';
import { Pagina } from '../comun/paginacion';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { InventarioService } from '../inventario/inventario.service';
import { TipoMovimiento } from '../inventario/movimiento-inventario.entity';
import { Moneda } from '../tasas/tasa-cambio.entity';
import { TasasService } from '../tasas/tasas.service';
import { Rol } from '../usuarios/rol.enum';
import { CajaService } from './caja.service';
import { CobranzaService } from './cobranza.service';
import { calcularVenta, LineaACalcular, VentaCalculada } from './calculo-venta';
import { Cliente } from './entidades/cliente.entity';
import { EstadoCaja } from './entidades/sesion-caja.entity';
import { EstadoVenta, Venta, VentaLinea, VentaPago } from './entidades/venta.entity';
import { MetodoPago, METODOS_PAGO } from './metodos-pago';
import { formatoNumero, TalonariosService } from './talonarios.service';
import { AnularVentaDto, BuscarVentasDto, CotizarVentaDto, CrearVentaDto, LineaVentaDto } from './ventas.dto';

export const CONSUMIDOR_FINAL = 'Consumidor final';

interface LineaPreparada extends LineaACalcular {
  productoId: number;
  codigo: string;
  descripcion: string;
  presentacionId: number | null;
  unidad: string;
  factor: string;
  /** cantidad × factor: lo que sale del inventario. */
  cantidadBase: string;
  /** Costo de reposición por unidad base al momento de vender. */
  costoUsd: string;
}

export interface Cotizacion extends VentaCalculada {
  tasa: { valor: string; fechaValor: string };
  lista: { id: number; nombre: string };
  cobraIgtf: boolean;
  detalle: Omit<LineaPreparada, 'alicuotaIva'>[];
}

@Injectable()
export class VentasService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly configuracion: ConfiguracionService,
    private readonly tasas: TasasService,
    private readonly caja: CajaService,
    private readonly talonarios: TalonariosService,
    private readonly inventario: InventarioService,
    private readonly cobranza: CobranzaService,
  ) {}

  private async lista(m: EntityManager, listaId?: number): Promise<ListaPrecio> {
    const listas = await m.getRepository(ListaPrecio).find({ order: { orden: 'ASC', id: 'ASC' } });
    const lista = listaId ? listas.find((l) => l.id === listaId && l.activa) : listas.find((l) => l.activa);
    if (!lista) throw new BadRequestException('Lista de precios no encontrada o inactiva');
    return lista;
  }

  /** Busca productos, precio de la lista y presentación de cada línea; valida cantidades. */
  private async prepararLineas(m: EntityManager, lineas: LineaVentaDto[], lista: ListaPrecio): Promise<LineaPreparada[]> {
    const ids = [...new Set(lineas.map((l) => l.productoId))];
    const productos = ids.length
      ? await m.getRepository(Producto).find({
          where: { id: In(ids) },
          relations: { unidadBase: true, precios: true, presentaciones: { unidad: true } },
        })
      : [];
    const porId = new Map(productos.map((p) => [p.id, p]));
    return lineas.map((l) => {
      const p = porId.get(l.productoId);
      if (!p) throw new NotFoundException(`Producto ${l.productoId} no encontrado`);
      if (!p.activo) throw new BadRequestException(`${p.codigo} está inactivo`);
      const precio = p.precios.find((x) => x.listaId === lista.id);
      if (!precio) throw new BadRequestException(`${p.codigo} no tiene precio en la lista «${lista.nombre}»`);
      let unidad = p.unidadBase;
      let factor = '1';
      if (l.presentacionId) {
        const pre = p.presentaciones.find((x) => x.id === l.presentacionId);
        if (!pre) throw new BadRequestException(`La presentación indicada no pertenece a ${p.codigo}`);
        unidad = pre.unidad;
        factor = pre.factor;
      }
      if (!unidad.permiteDecimales && !dec(l.cantidad).isInteger()) {
        throw new BadRequestException(`${p.codigo} se vende por ${unidad.codigo}: la cantidad debe ser un número entero`);
      }
      return {
        productoId: p.id,
        codigo: p.codigo,
        descripcion: p.descripcion,
        presentacionId: l.presentacionId ?? null,
        unidad: unidad.codigo,
        factor: dec(factor).toFixed(6),
        cantidad: dec(l.cantidad).toFixed(3),
        cantidadBase: dec(l.cantidad).times(factor).toDecimalPlaces(3).toFixed(3),
        precioUsd: dec(precio.precioUsd).times(factor).toFixed(4),
        alicuotaIva: p.alicuotaIva,
        costoUsd: p.costoUsd,
      };
    });
  }

  private validarPagos(pagos: { metodo: MetodoPago; referencia?: string }[], vueltoMetodo?: MetodoPago) {
    for (const p of pagos) {
      if (METODOS_PAGO[p.metodo].referencia && !p.referencia?.trim()) {
        throw new BadRequestException(`Indique la referencia del pago por ${METODOS_PAGO[p.metodo].nombre}`);
      }
    }
    if (vueltoMetodo && !METODOS_PAGO[vueltoMetodo].vuelto) {
      throw new BadRequestException(`No se puede dar vuelto por ${METODOS_PAGO[vueltoMetodo].nombre}`);
    }
  }

  /** Totales de la venta que se está armando, sin guardar nada. */
  async cotizar(dto: CotizarVentaDto): Promise<Cotizacion> {
    const m = this.ds.manager;
    const tasa = await this.tasas.vigenteObligatoria(Moneda.USD);
    const config = await this.configuracion.obtenerTodo();
    const lista = await this.lista(m, dto.listaId);
    const lineas = await this.prepararLineas(m, dto.lineas, lista);
    const calculo = calcularVenta(
      lineas,
      dto.pagos,
      { tasa: tasa.valor, alicuotas: config.alicuotasIva, cobraIgtf: config.empresa.contribuyenteEspecial },
      dto.vueltoMetodo ?? MetodoPago.EFECTIVO_BS,
    );
    return {
      ...calculo,
      tasa: { valor: tasa.valor, fechaValor: tasa.fechaValor },
      lista: { id: lista.id, nombre: lista.nombre },
      cobraIgtf: config.empresa.contribuyenteEspecial,
      detalle: lineas.map(({ alicuotaIva: _, ...resto }) => resto),
    };
  }

  async crear(dto: CrearVentaDto, usuario: UsuarioSesion): Promise<Venta> {
    this.validarPagos(dto.pagos, dto.vueltoMetodo);
    const id = await this.ds.transaction(async (m) => {
      const sesion = await this.caja.abiertaDe(m, usuario.id, true);
      if (!sesion) throw new BadRequestException('Abra la caja antes de vender');
      const tasa = await this.tasas.vigenteObligatoria(Moneda.USD);
      const config = await this.configuracion.obtenerTodo();
      const lista = await this.lista(m, dto.listaId);
      const lineas = await this.prepararLineas(m, dto.lineas, lista);
      const vueltoMetodo = dto.vueltoMetodo ?? MetodoPago.EFECTIVO_BS;
      const c = calcularVenta(
        lineas,
        dto.pagos,
        { tasa: tasa.valor, alicuotas: config.alicuotasIva, cobraIgtf: config.empresa.contribuyenteEspecial },
        vueltoMetodo,
      );
      if (dec(c.faltanteBs).gt(0)) throw new BadRequestException(`Faltan Bs ${c.faltanteBs} por cobrar`);
      const creditoBs = c.pagos.filter((p) => p.metodo === MetodoPago.CREDITO).reduce((s, p) => s.plus(p.montoBs), dec(0));
      if (creditoBs.gt(0) && !dto.clienteId) throw new BadRequestException('Para vender a crédito elija el cliente');
      const retencionBs = c.pagos
        .filter((p) => p.metodo === MetodoPago.RETENCION_IVA)
        .reduce((s, p) => s.plus(p.montoBs), dec(0));
      if (retencionBs.gt(0)) {
        if (!dto.clienteId)
          throw new BadRequestException('Para registrar una retención de IVA elija el cliente agente de retención');
        const iva = dec(c.ivaGeneralBs).plus(c.ivaReducidaBs);
        if (retencionBs.gt(iva))
          throw new BadRequestException(
            `La retención (Bs ${retencionBs.toFixed(2)}) supera el IVA de la factura (Bs ${iva.toFixed(2)})`,
          );
      }
      if (creditoBs.gt(0) && dec(c.vueltoBs).gt(0)) {
        throw new BadRequestException('Una venta a crédito no puede dar vuelto: reduzca el monto fiado');
      }

      let cliente: Cliente | null = null;
      if (dto.clienteId) {
        cliente = await m.getRepository(Cliente).findOneBy({ id: dto.clienteId });
        if (!cliente) throw new NotFoundException('Cliente no encontrado');
      }
      const factura = await this.talonarios.asignar(m);
      const hayVuelto = dec(c.vueltoBs).gt(0);

      const venta = await m.save(
        m.create(Venta, {
          sesionId: sesion.id,
          usuarioId: usuario.id,
          clienteId: cliente?.id ?? null,
          clienteDocumento: cliente?.documento ?? null,
          clienteNombre: cliente?.nombre ?? CONSUMIDOR_FINAL,
          clienteDireccion: cliente?.direccion ?? null,
          talonarioId: factura.talonario.id,
          serie: factura.talonario.serie,
          numeroFactura: factura.numero,
          numeroControl: factura.numeroControl,
          tasa: tasa.valor,
          listaId: lista.id,
          baseExentaBs: c.baseExentaBs,
          baseGeneralBs: c.baseGeneralBs,
          ivaGeneralBs: c.ivaGeneralBs,
          baseReducidaBs: c.baseReducidaBs,
          ivaReducidaBs: c.ivaReducidaBs,
          porcentajeGeneral: config.alicuotasIva.GENERAL,
          porcentajeReducida: config.alicuotasIva.REDUCIDA,
          totalBs: c.totalBs,
          baseIgtfBs: c.baseIgtfBs,
          igtfBs: c.igtfBs,
          totalPagarBs: c.totalPagarBs,
          totalPagarUsd: c.totalPagarUsd,
          vueltoMetodo: hayVuelto ? vueltoMetodo : null,
          vueltoMonto: hayVuelto ? c.vueltoMonto : '0.00',
          vueltoBs: c.vueltoBs,
        }),
      );
      await m.save(
        lineas.map((l, i) =>
          m.create(VentaLinea, {
            ventaId: venta.id,
            productoId: l.productoId,
            codigo: l.codigo,
            descripcion: l.descripcion,
            presentacionId: l.presentacionId,
            unidad: l.unidad,
            factor: l.factor,
            cantidad: l.cantidad,
            alicuotaIva: l.alicuotaIva,
            precioUsd: c.lineas[i].precioUsd,
            precioBs: c.lineas[i].precioBs,
            subtotalBs: c.lineas[i].subtotalBs,
            costoUsd: l.costoUsd,
          }),
        ),
      );
      if (creditoBs.gt(0)) {
        await this.cobranza.abrirCuenta(m, venta.id, cliente!.id, redondear(creditoBs.div(tasa.valor), DECIMALES_BS));
      }
      await m.save(
        dto.pagos.map((p, i) =>
          m.create(VentaPago, {
            ventaId: venta.id,
            metodo: p.metodo,
            monto: c.pagos[i].monto,
            montoBs: c.pagos[i].montoBs,
            referencia: p.referencia?.trim() || null,
          }),
        ),
      );

      // Inventario: una salida por producto, en orden de id para evitar bloqueos cruzados.
      const referencia = `Factura ${factura.talonario.serie ? `${factura.talonario.serie}-` : ''}${formatoNumero(factura.talonario, factura.numero)}`;
      for (const [productoId, cantidad] of totalesPorProducto(lineas)) {
        await this.inventario.registrar(m, {
          productoId,
          tipo: TipoMovimiento.VENTA,
          cantidad: cantidad.negated(),
          motivo: 'Venta',
          referencia,
          usuarioId: usuario.id,
        });
      }
      return venta.id;
    });
    return this.detalle(id, usuario);
  }

  /**
   * Anula una venta mientras su caja sigue abierta: la mercancía vuelve al
   * inventario y el número de factura queda como anulado. Después del cierre
   * de caja corresponde una nota de crédito.
   */
  async anular(id: number, dto: AnularVentaDto, usuario: UsuarioSesion): Promise<Venta> {
    await this.ds.transaction(async (m) => {
      // Bloquea la venta y su caja: el cierre de caja no puede cruzarse con la anulación.
      const [fila] = await m.query(`SELECT sesion_id FROM ventas WHERE id = $1 FOR UPDATE`, [id]);
      if (!fila) throw new NotFoundException('Venta no encontrada');
      await m.query(`SELECT 1 FROM sesiones_caja WHERE id = $1 FOR UPDATE`, [fila.sesion_id]);
      const venta = (await m.getRepository(Venta).findOne({ where: { id }, relations: { lineas: true, sesion: true } }))!;
      if (venta.estado === EstadoVenta.ANULADA) throw new BadRequestException('La venta ya está anulada');
      const esGerente = usuario.rol === Rol.ADMIN || usuario.rol === Rol.GERENTE;
      if (!esGerente && venta.usuarioId !== usuario.id) throw new ForbiddenException('Solo puede anular sus propias ventas');
      if (venta.sesion.estado !== EstadoCaja.ABIERTA) {
        throw new BadRequestException('La caja de esta venta ya se cerró: haga una nota de crédito en lugar de anularla');
      }
      venta.estado = EstadoVenta.ANULADA;
      venta.anuladaEn = new Date();
      venta.anuladaPorId = usuario.id;
      venta.motivoAnulacion = dto.motivo.trim();
      await this.cobranza.anularDeVenta(m, id);
      await m.update(
        Venta,
        { id },
        { estado: venta.estado, anuladaEn: venta.anuladaEn, anuladaPorId: usuario.id, motivoAnulacion: venta.motivoAnulacion },
      );
      const lineas = venta.lineas.map((l) => ({
        productoId: l.productoId,
        cantidadBase: dec(l.cantidad).times(l.factor).toFixed(3),
      }));
      for (const [productoId, cantidad] of totalesPorProducto(lineas)) {
        await this.inventario.registrar(m, {
          productoId,
          tipo: TipoMovimiento.DEVOLUCION,
          cantidad,
          motivo: `Anulación: ${venta.motivoAnulacion}`.slice(0, 200),
          referencia:
            `Factura ${venta.serie ? `${venta.serie}-` : ''}${String(venta.numeroFactura).padStart(6, '0')} anulada`.slice(0, 60),
          usuarioId: usuario.id,
        });
      }
    });
    return this.detalle(id, usuario);
  }

  async detalle(id: number, usuario: UsuarioSesion): Promise<Venta> {
    const venta = await this.ds.getRepository(Venta).findOne({
      where: { id },
      relations: { lineas: true, pagos: true, usuario: true, anuladaPor: true, talonario: true },
      order: { lineas: { id: 'ASC' }, pagos: { id: 'ASC' } },
    });
    if (!venta) throw new NotFoundException('Venta no encontrada');
    const esGerente = usuario.rol === Rol.ADMIN || usuario.rol === Rol.GERENTE;
    if (!esGerente && venta.usuarioId !== usuario.id) throw new ForbiddenException('Solo puede ver sus propias ventas');
    return venta;
  }

  async buscar(c: BuscarVentasDto, usuario: UsuarioSesion): Promise<Pagina<Venta>> {
    const pagina = c.pagina ?? 1;
    const porPagina = c.porPagina ?? 50;
    const q = this.ds.getRepository(Venta).createQueryBuilder('v').leftJoinAndSelect('v.usuario', 'u').orderBy('v.id', 'DESC');
    // El cajero solo ve sus ventas.
    if (usuario.rol !== Rol.ADMIN && usuario.rol !== Rol.GERENTE) q.andWhere('v.usuario_id = :yo', { yo: usuario.id });
    if (c.sesionId) q.andWhere('v.sesion_id = :sesion', { sesion: c.sesionId });
    if (c.estado) q.andWhere('v.estado = :estado', { estado: c.estado });
    if (c.desde) q.andWhere(`(v.creado_en AT TIME ZONE '${ZONA_HORARIA}')::date >= :desde`, { desde: c.desde });
    if (c.hasta) q.andWhere(`(v.creado_en AT TIME ZONE '${ZONA_HORARIA}')::date <= :hasta`, { hasta: c.hasta });
    const texto = c.q?.trim();
    if (texto) {
      const numero = /^\d+$/.test(texto) ? Number(texto) : null;
      q.andWhere(
        `(f_normalizar(v.cliente_nombre) LIKE f_normalizar(:t) OR coalesce(v.cliente_documento, '') ILIKE :t${
          numero !== null ? ' OR v.numero_factura = :n' : ''
        })`,
        { t: `%${texto}%`, n: numero },
      );
    }
    const [datos, total] = await q
      .skip((pagina - 1) * porPagina)
      .take(porPagina)
      .getManyAndCount();
    return { datos, total, pagina, porPagina };
  }
}

/** Suma las cantidades base por producto (un producto puede venir en varias líneas o presentaciones). */
function totalesPorProducto(lineas: { productoId: number; cantidadBase: string }[]) {
  const totales = new Map<number, ReturnType<typeof dec>>();
  for (const l of lineas) totales.set(l.productoId, (totales.get(l.productoId) ?? dec(0)).plus(l.cantidadBase));
  return [...totales.entries()].sort(([a], [b]) => a - b);
}
