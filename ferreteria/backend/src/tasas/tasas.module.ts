import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClienteBcv } from './bcv.cliente';
import { TasaCambio } from './tasa-cambio.entity';
import { TasasController } from './tasas.controller';
import { ProgramadorTasas } from './tasas.programador';
import { TasasService } from './tasas.service';

@Module({
  imports: [TypeOrmModule.forFeature([TasaCambio])],
  controllers: [TasasController],
  providers: [TasasService, ClienteBcv, ProgramadorTasas],
  exports: [TasasService],
})
export class TasasModule {}
