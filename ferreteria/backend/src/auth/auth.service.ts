import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsuarioSesion } from '../comun/decoradores';
import { UsuariosService } from '../usuarios/usuarios.service';

const MAX_INTENTOS = 5;
const BLOQUEO_MS = 5 * 60 * 1000;

@Injectable()
export class AuthService {
  /** Intentos fallidos por usuario, para frenar ataques de fuerza bruta en la red local. */
  private readonly fallos = new Map<string, { cantidad: number; hasta: number }>();

  constructor(
    private readonly usuarios: UsuariosService,
    private readonly jwt: JwtService,
  ) {}

  async iniciarSesion(nombreUsuario: string, clave: string) {
    const clavePrueba = nombreUsuario.trim().toLowerCase();
    const registro = this.fallos.get(clavePrueba);
    if (registro && registro.cantidad >= MAX_INTENTOS && registro.hasta > Date.now()) {
      throw new UnauthorizedException('Demasiados intentos fallidos. Espere unos minutos e intente de nuevo.');
    }

    const u = await this.usuarios.buscarParaLogin(clavePrueba);
    const valido = u && u.activo && (await this.usuarios.verificarClave(clave, u.claveHash));
    if (!u || !valido) {
      const cantidad = (registro && registro.hasta > Date.now() ? registro.cantidad : 0) + 1;
      if (this.fallos.size > 1000) this.limpiarFallosVencidos();
      this.fallos.set(clavePrueba, { cantidad, hasta: Date.now() + BLOQUEO_MS });
      throw new UnauthorizedException('Usuario o clave incorrectos');
    }
    this.fallos.delete(clavePrueba);
    await this.usuarios.registrarAcceso(u.id);

    const sesion: UsuarioSesion = { id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol };
    return { token: await this.jwt.signAsync({ sub: u.id }), usuario: sesion };
  }

  private limpiarFallosVencidos(): void {
    const ahora = Date.now();
    for (const [clave, r] of this.fallos) if (r.hasta <= ahora) this.fallos.delete(clave);
  }

  /** Verifica el token y carga el usuario vigente (así una desactivación surte efecto de inmediato). */
  async validarToken(token: string): Promise<UsuarioSesion> {
    let carga: { sub: number };
    try {
      carga = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Sesión inválida o vencida');
    }
    const u = await this.usuarios.obtener(carga.sub).catch(() => null);
    if (!u || !u.activo) throw new UnauthorizedException('Usuario inactivo');
    return { id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol };
  }

  async cambiarClave(id: number, claveActual: string, claveNueva: string): Promise<void> {
    const u = await this.usuarios.obtener(id);
    const conHash = await this.usuarios.buscarParaLogin(u.usuario);
    if (!conHash || !(await this.usuarios.verificarClave(claveActual, conHash.claveHash))) {
      throw new UnauthorizedException('La clave actual no es correcta');
    }
    await this.usuarios.fijarClave(id, claveNueva);
  }
}
