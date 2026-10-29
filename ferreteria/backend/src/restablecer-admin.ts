/**
 * Restablece la clave de un administrador cuando se pierde. Se ejecuta en el
 * servidor, con acceso a la base de datos; no pasa por la red.
 *
 *   node dist/restablecer-admin.js [usuario]
 *
 * Por defecto restablece ADMIN_USUARIO ("admin"). También lo reactiva si
 * estaba desactivado. Imprime la clave nueva en una línea "clave=..." para que
 * el script del instalador la muestre.
 */
import 'reflect-metadata';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { DataSource } from 'typeorm';
import { leerConfiguracion } from './configuracion-app';
import { opcionesBaseDatos } from './base-datos/opciones';
import { Rol } from './usuarios/rol.enum';
import { Usuario } from './usuarios/usuario.entity';
import { COSTO_BCRYPT } from './usuarios/usuarios.service';

/** Sin caracteres que se confunden al dictarla (0/O, 1/l/I), igual que la clave inicial del instalador. */
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

export function nuevaClaveLegible(largo = 12): string {
  return Array.from({ length: largo }, () => ALFABETO[randomInt(ALFABETO.length)]).join('');
}

export async function restablecerAdministrador(fuente: DataSource, usuario: string): Promise<string> {
  const repo = fuente.getRepository(Usuario);
  const encontrado = await repo.findOne({ where: { usuario: usuario.toLowerCase() } });
  if (!encontrado) throw new Error(`No existe el usuario "${usuario}"`);
  if (encontrado.rol !== Rol.ADMIN) throw new Error(`El usuario "${usuario}" no es administrador`);
  const clave = nuevaClaveLegible();
  await repo.update({ id: encontrado.id }, { claveHash: await bcrypt.hash(clave, COSTO_BCRYPT), activo: true });
  return clave;
}

async function principal(): Promise<void> {
  const config = leerConfiguracion();
  const fuente = new DataSource({ ...opcionesBaseDatos(config), migrationsRun: false, logging: false });
  await fuente.initialize();
  try {
    const clave = await restablecerAdministrador(fuente, process.argv[2] ?? config.admin.usuario);
    process.stdout.write(`clave=${clave}\n`);
  } finally {
    await fuente.destroy();
  }
}

if (require.main === module) {
  principal().catch((e: Error) => {
    process.stderr.write(`${e.message}\n`);
    process.exit(1);
  });
}
