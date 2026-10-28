export enum Rol {
  ADMIN = 'ADMIN',
  GERENTE = 'GERENTE',
  ALMACEN = 'ALMACEN',
  CAJERO = 'CAJERO',
}

/** Roles que pueden ver costos y márgenes. */
export const ROLES_VEN_COSTOS: Rol[] = [Rol.ADMIN, Rol.GERENTE, Rol.ALMACEN];
/** Roles que pueden fijar costos y precios. */
export const ROLES_FIJAN_PRECIOS: Rol[] = [Rol.ADMIN, Rol.GERENTE];
