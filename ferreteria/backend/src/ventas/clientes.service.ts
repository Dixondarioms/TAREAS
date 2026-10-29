import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsuarioSesion } from '../comun/decoradores';
import { dec } from '../comun/dinero';
import { Pagina } from '../comun/paginacion';
import { validarRif } from '../comun/rif';
import { Rol } from '../usuarios/rol.enum';
import { Cliente } from './entidades/cliente.entity';
import { ActualizarClienteDto, BuscarClientesDto, CrearClienteDto } from './ventas.dto';

function normalizarDocumento(documento: string): string {
  // En el mostrador se suele dictar solo el número de cédula: «14555666» es V-14555666.
  const soloNumeros = documento.trim().replace(/[.\s]/g, '');
  const r = validarRif(/^\d{5,8}$/.test(soloNumeros) ? `V${soloNumeros}` : documento);
  if (!r.valido) throw new BadRequestException(`Documento inválido: ${r.error}`);
  return r.normalizado!;
}

/** Solo gerencia decide quién compra a crédito y cuánto. */
function validarCredito(dto: { limiteCreditoUsd?: string; diasCredito?: number }, usuario: UsuarioSesion) {
  const cambia = dto.limiteCreditoUsd !== undefined || dto.diasCredito !== undefined;
  if (cambia && usuario.rol !== Rol.ADMIN && usuario.rol !== Rol.GERENTE) {
    throw new ForbiddenException('Solo gerencia puede asignar crédito a un cliente');
  }
}

export type ClienteListado = Cliente & { saldoUsd: string };

@Injectable()
export class ClientesService {
  constructor(@InjectRepository(Cliente) private readonly repo: Repository<Cliente>) {}

  async buscar(c: BuscarClientesDto): Promise<Pagina<ClienteListado>> {
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
    const [clientes, total] = await q
      .skip((pagina - 1) * porPagina)
      .take(porPagina)
      .getManyAndCount();
    const saldos: { cliente_id: number; saldo: string }[] = clientes.length
      ? await this.repo.query(
          `SELECT cliente_id, sum(saldo_usd) AS saldo FROM cuentas_cobrar WHERE cliente_id = ANY($1::int[]) GROUP BY cliente_id`,
          [clientes.map((x) => x.id)],
        )
      : [];
    const porId = new Map(saldos.map((s) => [s.cliente_id, dec(s.saldo).toFixed(2)]));
    const datos = clientes.map((x) => ({ ...x, saldoUsd: porId.get(x.id) ?? '0.00' }));
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

  async crear(dto: CrearClienteDto, usuario: UsuarioSesion): Promise<Cliente> {
    validarCredito(dto, usuario);
    const documento = normalizarDocumento(dto.documento);
    if (await this.repo.existsBy({ documento }))
      throw new ConflictException(`Ya existe un cliente con el documento ${documento}`);
    return this.repo.save(
      this.repo.create({
        documento,
        nombre: dto.nombre.trim(),
        direccion: dto.direccion?.trim() || null,
        telefono: dto.telefono?.trim() || null,
        limiteCreditoUsd: dec(dto.limiteCreditoUsd ?? '0').toFixed(2),
        diasCredito: dto.diasCredito ?? 30,
      }),
    );
  }

  async actualizar(id: number, dto: ActualizarClienteDto, usuario: UsuarioSesion): Promise<Cliente> {
    validarCredito(dto, usuario);
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
    if (dto.limiteCreditoUsd !== undefined) cliente.limiteCreditoUsd = dec(dto.limiteCreditoUsd).toFixed(2);
    if (dto.diasCredito !== undefined) cliente.diasCredito = dto.diasCredito;
    return this.repo.save(cliente);
  }
}
