import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { HistorialCosto } from '../catalogo/entidades/historial-costo.entity';
import { AlicuotaIva, Producto } from '../catalogo/entidades/producto.entity';
import { ProductosService } from '../catalogo/productos.service';
import { UsuarioSesion } from '../comun/decoradores';
import { dec, Dec, DECIMALES_BS, DECIMALES_USD, montoIva, redondear } from '../comun/dinero';
import { hoyEnCaracas } from '../comun/fechas';
import { Pagina } from '../comun/paginacion';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { FacturaCompra, TipoDocumentoCompra } from '../fiscal/factura-compra.entity';
import { retenerIva } from '../fiscal/retenciones';
import { InventarioService } from '../inventario/inventario.service';
import { TipoMovimiento } from '../inventario/movimiento-inventario.entity';
import { ProductoProveedor } from '../proveedores/producto-proveedor.entity';
import { Proveedor } from '../proveedores/proveedor.entity';
import { Moneda } from '../tasas/tasa-cambio.entity';
import { TasasService } from '../tasas/tasas.service';
import { ROLES_FIJAN_PRECIOS } from '../usuarios/rol.enum';
import { Compra, CompraLinea, CondicionCompra, EstadoCompra, PagoProveedor } from './compra.entity';
import { BuscarComprasDto, CrearCompraDto, PagoProveedorDto } from './compras.dto';
import { EstadoOrden, OrdenCompra } from './orden-compra.entity';
import { aplicarRecepcion } from './ordenes.service';
import { unidadDeLinea } from './unidades';

const b2 = (v: Dec) => redondear(v, DECIMALES_BS);

export interface CuentaPorPagar {
  id: number;
  proveedor: { id: number; rif: string; razonSocial: string };
  fecha: string;
  numero: string;
  moneda: 'BS' | 'USD';
  total: string;
  saldo: string;
  vencimiento: string;
  /** Días desde el vencimiento (negativo: faltan días). */
  diasVencida: number;
}

export interface ResumenPorPagar {
  cuentas: CuentaPorPagar[];
  totales: { moneda: 'BS' | 'USD'; saldo: string; vencido: string }[];
}

const dias = (desde: string, hasta: string) =>
  Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);

@Injectable()
export class ComprasService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly configuracion: ConfiguracionService,
    private readonly tasas: TasasService,
    private readonly inventario: InventarioService,
    private readonly productos: ProductosService,
  ) {}

  /**
   * Registra la mercancía recibida: entra al inventario, actualiza el costo de
   * reposición (si se pide) y, si es una factura, la anota en el libro de compras.
   */
  async crear(dto: CrearCompraDto, usuario: UsuarioSesion): Promise<Compra> {
    if (dto.actualizarCostos && !ROLES_FIJAN_PRECIOS.includes(usuario.rol)) {
      throw new ForbiddenException('Solo gerencia puede actualizar costos; desmarque «actualizar costos»');
    }
    if (dto.condicion === CondicionCompra.CREDITO && !dto.vencimiento) {
      throw new BadRequestException('Indique la fecha de vencimiento de la compra a crédito');
    }
    if (dto.vencimiento && dto.vencimiento < dto.fecha)
      throw new BadRequestException('El vencimiento es anterior a la fecha de la compra');
    if (dto.facturaFiscal && !dto.numeroControl?.trim()) {
      throw new BadRequestException(
        'Indique el número de control de la factura (o desmarque «factura fiscal» si es nota de entrega)',
      );
    }
    const proveedor = await this.ds.getRepository(Proveedor).findOneBy({ id: dto.proveedorId });
    if (!proveedor) throw new NotFoundException('Proveedor no encontrado');
    const numero = dto.numero.trim();
    if (await this.ds.getRepository(Compra).existsBy({ proveedorId: proveedor.id, numero, estado: EstadoCompra.REGISTRADA })) {
      throw new ConflictException(`Ya se registró el documento ${numero} de ${proveedor.razonSocial}`);
    }
    if (
      dto.facturaFiscal &&
      (await this.ds
        .getRepository(FacturaCompra)
        .existsBy({ proveedorId: proveedor.id, tipo: TipoDocumentoCompra.FACTURA, numero }))
    ) {
      throw new ConflictException(`La factura ${numero} de ${proveedor.razonSocial} ya está en el libro de compras`);
    }

    let tasa = dto.tasa;
    if (!tasa) {
      const vigente = await this.tasas.vigente(Moneda.USD, dto.fecha <= hoyEnCaracas() ? dto.fecha : hoyEnCaracas());
      if (!vigente) throw new BadRequestException('No hay tasa BCV para esa fecha: indíquela en la compra');
      tasa = vigente.valor;
    }
    const { alicuotasIva, empresa } = await this.configuracion.obtenerTodo();

    const id = await this.ds.transaction(async (m) => {
      if (dto.ordenId) {
        const orden = await m.getRepository(OrdenCompra).findOneBy({ id: dto.ordenId });
        if (!orden) throw new NotFoundException('Orden de compra no encontrada');
        if (orden.proveedorId !== proveedor.id) throw new BadRequestException('La orden de compra es de otro proveedor');
        if (orden.estado !== EstadoOrden.PENDIENTE && orden.estado !== EstadoOrden.PARCIAL) {
          throw new ConflictException(`La orden de compra N° ${orden.id} ya está ${orden.estado.toLowerCase()}`);
        }
      }
      const ids = [...new Set(dto.lineas.map((l) => l.productoId))];
      const productos = await m.getRepository(Producto).find({
        where: { id: In(ids) },
        relations: { unidadBase: true, presentaciones: { unidad: true } },
      });
      const porId = new Map(productos.map((p) => [p.id, p]));

      const bases: Record<AlicuotaIva, Dec> = { EXENTO: dec(0), GENERAL: dec(0), REDUCIDA: dec(0) };
      const lineas = dto.lineas.map((l) => {
        const p = porId.get(l.productoId);
        if (!p) throw new NotFoundException(`Producto ${l.productoId} no encontrado`);
        const { unidad, factor } = unidadDeLinea(p, l.presentacionId, l.cantidad);
        const subtotal = b2(dec(l.costoUnitario).times(l.cantidad));
        bases[p.alicuotaIva] = bases[p.alicuotaIva].plus(subtotal);
        return { l, p, unidad, factor, subtotal };
      });
      const ivaGeneral = b2(montoIva(bases.GENERAL, alicuotasIva.GENERAL));
      const ivaReducida = b2(montoIva(bases.REDUCIDA, alicuotasIva.REDUCIDA));
      const subtotal = bases.EXENTO.plus(bases.GENERAL).plus(bases.REDUCIDA);
      const iva = ivaGeneral.plus(ivaReducida);
      const total = subtotal.plus(iva);

      // Libro de compras: siempre en bolívares.
      let facturaCompraId: number | null = null;
      let retencion = dec(0);
      if (dto.facturaFiscal) {
        const aBs = (v: Dec) => (dto.moneda === 'USD' ? b2(v.times(tasa)) : v);
        const baseGeneralBs = aBs(bases.GENERAL);
        const baseReducidaBs = aBs(bases.REDUCIDA);
        const exentoBs = aBs(bases.EXENTO);
        const ivaGeneralBs = b2(montoIva(baseGeneralBs, alicuotasIva.GENERAL));
        const ivaReducidaBs = b2(montoIva(baseReducidaBs, alicuotasIva.REDUCIDA));
        const factura = m.create(FacturaCompra, {
          proveedorId: proveedor.id,
          tipo: TipoDocumentoCompra.FACTURA,
          fecha: dto.fecha,
          numero,
          numeroControl: dto.numeroControl!.trim(),
          baseExentaBs: exentoBs.toFixed(2),
          baseGeneralBs: baseGeneralBs.toFixed(2),
          ivaGeneralBs: ivaGeneralBs.toFixed(2),
          baseReducidaBs: baseReducidaBs.toFixed(2),
          ivaReducidaBs: ivaReducidaBs.toFixed(2),
          totalBs: exentoBs.plus(baseGeneralBs).plus(ivaGeneralBs).plus(baseReducidaBs).plus(ivaReducidaBs).toFixed(2),
          notas: 'Registrada desde Compras',
          usuarioId: usuario.id,
        });
        await retenerIva(m, factura, empresa.contribuyenteEspecial, dto.porcentajeRetencion ?? 75);
        await m.save(factura);
        facturaCompraId = factura.id;
        // Lo retenido se le paga al SENIAT, no al proveedor: sale de la deuda, en la moneda de la compra.
        retencion = dto.moneda === 'USD' ? b2(dec(factura.ivaRetenidoBs).div(tasa)) : dec(factura.ivaRetenidoBs);
      }

      const compra = await m.save(
        m.create(Compra, {
          proveedorId: proveedor.id,
          fecha: dto.fecha,
          numero,
          numeroControl: dto.numeroControl?.trim() || null,
          moneda: dto.moneda,
          tasa: dec(tasa).toFixed(8),
          subtotal: subtotal.toFixed(2),
          iva: iva.toFixed(2),
          total: total.toFixed(2),
          condicion: dto.condicion,
          vencimiento: dto.vencimiento ?? dto.fecha,
          retencionIva: retencion.toFixed(2),
          saldo: total.minus(retencion).toFixed(2),
          actualizoCostos: dto.actualizarCostos,
          ordenId: dto.ordenId ?? null,
          facturaCompraId,
          notas: dto.notas?.trim() || null,
          usuarioId: usuario.id,
        }),
      );
      await m.save(
        lineas.map(({ l, p, unidad, factor, subtotal: s }) =>
          m.create(CompraLinea, {
            compraId: compra.id,
            productoId: p.id,
            codigo: p.codigo,
            descripcion: p.descripcion,
            presentacionId: l.presentacionId ?? null,
            unidad,
            factor: dec(factor).toFixed(6),
            cantidad: dec(l.cantidad).toFixed(3),
            costoUnitario: dec(l.costoUnitario).toFixed(4),
            alicuotaIva: p.alicuotaIva,
            subtotal: s.toFixed(2),
          }),
        ),
      );

      // Costo por unidad base en USD; si un producto viene en varias líneas, rige la última.
      const costos = new Map<number, Dec>();
      const entradas = new Map<number, Dec>();
      for (const { l, p, factor } of lineas) {
        const enMoneda = dec(l.costoUnitario).div(factor);
        costos.set(p.id, redondear(dto.moneda === 'USD' ? enMoneda : enMoneda.div(tasa), DECIMALES_USD));
        entradas.set(p.id, (entradas.get(p.id) ?? dec(0)).plus(dec(l.cantidad).times(factor)));
      }
      const referencia = `Compra ${numero} ${proveedor.razonSocial}`.slice(0, 60);
      for (const productoId of [...costos.keys()].sort((a, b) => a - b)) {
        const p = porId.get(productoId)!;
        const costo = costos.get(productoId)!;
        await m.upsert(ProductoProveedor, { productoId, proveedorId: proveedor.id, costoUsd: costo.toFixed(DECIMALES_USD) }, [
          'productoId',
          'proveedorId',
        ]);
        if (dto.actualizarCostos && !costo.eq(p.costoUsd)) {
          await m.insert(HistorialCosto, {
            productoId,
            costoAnterior: p.costoUsd,
            costoNuevo: costo.toFixed(DECIMALES_USD),
            motivo: referencia,
            usuarioId: usuario.id,
          });
          await m.update(
            Producto,
            { id: productoId },
            { costoUsd: costo.toFixed(DECIMALES_USD), costoActualizadoEn: new Date() },
          );
          await this.productos.recalcularPreciosPorCosto(m, { id: productoId, costoUsd: costo.toFixed(DECIMALES_USD) });
        }
        await this.inventario.registrar(m, {
          productoId,
          tipo: TipoMovimiento.COMPRA,
          cantidad: entradas.get(productoId)!.toDecimalPlaces(3),
          motivo: 'Compra a proveedor',
          referencia,
          usuarioId: usuario.id,
        });
      }
      if (dto.ordenId) {
        await aplicarRecepcion(
          m,
          dto.ordenId,
          dto.lineas.map((l) => ({ productoId: l.productoId, presentacionId: l.presentacionId ?? null, cantidad: l.cantidad })),
          1,
        );
      }
      return compra.id;
    });
    return this.detalle(id);
  }

  /**
   * Anula una compra registrada por error: saca del inventario lo que entró,
   * devuelve el costo anterior (si nadie lo cambió después), la quita del libro
   * de compras y descuenta lo recibido en su orden. No se puede si ya tiene
   * pagos, si su comprobante de retención no es el último del mes en curso o
   * si la mercancía ya salió del inventario.
   */
  async anular(id: number, motivo: string, usuario: UsuarioSesion): Promise<Compra> {
    await this.ds.transaction(async (m) => {
      const compra = await m.getRepository(Compra).findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!compra) throw new NotFoundException('Compra no encontrada');
      if (compra.estado === EstadoCompra.ANULADA) throw new ConflictException('La compra ya está anulada');
      if (await m.getRepository(PagoProveedor).existsBy({ compraId: id })) {
        throw new BadRequestException('La compra tiene pagos registrados: no se puede anular');
      }
      const proveedor = await m.getRepository(Proveedor).findOneByOrFail({ id: compra.proveedorId });
      const lineas = await m.getRepository(CompraLinea).find({ where: { compraId: id }, order: { id: 'ASC' } });

      if (compra.facturaCompraId) {
        const factura = await m.getRepository(FacturaCompra).findOneByOrFail({ id: compra.facturaCompraId });
        if (factura.numeroComprobante) {
          // Solo se libera el último número del mes en curso: anular otro dejaría un salto en el correlativo.
          await m.query(`SELECT pg_advisory_xact_lock(hashtext('comprobantes_retencion_iva'))`);
          const periodo = factura.numeroComprobante.slice(0, 6);
          const [{ ultimo }] = await m.query(
            `SELECT max(numero_comprobante) AS ultimo FROM facturas_compra WHERE numero_comprobante LIKE $1`,
            [`${periodo}%`],
          );
          if (periodo !== hoyEnCaracas().slice(0, 7).replace('-', '') || ultimo !== factura.numeroComprobante) {
            throw new BadRequestException(
              `Ya se emitió el comprobante de retención ${factura.numeroComprobante} y no es el último del mes: registre la nota de crédito del proveedor en lugar de anular`,
            );
          }
        }
      }

      const referencia = `Compra ${compra.numero} ${proveedor.razonSocial}`.slice(0, 60);
      const salidas = new Map<number, Dec>();
      for (const l of lineas)
        salidas.set(l.productoId, (salidas.get(l.productoId) ?? dec(0)).plus(dec(l.cantidad).times(l.factor)));
      for (const productoId of [...salidas.keys()].sort((a, b) => a - b)) {
        try {
          await this.inventario.registrar(m, {
            productoId,
            tipo: TipoMovimiento.SALIDA,
            cantidad: salidas.get(productoId)!.toDecimalPlaces(3).negated(),
            motivo: `Anulación de compra: ${motivo.trim()}`.slice(0, 200),
            referencia,
            usuarioId: usuario.id,
          });
        } catch (e) {
          if (e instanceof BadRequestException) {
            throw new BadRequestException(`No se puede anular: ${e.message}. Parte de la mercancía ya salió del inventario.`);
          }
          throw e;
        }
        if (!compra.actualizoCostos) continue;
        // Se revierte el costo solo si el último cambio fue el de esta compra.
        const ultimo = await m.getRepository(HistorialCosto).findOne({ where: { productoId }, order: { id: 'DESC' } });
        const producto = await m.getRepository(Producto).findOneByOrFail({ id: productoId });
        if (ultimo && ultimo.motivo === referencia && dec(ultimo.costoNuevo).eq(producto.costoUsd)) {
          await m.insert(HistorialCosto, {
            productoId,
            costoAnterior: producto.costoUsd,
            costoNuevo: ultimo.costoAnterior,
            motivo: `Anulación ${referencia}`.slice(0, 200),
            usuarioId: usuario.id,
          });
          await m.update(Producto, { id: productoId }, { costoUsd: ultimo.costoAnterior, costoActualizadoEn: new Date() });
          await this.productos.recalcularPreciosPorCosto(m, { id: productoId, costoUsd: ultimo.costoAnterior });
        }
      }

      if (compra.ordenId) {
        await aplicarRecepcion(
          m,
          compra.ordenId,
          lineas.map((l) => ({ productoId: l.productoId, presentacionId: l.presentacionId, cantidad: l.cantidad })),
          -1,
        );
      }
      await m.update(
        Compra,
        { id },
        {
          estado: EstadoCompra.ANULADA,
          anuladaEn: new Date(),
          motivoAnulacion: motivo.trim(),
          saldo: '0.00',
          facturaCompraId: null,
        },
      );
      if (compra.facturaCompraId) await m.delete(FacturaCompra, { id: compra.facturaCompraId });
    });
    return this.detalle(id);
  }

  async pagar(id: number, dto: PagoProveedorDto, usuario: UsuarioSesion): Promise<Compra> {
    await this.ds.transaction(async (m) => {
      const compra = await m.getRepository(Compra).findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!compra) throw new NotFoundException('Compra no encontrada');
      if (compra.estado === EstadoCompra.ANULADA) throw new ConflictException('La compra está anulada');
      if (dec(dto.monto).gt(compra.saldo)) {
        throw new BadRequestException(
          `El pago supera el saldo pendiente (${compra.moneda === 'USD' ? '$' : 'Bs'} ${compra.saldo})`,
        );
      }
      await m.save(
        m.create(PagoProveedor, {
          compraId: id,
          fecha: dto.fecha,
          metodo: dto.metodo,
          monto: dec(dto.monto).toFixed(2),
          referencia: dto.referencia?.trim() || null,
          usuarioId: usuario.id,
        }),
      );
      await m.update(Compra, { id }, { saldo: dec(compra.saldo).minus(dto.monto).toFixed(2) });
    });
    return this.detalle(id);
  }

  async detalle(id: number): Promise<Compra> {
    const compra = await this.ds.getRepository(Compra).findOne({
      where: { id },
      relations: { proveedor: true, lineas: true, pagos: { usuario: true }, usuario: true, orden: true },
      order: { lineas: { id: 'ASC' }, pagos: { id: 'ASC' } },
    });
    if (!compra) throw new NotFoundException('Compra no encontrada');
    return compra;
  }

  async buscar(c: BuscarComprasDto): Promise<Pagina<Compra>> {
    const pagina = c.pagina ?? 1;
    const porPagina = c.porPagina ?? 50;
    const q = this.ds
      .getRepository(Compra)
      .createQueryBuilder('c')
      .innerJoinAndSelect('c.proveedor', 'p')
      .orderBy('c.fecha', 'DESC')
      .addOrderBy('c.id', 'DESC');
    if (c.proveedorId) q.andWhere('c.proveedor_id = :prov', { prov: c.proveedorId });
    if (c.pago === 'pendientes') q.andWhere('c.saldo > 0');
    if (c.pago === 'anuladas') q.andWhere(`c.estado = 'ANULADA'`);
    if (c.pago === 'pagadas') q.andWhere(`c.saldo = 0 AND c.estado = 'REGISTRADA'`);
    const texto = c.q?.trim();
    if (texto) q.andWhere('(c.numero ILIKE :t OR f_normalizar(p.razon_social) LIKE f_normalizar(:t))', { t: `%${texto}%` });
    const [datos, total] = await q
      .skip((pagina - 1) * porPagina)
      .take(porPagina)
      .getManyAndCount();
    return { datos, total, pagina, porPagina };
  }

  /** Cuentas por pagar: compras con saldo, de la más vencida a la que vence más tarde. */
  async porPagar(): Promise<ResumenPorPagar> {
    const compras = await this.ds
      .getRepository(Compra)
      .createQueryBuilder('c')
      .innerJoinAndSelect('c.proveedor', 'p')
      .where('c.saldo > 0')
      .orderBy('c.vencimiento', 'ASC')
      .addOrderBy('c.id', 'ASC')
      .getMany();
    const hoy = hoyEnCaracas();
    const cuentas = compras.map((c): CuentaPorPagar => ({
      id: c.id,
      proveedor: { id: c.proveedor.id, rif: c.proveedor.rif, razonSocial: c.proveedor.razonSocial },
      fecha: c.fecha,
      numero: c.numero,
      moneda: c.moneda,
      total: c.total,
      saldo: c.saldo,
      vencimiento: c.vencimiento ?? c.fecha,
      diasVencida: dias(c.vencimiento ?? c.fecha, hoy),
    }));
    const totales = (['USD', 'BS'] as const)
      .map((moneda) => {
        const deMoneda = cuentas.filter((x) => x.moneda === moneda);
        return {
          moneda,
          saldo: deMoneda.reduce((s, x) => s.plus(x.saldo), dec(0)).toFixed(2),
          vencido: deMoneda
            .filter((x) => x.diasVencida > 0)
            .reduce((s, x) => s.plus(x.saldo), dec(0))
            .toFixed(2),
        };
      })
      .filter((t) => Number(t.saldo) > 0);
    return { cuentas, totales };
  }
}
