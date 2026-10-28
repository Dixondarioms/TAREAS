import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Rol } from '../usuarios/rol.enum';

export const CLAVE_PUBLICO = 'esPublico';
export const CLAVE_ROLES = 'roles';

/** Marca una ruta como accesible sin iniciar sesión. */
export const Publico = () => SetMetadata(CLAVE_PUBLICO, true);

/** Restringe una ruta a ciertos roles. ADMIN siempre tiene acceso. */
export const Roles = (...roles: Rol[]) => SetMetadata(CLAVE_ROLES, roles);

export interface UsuarioSesion {
  id: number;
  usuario: string;
  nombre: string;
  rol: Rol;
}

export const UsuarioActual = createParamDecorator(
  (_dato: unknown, ctx: ExecutionContext): UsuarioSesion => ctx.switchToHttp().getRequest().usuario,
);
