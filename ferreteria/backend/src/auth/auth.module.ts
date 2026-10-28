import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { leerConfiguracion } from '../configuracion-app';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GuardiaRoles, GuardiaSesion } from './guardias';

@Module({
  imports: [
    UsuariosModule,
    JwtModule.registerAsync({
      useFactory: () => {
        const { jwt } = leerConfiguracion();
        return { secret: jwt.secreto, signOptions: { expiresIn: jwt.duracion as never } };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, { provide: APP_GUARD, useClass: GuardiaSesion }, { provide: APP_GUARD, useClass: GuardiaRoles }],
})
export class AuthModule {}
