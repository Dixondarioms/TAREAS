import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfiguracionController } from './configuracion.controller';
import { Parametro } from './parametro.entity';
import { ConfiguracionService } from './configuracion.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Parametro])],
  controllers: [ConfiguracionController],
  providers: [ConfiguracionService],
  exports: [ConfiguracionService],
})
export class ConfiguracionModule {}
