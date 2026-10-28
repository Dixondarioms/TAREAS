import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventarioModule } from '../inventario/inventario.module';
import { TasasModule } from '../tasas/tasas.module';
import { CajaService } from './caja.service';
import { ClientesService } from './clientes.service';
import { Cliente } from './entidades/cliente.entity';
import { TalonariosService } from './talonarios.service';
import { CajaController, ClientesController, TalonariosController, VentasController } from './ventas.controller';
import { VentasService } from './ventas.service';

@Module({
  imports: [TypeOrmModule.forFeature([Cliente]), TasasModule, InventarioModule],
  controllers: [ClientesController, TalonariosController, CajaController, VentasController],
  providers: [ClientesService, TalonariosService, CajaService, VentasService],
})
export class VentasModule {}
