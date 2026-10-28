import { BadGatewayException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { leerConfiguracion } from '../configuracion-app';
import { dec, DECIMALES_TASA } from '../comun/dinero';
import { hoyEnCaracas } from '../comun/fechas';
import { ClienteBcv } from './bcv.cliente';
import { FuenteTasa, Moneda, TasaCambio } from './tasa-cambio.entity';

/** Una variación mayor a esta frente a la tasa vigente se considera un error de lectura del BCV. */
const VARIACION_MAXIMA_AUTOMATICA = 0.5;

export interface ResultadoActualizacionBcv {
  fechaValor: string;
  registradas: TasaCambio[];
  sinCambios: Moneda[];
}

@Injectable()
export class TasasService {
  private readonly log = new Logger(TasasService.name);

  constructor(
    @InjectRepository(TasaCambio) private readonly repo: Repository<TasaCambio>,
    private readonly bcv: ClienteBcv,
  ) {}

  /** Tasa que rige en una fecha: la de fecha valor más reciente que no sea posterior, y entre ellas la última cargada. */
  async vigente(moneda: Moneda = Moneda.USD, fecha: string = hoyEnCaracas()): Promise<TasaCambio | null> {
    return this.repo.findOne({
      where: { moneda, fechaValor: LessThanOrEqual(fecha) },
      order: { fechaValor: 'DESC', creadoEn: 'DESC', id: 'DESC' },
    });
  }

  async vigenteObligatoria(moneda: Moneda = Moneda.USD): Promise<TasaCambio> {
    const tasa = await this.vigente(moneda);
    if (!tasa) throw new NotFoundException(`No hay tasa ${moneda} registrada. Cárguela en "Tasa de cambio".`);
    return tasa;
  }

  async estado() {
    const hoy = hoyEnCaracas();
    const resultado: Record<string, unknown> = { hoy };
    for (const moneda of Object.values(Moneda)) {
      const tasa = await this.vigente(moneda, hoy);
      const proxima = await this.repo
        .createQueryBuilder('t')
        .where('t.moneda = :moneda AND t.fechaValor > :hoy', { moneda, hoy })
        .orderBy('t.fechaValor', 'ASC')
        .addOrderBy('t.creadoEn', 'DESC')
        .getOne();
      resultado[moneda] = {
        vigente: tasa,
        diasDesdeFechaValor: tasa ? Math.round((Date.parse(hoy) - Date.parse(tasa.fechaValor)) / 86_400_000) : null,
        proxima,
      };
    }
    return resultado;
  }

  historial(moneda: Moneda, limite = 60): Promise<TasaCambio[]> {
    return this.repo.find({
      where: { moneda },
      order: { fechaValor: 'DESC', creadoEn: 'DESC' },
      take: Math.min(limite, 500),
      relations: { creadoPor: true },
    });
  }

  async registrarManual(moneda: Moneda, valor: string, fechaValor: string, usuarioId: number): Promise<TasaCambio> {
    return this.repo.save(
      this.repo.create({
        moneda,
        valor: dec(valor).toFixed(DECIMALES_TASA),
        fechaValor,
        fuente: FuenteTasa.MANUAL,
        creadoPorId: usuarioId,
      }),
    );
  }

  async actualizarDesdeBcv(usuarioId: number | null = null): Promise<ResultadoActualizacionBcv> {
    let publicadas;
    try {
      publicadas = await this.bcv.consultar(leerConfiguracion().bcv.url);
    } catch (e) {
      throw new BadGatewayException(`No se pudo consultar el BCV: ${(e as Error).message}. Puede cargar la tasa manualmente.`);
    }

    const registradas: TasaCambio[] = [];
    const sinCambios: Moneda[] = [];
    for (const [moneda, valor] of Object.entries(publicadas.tasas) as [Moneda, string][]) {
      const existente = await this.repo.findOne({
        where: { moneda, fechaValor: publicadas.fechaValor },
        order: { creadoEn: 'DESC', id: 'DESC' },
      });
      if (existente && dec(existente.valor).eq(valor)) {
        sinCambios.push(moneda);
        continue;
      }
      const anterior = await this.vigente(moneda, publicadas.fechaValor);
      if (anterior) {
        const variacion = dec(valor).minus(anterior.valor).abs().div(anterior.valor);
        if (variacion.gt(VARIACION_MAXIMA_AUTOMATICA)) {
          this.log.error(`Tasa ${moneda} del BCV (${valor}) varía más de 50% respecto a ${anterior.valor}; no se registró.`);
          continue;
        }
      }
      registradas.push(
        await this.repo.save(
          this.repo.create({ moneda, valor, fechaValor: publicadas.fechaValor, fuente: FuenteTasa.BCV, creadoPorId: usuarioId }),
        ),
      );
    }
    return { fechaValor: publicadas.fechaValor, registradas, sinCambios };
  }
}
