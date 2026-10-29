import { Module } from '@nestjs/common';
import { CatalogoModule } from '../catalogo/catalogo.module';
import { InventarioModule } from '../inventario/inventario.module';
import { TasasModule } from '../tasas/tasas.module';
import { ComprasController } from './compras.controller';
import { ComprasService } from './compras.service';

@Module({
  imports: [CatalogoModule, InventarioModule, TasasModule],
  controllers: [ComprasController],
  providers: [ComprasService],
})
export class ComprasModule {}
