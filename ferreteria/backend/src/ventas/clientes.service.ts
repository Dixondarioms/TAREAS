import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Pagina } from '../comun/paginacion';
import { validarRif } from '../comun/rif';
import { Cliente } from './entidades/cliente.entity';
import { ActualizarClienteDto, BuscarClientesDto, CrearClienteDto } from './ventas.dto';

function normalizarDocumento(documento: string): string {
  const r = validarRif(documento);
  if (!r.valido) throw new BadRequestException(`Documento inválido: ${r.error}`);
  return r.normalizado!;
}

@Injectable()
export class ClientesService {
  constructor(@InjectRepository(Cliente) private readonly repo: Repository<Cliente>) {}

  async buscar(c: BuscarClientesDto): Promise<Pagina<Cliente>> {
    const pagina = c.pagina ?? 1;
    const porPagina = c.porPagina ?? 50;
    const q = this.repo.createQueryBuilder('c').orderBy('c.nombre', 'ASC').addOrderBy('c.id', 'ASC');
    const texto = c.q?.trim();
    if (texto) {
      // «12345678» encuentra «V-12345678» y «J-12345678-9».
      const digitos = texto.replace(/\D/g, '');
      q.where('f_normalizar(c.nombre) LIKE f_normalizar(:t)', { t: `%${texto}%` });
      if (digitos.length >= 4) q.orWhere(`regexp_replace(c.documento, '\\D', '', 'g') LIKE :d`, { d: `%${digitos}%` });
    }
    const [datos, total] = await q
      .skip((pagina - 1) * porPagina)
      .take(porPagina)
      .getManyAndCount();
    return { datos, total, pagina, porPagina };
  }

  async porDocumento(documento: string): Promise<Cliente> {
    const cliente = await this.repo.findOneBy({ documento: normalizarDocumento(documento) });
    if (!cliente) throw new NotFoundException('Cliente no registrado');
    return cliente;
  }

  async obtener(id: number): Promise<Cliente> {
    const cliente = await this.repo.findOneBy({ id });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');
    return cliente;
  }

  async crear(dto: CrearClienteDto): Promise<Cliente> {
    const documento = normalizarDocumento(dto.documento);
    if (await this.repo.existsBy({ documento }))
      throw new ConflictException(`Ya existe un cliente con el documento ${documento}`);
    return this.repo.save(
      this.repo.create({
        documento,
        nombre: dto.nombre.trim(),
        direccion: dto.direccion?.trim() || null,
        telefono: dto.telefono?.trim() || null,
      }),
    );
  }

  async actualizar(id: number, dto: ActualizarClienteDto): Promise<Cliente> {
    const cliente = await this.obtener(id);
    if (dto.documento !== undefined) {
      const documento = normalizarDocumento(dto.documento);
      const otro = await this.repo.findOneBy({ documento });
      if (otro && otro.id !== id) throw new ConflictException(`Ya existe un cliente con el documento ${documento}`);
      cliente.documento = documento;
    }
    if (dto.nombre !== undefined) cliente.nombre = dto.nombre.trim();
    if (dto.direccion !== undefined) cliente.direccion = dto.direccion?.trim() || null;
    if (dto.telefono !== undefined) cliente.telefono = dto.telefono?.trim() || null;
    return this.repo.save(cliente);
  }
}
