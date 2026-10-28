import { Module } from '@nestjs/common';
import { TasasModule } from '../tasas/tasas.module';
import { CategoriasController, ListasPrecioController, MarcasController, UnidadesController } from './catalogo-basico.controller';
import { CatalogoBasicoService } from './catalogo-basico.service';
import { ImportacionService } from './importacion.service';
import { PreciosService } from './precios.service';
import { PreciosController, ProductosController } from './productos.controller';
import { ProductosService } from './productos.service';

@Module({
  imports: [TasasModule],
  controllers: [
    UnidadesController,
    CategoriasController,
    MarcasController,
    ListasPrecioController,
    ProductosController,
    PreciosController,
  ],
  providers: [CatalogoBasicoService, ProductosService, PreciosService, ImportacionService],
  exports: [ProductosService, CatalogoBasicoService],
})
export class CatalogoModule {}
