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
import { InventarioService } from '../inventario/inventario.service';
import { TipoMovimiento } from '../inventario/movimiento-inventario.entity';
import { ProductoProveedor } from '../proveedores/producto-proveedor.entity';
import { Proveedor } from '../proveedores/proveedor.entity';
import { Moneda } from '../tasas/tasa-cambio.entity';
import { TasasService } from '../tasas/tasas.service';
import { ROLES_FIJAN_PRECIOS } from '../usuarios/rol.enum';
import { Compra, CompraLinea, CondicionCompra, PagoProveedor } from './compra.entity';
import { BuscarComprasDto, CrearCompraDto, PagoProveedorDto } from './compras.dto';

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
    if (await this.ds.getRepository(Compra).existsBy({ proveedorId: proveedor.id, numero })) {
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
    const { alicuotasIva } = await this.configuracion.obtenerTodo();

    const id = await this.ds.transaction(async (m) => {
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
        let unidad = p.unidadBase;
        let factor = '1';
        if (l.presentacionId) {
          const pre = p.presentaciones.find((x) => x.id === l.presentacionId);
          if (!pre) throw new BadRequestException(`La presentación indicada no pertenece a ${p.codigo}`);
          unidad = pre.unidad;
          factor = pre.factor;
        }
        if (!unidad.permiteDecimales && !dec(l.cantidad).isInteger()) {
          throw new BadRequestException(`${p.codigo} se recibe por ${unidad.codigo}: la cantidad debe ser un número entero`);
        }
        const subtotal = b2(dec(l.costoUnitario).times(l.cantidad));
        bases[p.alicuotaIva] = bases[p.alicuotaIva].plus(subtotal);
        return { l, p, unidad: unidad.codigo, factor, subtotal };
      });
      const ivaGeneral = b2(montoIva(bases.GENERAL, alicuotasIva.GENERAL));
      const ivaReducida = b2(montoIva(bases.REDUCIDA, alicuotasIva.REDUCIDA));
      const subtotal = bases.EXENTO.plus(bases.GENERAL).plus(bases.REDUCIDA);
      const iva = ivaGeneral.plus(ivaReducida);
      const total = subtotal.plus(iva);

      // Libro de compras: siempre en bolívares.
      let facturaCompraId: number | null = null;
      if (dto.facturaFiscal) {
        const aBs = (v: Dec) => (dto.moneda === 'USD' ? b2(v.times(tasa)) : v);
        const baseGeneralBs = aBs(bases.GENERAL);
        const baseReducidaBs = aBs(bases.REDUCIDA);
        const exentoBs = aBs(bases.EXENTO);
        const ivaGeneralBs = b2(montoIva(baseGeneralBs, alicuotasIva.GENERAL));
        const ivaReducidaBs = b2(montoIva(baseReducidaBs, alicuotasIva.REDUCIDA));
        const factura = await m.save(
          m.create(FacturaCompra, {
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
          }),
        );
        facturaCompraId = factura.id;
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
          saldo: total.toFixed(2),
          actualizoCostos: dto.actualizarCostos,
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
      return compra.id;
    });
    return this.detalle(id);
  }

  async pagar(id: number, dto: PagoProveedorDto, usuario: UsuarioSesion): Promise<Compra> {
    await this.ds.transaction(async (m) => {
      const compra = await m.getRepository(Compra).findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!compra) throw new NotFoundException('Compra no encontrada');
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
      relations: { proveedor: true, lineas: true, pagos: { usuario: true }, usuario: true },
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
    if (c.pago === 'pagadas') q.andWhere('c.saldo = 0');
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
