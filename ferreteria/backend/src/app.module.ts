import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { opcionesBaseDatos } from './base-datos/opciones';
import { CatalogoModule } from './catalogo/catalogo.module';
import { leerConfiguracion } from './configuracion-app';
import { ConfiguracionModule } from './configuracion/configuracion.module';
import { InventarioModule } from './inventario/inventario.module';
import { ProveedoresModule } from './proveedores/proveedores.module';
import { SaludController } from './salud.controller';
import { SemillasModule } from './semillas/semillas.module';
import { TasasModule } from './tasas/tasas.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { VentasModule } from './ventas/ventas.module';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({ useFactory: () => opcionesBaseDatos(leerConfiguracion()) }),
    ScheduleModule.forRoot(),
    ConfiguracionModule,
    UsuariosModule,
    AuthModule,
    TasasModule,
    CatalogoModule,
    ProveedoresModule,
    InventarioModule,
    VentasModule,
    SemillasModule,
  ],
  controllers: [SaludController],
})
export class AppModule {}
