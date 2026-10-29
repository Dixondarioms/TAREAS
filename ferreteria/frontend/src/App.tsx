import { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { Marco } from './componentes/Marco';
import { Cargando } from './componentes/ui';
import { useSesion } from './lib/sesion';
import { Rol } from './lib/tipos';
import { AjustePrecios } from './paginas/AjustePrecios';
import { Caja } from './paginas/Caja';
import { Catalogos } from './paginas/Catalogos';
import { Clientes } from './paginas/Clientes';
import { CompraFormulario } from './paginas/CompraFormulario';
import { Compras } from './paginas/Compras';
import { Configuracion } from './paginas/Configuracion';
import { Facturacion } from './paginas/Facturacion';
import { ConteoFisico } from './paginas/ConteoFisico';
import { Importar } from './paginas/Importar';
import { Inicio } from './paginas/Inicio';
import { Inventario } from './paginas/Inventario';
import { LibrosFiscales } from './paginas/LibrosFiscales';
import { Login } from './paginas/Login';
import { ProductoFormulario } from './paginas/ProductoFormulario';
import { PuntoDeVenta } from './paginas/PuntoDeVenta';
import { Reportes } from './paginas/Reportes';
import { Productos } from './paginas/Productos';
import { Proveedores } from './paginas/Proveedores';
import { Tasas } from './paginas/Tasas';
import { Usuarios } from './paginas/Usuarios';
import { Ventas } from './paginas/Ventas';

function Restringido({ roles, children }: { roles: Rol[]; children: ReactNode }) {
  const { puede } = useSesion();
  return puede(...roles) ? children : <Navigate to="/" replace />;
}

export function App() {
  const { usuario, cargando } = useSesion();
  if (cargando) return <Cargando texto="Iniciando…" />;
  if (!usuario) return <Login />;
  return (
    <Routes>
      <Route element={<Marco />}>
        <Route index element={<Inicio />} />
        <Route
          path="venta"
          element={
            <Restringido roles={['GERENTE', 'CAJERO']}>
              <PuntoDeVenta />
            </Restringido>
          }
        />
        <Route
          path="caja"
          element={
            <Restringido roles={['GERENTE', 'CAJERO']}>
              <Caja />
            </Restringido>
          }
        />
        <Route
          path="ventas"
          element={
            <Restringido roles={['GERENTE', 'CAJERO']}>
              <Ventas />
            </Restringido>
          }
        />
        <Route
          path="facturacion"
          element={
            <Restringido roles={['GERENTE', 'CAJERO']}>
              <Facturacion />
            </Restringido>
          }
        />
        <Route
          path="libros"
          element={
            <Restringido roles={['GERENTE']}>
              <LibrosFiscales />
            </Restringido>
          }
        />
        <Route
          path="compras"
          element={
            <Restringido roles={['GERENTE', 'ALMACEN']}>
              <Compras />
            </Restringido>
          }
        />
        <Route
          path="compras/nueva"
          element={
            <Restringido roles={['GERENTE', 'ALMACEN']}>
              <CompraFormulario />
            </Restringido>
          }
        />
        <Route
          path="clientes"
          element={
            <Restringido roles={['GERENTE', 'CAJERO']}>
              <Clientes />
            </Restringido>
          }
        />
        <Route
          path="reportes"
          element={
            <Restringido roles={['GERENTE']}>
              <Reportes />
            </Restringido>
          }
        />
        <Route path="productos" element={<Productos />} />
        <Route
          path="productos/nuevo"
          element={
            <Restringido roles={['GERENTE', 'ALMACEN']}>
              <ProductoFormulario />
            </Restringido>
          }
        />
        <Route path="productos/:id" element={<ProductoFormulario />} />
        <Route path="inventario" element={<Inventario />} />
        <Route
          path="inventario/conteo"
          element={
            <Restringido roles={['GERENTE', 'ALMACEN']}>
              <ConteoFisico />
            </Restringido>
          }
        />
        <Route
          path="catalogos"
          element={
            <Restringido roles={['GERENTE', 'ALMACEN']}>
              <Catalogos />
            </Restringido>
          }
        />
        <Route
          path="proveedores"
          element={
            <Restringido roles={['GERENTE', 'ALMACEN']}>
              <Proveedores />
            </Restringido>
          }
        />
        <Route path="tasas" element={<Tasas />} />
        <Route
          path="precios/ajuste"
          element={
            <Restringido roles={['GERENTE']}>
              <AjustePrecios />
            </Restringido>
          }
        />
        <Route
          path="importar"
          element={
            <Restringido roles={['GERENTE']}>
              <Importar />
            </Restringido>
          }
        />
        <Route
          path="usuarios"
          element={
            <Restringido roles={['ADMIN']}>
              <Usuarios />
            </Restringido>
          }
        />
        <Route
          path="configuracion"
          element={
            <Restringido roles={['ADMIN']}>
              <Configuracion />
            </Restringido>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
