import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { Publico } from './comun/decoradores';

@ApiTags('sistema')
@Controller('salud')
export class SaludController {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /** Usado por Docker y por el monitoreo para saber si la API y la base de datos responden. */
  @Publico()
  @Get()
  async salud() {
    await this.ds.query('SELECT 1');
    return { estado: 'ok', hora: new Date().toISOString() };
  }
}
