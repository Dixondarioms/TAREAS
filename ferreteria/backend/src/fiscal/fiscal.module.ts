import { Module } from '@nestjs/common';
import { FiscalController } from './fiscal.controller';
import { FiscalService } from './fiscal.service';
import { RetencionesService } from './retenciones.service';

@Module({
  controllers: [FiscalController],
  providers: [FiscalService, RetencionesService],
})
export class FiscalModule {}
