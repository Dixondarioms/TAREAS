import { Categoria } from '../catalogo/entidades/categoria.entity';
import { CodigoBarras } from '../catalogo/entidades/codigo-barras.entity';
import { HistorialCosto } from '../catalogo/entidades/historial-costo.entity';
import { ListaPrecio } from '../catalogo/entidades/lista-precio.entity';
import { Marca } from '../catalogo/entidades/marca.entity';
import { PrecioProducto } from '../catalogo/entidades/precio-producto.entity';
import { Presentacion } from '../catalogo/entidades/presentacion.entity';
import { Producto } from '../catalogo/entidades/producto.entity';
import { UnidadMedida } from '../catalogo/entidades/unidad-medida.entity';
import { Parametro } from '../configuracion/parametro.entity';
import { MovimientoInventario } from '../inventario/movimiento-inventario.entity';
import { ProductoProveedor } from '../proveedores/producto-proveedor.entity';
import { Proveedor } from '../proveedores/proveedor.entity';
import { TasaCambio } from '../tasas/tasa-cambio.entity';
import { Usuario } from '../usuarios/usuario.entity';

export const ENTIDADES = [
  Usuario,
  Parametro,
  TasaCambio,
  UnidadMedida,
  Categoria,
  Marca,
  Producto,
  Presentacion,
  CodigoBarras,
  ListaPrecio,
  PrecioProducto,
  HistorialCosto,
  Proveedor,
  ProductoProveedor,
  MovimientoInventario,
];
