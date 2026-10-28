import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CLAVE_PUBLICO, CLAVE_ROLES } from '../comun/decoradores';
import { Rol } from '../usuarios/rol.enum';
import { AuthService } from './auth.service';

/** Exige un token válido en todas las rutas, salvo las marcadas con @Publico(). */
@Injectable()
export class GuardiaSesion implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const publico = this.reflector.getAllAndOverride<boolean>(CLAVE_PUBLICO, [ctx.getHandler(), ctx.getClass()]);
    if (publico) return true;
    const req = ctx.switchToHttp().getRequest();
    const [tipo, token] = String(req.headers.authorization ?? '').split(' ');
    if (tipo !== 'Bearer' || !token) throw new UnauthorizedException('Debe iniciar sesión');
    req.usuario = await this.auth.validarToken(token);
    return true;
  }
}

/** Aplica @Roles(). El administrador tiene acceso a todo. */
@Injectable()
export class GuardiaRoles implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Rol[]>(CLAVE_ROLES, [ctx.getHandler(), ctx.getClass()]);
    if (!roles || roles.length === 0) return true;
    const usuario = ctx.switchToHttp().getRequest().usuario;
    if (!usuario) return true; // ruta pública
    if (usuario.rol === Rol.ADMIN || roles.includes(usuario.rol)) return true;
    throw new ForbiddenException('No tiene permiso para realizar esta acción');
  }
}
