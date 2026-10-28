import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { Rol } from './rol.enum';
import { Usuario } from './usuario.entity';
import { ActualizarUsuarioDto, CrearUsuarioDto } from './usuarios.dto';

export const COSTO_BCRYPT = 11;

@Injectable()
export class UsuariosService {
  private readonly log = new Logger(UsuariosService.name);

  constructor(@InjectRepository(Usuario) private readonly repo: Repository<Usuario>) {}

  listar(): Promise<Usuario[]> {
    return this.repo.find({ order: { nombre: 'ASC' } });
  }

  async obtener(id: number): Promise<Usuario> {
    const u = await this.repo.findOneBy({ id });
    if (!u) throw new NotFoundException('Usuario no encontrado');
    return u;
  }

  /** Incluye el hash de la clave; solo para autenticación. */
  buscarParaLogin(usuario: string): Promise<Usuario | null> {
    return this.repo
      .createQueryBuilder('u')
      .addSelect('u.claveHash')
      .where('u.usuario = :usuario', { usuario: usuario.trim().toLowerCase() })
      .getOne();
  }

  async crear(dto: CrearUsuarioDto): Promise<Usuario> {
    const usuario = dto.usuario.trim().toLowerCase();
    if (await this.repo.existsBy({ usuario })) throw new ConflictException('Ya existe un usuario con ese nombre');
    const creado = await this.repo.save(
      this.repo.create({
        usuario,
        nombre: dto.nombre.trim(),
        rol: dto.rol,
        claveHash: await bcrypt.hash(dto.clave, COSTO_BCRYPT),
      }),
    );
    return this.obtener(creado.id);
  }

  async actualizar(id: number, dto: ActualizarUsuarioDto, idQuienActualiza: number): Promise<Usuario> {
    const u = await this.obtener(id);
    if (id === idQuienActualiza && (dto.activo === false || (dto.rol && dto.rol !== u.rol))) {
      throw new BadRequestException('No puede desactivarse ni cambiarse el rol a sí mismo');
    }
    if (u.rol === Rol.ADMIN && (dto.activo === false || (dto.rol && dto.rol !== Rol.ADMIN))) {
      const adminsActivos = await this.repo.countBy({ rol: Rol.ADMIN, activo: true });
      if (adminsActivos <= 1) throw new BadRequestException('Debe quedar al menos un administrador activo');
    }
    if (dto.nombre !== undefined) u.nombre = dto.nombre.trim();
    if (dto.rol !== undefined) u.rol = dto.rol;
    if (dto.activo !== undefined) u.activo = dto.activo;
    await this.repo.save(u);
    if (dto.clave) await this.fijarClave(id, dto.clave);
    return this.obtener(id);
  }

  async fijarClave(id: number, clave: string): Promise<void> {
    await this.repo.update({ id }, { claveHash: await bcrypt.hash(clave, COSTO_BCRYPT) });
  }

  verificarClave(clave: string, hash: string): Promise<boolean> {
    return bcrypt.compare(clave, hash);
  }

  async registrarAcceso(id: number): Promise<void> {
    await this.repo.update({ id }, { ultimoAcceso: new Date() });
  }

  /**
   * Si no existe ningún usuario, crea el administrador inicial. Si no se
   * configuró ADMIN_CLAVE_INICIAL se genera una aleatoria y se muestra una sola vez en el log.
   */
  async asegurarAdministrador(usuario: string, claveInicial?: string): Promise<void> {
    if ((await this.repo.count()) > 0) return;
    const clave = claveInicial ?? randomBytes(9).toString('base64url');
    await this.crear({ usuario, nombre: 'Administrador', clave, rol: Rol.ADMIN });
    if (claveInicial) {
      this.log.warn(`Usuario administrador "${usuario}" creado con la clave de ADMIN_CLAVE_INICIAL. Cámbiela al ingresar.`);
    } else {
      this.log.warn(`Usuario administrador "${usuario}" creado con la clave temporal: ${clave}  (cámbiela al ingresar)`);
    }
  }
}
