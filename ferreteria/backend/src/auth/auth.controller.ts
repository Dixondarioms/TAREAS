import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { Publico, UsuarioActual, UsuarioSesion } from '../comun/decoradores';
import { CambiarClaveDto } from '../usuarios/usuarios.dto';
import { AuthService } from './auth.service';

class LoginDto {
  @IsString() @MaxLength(40) usuario: string;
  @IsString() @MaxLength(72) clave: string;
}

@ApiTags('autenticación')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Publico()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.iniciarSesion(dto.usuario, dto.clave);
  }

  @Get('yo')
  yo(@UsuarioActual() usuario: UsuarioSesion) {
    return usuario;
  }

  @Put('clave')
  @HttpCode(204)
  async cambiarClave(@UsuarioActual() usuario: UsuarioSesion, @Body() dto: CambiarClaveDto) {
    await this.auth.cambiarClave(usuario.id, dto.claveActual, dto.claveNueva);
  }
}
