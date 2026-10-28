import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { dec, ModoRedondeo } from '../comun/dinero';
import { validarRif } from '../comun/rif';
import { AlicuotaIva } from '../catalogo/entidades/producto.entity';
import { Parametro } from './parametro.entity';

export interface DatosEmpresa {
  razonSocial: string;
  rif: string;
  direccion: string;
  telefono: string;
  /** Contribuyente especial: agente de percepción del IGTF y de retención de IVA. */
  contribuyenteEspecial: boolean;
}

export interface ReglaRedondeoBs {
  /** Múltiplo al que se redondea el precio en Bs mostrado (0.01 = céntimo). */
  multiplo: string;
  modo: ModoRedondeo;
}

export type AlicuotasIva = Record<AlicuotaIva, string>;

export interface ParametrosSistema {
  empresa: DatosEmpresa;
  redondeoBs: ReglaRedondeoBs;
  alicuotasIva: AlicuotasIva;
}

export const PARAMETROS_POR_DEFECTO: ParametrosSistema = {
  empresa: { razonSocial: 'Mi Ferretería, C.A.', rif: '', direccion: '', telefono: '', contribuyenteEspecial: false },
  redondeoBs: { multiplo: '0.01', modo: 'CERCANO' },
  alicuotasIva: { GENERAL: '16', REDUCIDA: '8', EXENTO: '0' },
};

type Clave = keyof ParametrosSistema;

@Injectable()
export class ConfiguracionService {
  private cache: ParametrosSistema | null = null;

  constructor(@InjectRepository(Parametro) private readonly repo: Repository<Parametro>) {}

  async obtenerTodo(): Promise<ParametrosSistema> {
    if (this.cache) return this.cache;
    const filas = await this.repo.find();
    const resultado = structuredClone(PARAMETROS_POR_DEFECTO);
    for (const fila of filas) {
      if (fila.clave in resultado) {
        const clave = fila.clave as Clave;
        // Mezcla con los valores por defecto para tolerar parámetros nuevos.
        (resultado as Record<Clave, unknown>)[clave] = { ...resultado[clave], ...(fila.valor as object) };
      }
    }
    this.cache = resultado;
    return resultado;
  }

  async obtener<K extends Clave>(clave: K): Promise<ParametrosSistema[K]> {
    return (await this.obtenerTodo())[clave];
  }

  async actualizar(cambios: Partial<ParametrosSistema>): Promise<ParametrosSistema> {
    const actuales = await this.obtenerTodo();
    const nuevos: Partial<ParametrosSistema> = {};
    if (cambios.empresa) nuevos.empresa = this.validarEmpresa({ ...actuales.empresa, ...cambios.empresa });
    if (cambios.redondeoBs) nuevos.redondeoBs = this.validarRedondeo({ ...actuales.redondeoBs, ...cambios.redondeoBs });
    if (cambios.alicuotasIva) nuevos.alicuotasIva = this.validarAlicuotas({ ...actuales.alicuotasIva, ...cambios.alicuotasIva });

    for (const [clave, valor] of Object.entries(nuevos)) {
      await this.repo.save({ clave, valor });
    }
    this.cache = null;
    return this.obtenerTodo();
  }

  /** Para pruebas o cuando otro proceso cambia los parámetros. */
  invalidarCache(): void {
    this.cache = null;
  }

  private validarEmpresa(e: DatosEmpresa): DatosEmpresa {
    if (!e.razonSocial?.trim()) throw new BadRequestException('La razón social es obligatoria');
    let rif = e.rif?.trim() ?? '';
    if (rif) {
      const r = validarRif(rif);
      if (!r.valido) throw new BadRequestException(`RIF de la empresa: ${r.error}`);
      rif = r.normalizado!;
    }
    return {
      razonSocial: e.razonSocial.trim(),
      rif,
      direccion: e.direccion?.trim() ?? '',
      telefono: e.telefono?.trim() ?? '',
      contribuyenteEspecial: Boolean(e.contribuyenteEspecial),
    };
  }

  private validarRedondeo(r: ReglaRedondeoBs): ReglaRedondeoBs {
    let multiplo;
    try {
      multiplo = dec(r.multiplo);
    } catch {
      throw new BadRequestException('Múltiplo de redondeo inválido');
    }
    if (!multiplo.isFinite() || multiplo.lte(0)) throw new BadRequestException('El múltiplo de redondeo debe ser mayor que cero');
    if (r.modo !== 'CERCANO' && r.modo !== 'ARRIBA') throw new BadRequestException('Modo de redondeo inválido');
    return { multiplo: multiplo.toString(), modo: r.modo };
  }

  private validarAlicuotas(a: AlicuotasIva): AlicuotasIva {
    for (const clave of Object.values(AlicuotaIva)) {
      const v = a[clave];
      if (!/^\d+(\.\d{1,2})?$/.test(String(v)) || Number(v) > 100) {
        throw new BadRequestException(`Alícuota de IVA ${clave} inválida`);
      }
    }
    return { GENERAL: String(a.GENERAL), REDUCIDA: String(a.REDUCIDA), EXENTO: String(a.EXENTO) };
  }
}
