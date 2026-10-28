import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Pagina } from '../comun/paginacion';
import { validarRif } from '../comun/rif';
import { conUnicidad } from '../catalogo/catalogo-basico.service';
import { Proveedor } from './proveedor.entity';
import { ActualizarProveedorDto, BuscarProveedoresDto, CrearProveedorDto } from './proveedores.dto';

const vacioANulo = (v?: string | null) => (v?.trim() ? v.trim() : null);

@Injectable()
export class ProveedoresService {
  constructor(@InjectRepository(Proveedor) private readonly repo: Repository<Proveedor>) {}

  async buscar(c: BuscarProveedoresDto): Promise<Pagina<Proveedor>> {
    const qb = this.repo.createQueryBuilder('p').orderBy('p.razonSocial', 'ASC');
    if (c.q?.trim()) {
      const patron = `%${c.q.trim().replace(/[\\%_]/g, (x) => `\\${x}`)}%`;
      qb.where(
        "(f_normalizar(p.razon_social) LIKE f_normalizar(:patron) OR p.rif ILIKE :patron OR replace(p.rif, '-', '') ILIKE :patron)",
        {
          patron,
        },
      );
    }
    const [datos, total] = await qb
      .skip((c.pagina - 1) * c.porPagina)
      .take(c.porPagina)
      .getManyAndCount();
    return { datos, total, pagina: c.pagina, porPagina: c.porPagina };
  }

  async obtener(id: number): Promise<Proveedor> {
    const p = await this.repo.findOneBy({ id });
    if (!p) throw new NotFoundException('Proveedor no encontrado');
    return p;
  }

  crear(dto: CrearProveedorDto): Promise<Proveedor> {
    return conUnicidad(
      () =>
        this.repo.save(
          this.repo.create({
            rif: validarRif(dto.rif).normalizado!,
            razonSocial: dto.razonSocial.trim(),
            contacto: vacioANulo(dto.contacto),
            telefono: vacioANulo(dto.telefono),
            correo: vacioANulo(dto.correo),
            direccion: vacioANulo(dto.direccion),
            notas: vacioANulo(dto.notas),
            activo: dto.activo ?? true,
          }),
        ),
      'Ya existe un proveedor con ese RIF',
    );
  }

  async actualizar(id: number, dto: ActualizarProveedorDto): Promise<Proveedor> {
    const p = await this.obtener(id);
    if (dto.rif !== undefined) p.rif = validarRif(dto.rif).normalizado!;
    if (dto.razonSocial !== undefined) p.razonSocial = dto.razonSocial.trim();
    for (const campo of ['contacto', 'telefono', 'correo', 'direccion', 'notas'] as const) {
      if (dto[campo] !== undefined) p[campo] = vacioANulo(dto[campo]);
    }
    if (dto.activo !== undefined) p.activo = dto.activo;
    return conUnicidad(() => this.repo.save(p), 'Ya existe un proveedor con ese RIF');
  }
}
