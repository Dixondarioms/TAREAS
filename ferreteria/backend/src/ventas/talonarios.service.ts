import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { UsuarioSesion } from '../comun/decoradores';
import { FacturaAnulada } from './entidades/factura-anulada.entity';
import { Talonario } from './entidades/talonario.entity';
import { AnularNumeroDto, CrearTalonarioDto } from './ventas.dto';

/** Se avisa cuando quedan estas facturas o menos en los talonarios activos. */
export const AVISO_POCAS_FACTURAS = 10;

export interface NumeroAsignado {
  talonario: Talonario;
  numero: number;
  numeroControl: string;
}

export interface TalonarioListado extends Talonario {
  restantes: number;
}

export interface EstadoFacturacion {
  /** Próxima factura que se usará, o null si no hay talonario disponible. */
  proxima: { talonarioId: number; serie: string; numero: string; numeroControl: string } | null;
  restantes: number;
  pocas: boolean;
}

const rellenar = (n: number, digitos: number) => String(n).padStart(digitos, '0');

export function formatoNumero(t: Pick<Talonario, 'digitos'>, numero: number): string {
  return rellenar(numero, t.digitos);
}

export function numeroDeControl(
  t: Pick<Talonario, 'controlPrefijo' | 'controlDesde' | 'numeroDesde' | 'digitos'>,
  numero: number,
) {
  return `${t.controlPrefijo}${rellenar(t.controlDesde + (numero - t.numeroDesde), t.digitos)}`;
}

@Injectable()
export class TalonariosService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async listar(): Promise<TalonarioListado[]> {
    const talonarios = await this.ds.getRepository(Talonario).find({ order: { id: 'DESC' } });
    return talonarios.map((t) => ({ ...t, restantes: Math.max(0, t.numeroHasta - t.siguiente + 1) }));
  }

  async estado(): Promise<EstadoFacturacion> {
    const disponibles = await this.disponibles(this.ds.manager, false);
    const restantes = disponibles.reduce((s, t) => s + t.numeroHasta - t.siguiente + 1, 0);
    const t = disponibles[0];
    return {
      proxima: t
        ? {
            talonarioId: t.id,
            serie: t.serie,
            numero: formatoNumero(t, t.siguiente),
            numeroControl: numeroDeControl(t, t.siguiente),
          }
        : null,
      restantes,
      pocas: restantes <= AVISO_POCAS_FACTURAS,
    };
  }

  async crear(dto: CrearTalonarioDto, usuario: UsuarioSesion): Promise<Talonario> {
    if (dto.numeroHasta < dto.numeroDesde) throw new BadRequestException('El número final es menor que el inicial');
    if (dto.numeroHasta - dto.numeroDesde >= 100_000)
      throw new BadRequestException('Un talonario no puede tener más de 100.000 facturas');
    const serie = (dto.serie ?? '').trim().toUpperCase();
    const solapado = await this.ds
      .getRepository(Talonario)
      .createQueryBuilder('t')
      .where('t.serie = :serie AND t.numero_desde <= :hasta AND t.numero_hasta >= :desde', {
        serie,
        desde: dto.numeroDesde,
        hasta: dto.numeroHasta,
      })
      .getOne();
    if (solapado) {
      throw new ConflictException(
        `Los números se cruzan con el talonario ${serie ? `serie ${serie} ` : ''}del ${solapado.numeroDesde} al ${solapado.numeroHasta}`,
      );
    }
    return this.ds.getRepository(Talonario).save({
      serie,
      numeroDesde: dto.numeroDesde,
      numeroHasta: dto.numeroHasta,
      controlPrefijo: dto.controlPrefijo?.trim() ?? '00-',
      controlDesde: dto.controlDesde,
      digitos: dto.digitos ?? 6,
      siguiente: dto.numeroDesde,
      activo: true,
      creadoPorId: usuario.id,
    });
  }

  /** Retira un talonario (perdido o reemplazado): ya no se usarán sus números. */
  async desactivar(id: number): Promise<Talonario> {
    const repo = this.ds.getRepository(Talonario);
    const t = await repo.findOneBy({ id });
    if (!t) throw new NotFoundException('Talonario no encontrado');
    t.activo = false;
    return repo.save(t);
  }

  /** Talonarios activos con números libres, del más antiguo al más nuevo. */
  private disponibles(m: EntityManager, bloquear: boolean): Promise<Talonario[]> {
    const q = m
      .getRepository(Talonario)
      .createQueryBuilder('t')
      .where('t.activo AND t.siguiente <= t.numero_hasta')
      .orderBy('t.id', 'ASC');
    if (bloquear) q.setLock('pessimistic_write');
    return q.getMany();
  }

  /**
   * Toma el siguiente número del talonario en uso, dentro de la transacción
   * de la venta. El bloqueo evita que dos cajas usen el mismo número.
   */
  async asignar(m: EntityManager): Promise<NumeroAsignado> {
    const [t] = await this.disponibles(m, true);
    if (!t) {
      throw new BadRequestException('No hay facturas disponibles: registre un talonario nuevo en Facturación antes de vender');
    }
    const numero = t.siguiente;
    await m.update(Talonario, { id: t.id }, { siguiente: numero + 1 });
    return { talonario: t, numero, numeroControl: numeroDeControl(t, numero) };
  }

  /** Anula la próxima hoja del talonario (se dañó o se llenó mal): su número queda usado. */
  anularSiguiente(dto: AnularNumeroDto, usuario: UsuarioSesion): Promise<FacturaAnulada> {
    return this.ds.transaction(async (m) => {
      const { talonario, numero, numeroControl } = await this.asignar(m);
      return m.save(
        m.create(FacturaAnulada, {
          talonarioId: talonario.id,
          numero,
          numeroControl,
          motivo: dto.motivo.trim(),
          usuarioId: usuario.id,
        }),
      );
    });
  }

  anuladas(): Promise<FacturaAnulada[]> {
    return this.ds.getRepository(FacturaAnulada).find({ relations: { usuario: true }, order: { id: 'DESC' }, take: 200 });
  }
}
