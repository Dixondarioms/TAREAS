import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../comun/decoradores';
import { Rol } from '../usuarios/rol.enum';
import { ConsultaPeriodoDto, ReportesService } from './reportes.service';

@ApiTags('reportes')
@Controller('reportes')
@Roles(Rol.GERENTE)
export class ReportesController {
  constructor(private readonly servicio: ReportesService) {}

  /** Ventas, ganancia, métodos de pago, cajeros y productos más vendidos del período. */
  @Get('ventas')
  ventas(@Query() c: ConsultaPeriodoDto) {
    return this.servicio.ventas(c);
  }
}
