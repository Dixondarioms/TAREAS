import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { leerConfiguracion } from '../configuracion-app';
import { ZONA_HORARIA } from '../comun/fechas';
import { TasasService } from './tasas.service';

/** Consulta periódicamente la tasa oficial del BCV (si hay internet). */
@Injectable()
export class ProgramadorTasas implements OnApplicationBootstrap {
  private readonly log = new Logger(ProgramadorTasas.name);
  private readonly activo = leerConfiguracion().bcv.actualizacionAutomatica;

  constructor(private readonly servicio: TasasService) {}

  onApplicationBootstrap(): void {
    if (this.activo) setTimeout(() => void this.ejecutar(), 10_000).unref();
  }

  // Cada 2 horas de 8:00 a 20:00 (hora de Venezuela); el BCV publica en la tarde la tasa del día hábil siguiente.
  @Cron('0 8-20/2 * * *', { timeZone: ZONA_HORARIA })
  async ejecutar(): Promise<void> {
    if (!this.activo) return;
    try {
      const r = await this.servicio.actualizarDesdeBcv();
      if (r.registradas.length) this.log.log(`Tasas BCV registradas para ${r.fechaValor}`);
    } catch (e) {
      this.log.warn(`Actualización automática del BCV falló: ${(e as Error).message}`);
    }
  }
}
