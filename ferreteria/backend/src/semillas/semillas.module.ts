import { Module } from '@nestjs/common';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { SemillasService } from './semillas.service';

@Module({
  imports: [UsuariosModule],
  providers: [SemillasService],
})
export class SemillasModule {}
