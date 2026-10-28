import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventarioController } from './inventario.controller';
import { InventarioService } from './inventario.service';
import { MovimientoInventario } from './movimiento-inventario.entity';

@Module({
  imports: [TypeOrmModule.forFeature([MovimientoInventario])],
  controllers: [InventarioController],
  providers: [InventarioService],
  exports: [InventarioService],
})
export class InventarioModule {}
