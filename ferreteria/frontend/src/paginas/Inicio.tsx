import { useQuery } from '@tanstack/react-query';
import { Package, Percent, Upload } from 'lucide-react';
import { Link } from 'react-router';
import { TarjetaTasas } from '../componentes/TarjetaTasas';
import { Encabezado, Tarjeta } from '../componentes/ui';
import { api } from '../lib/api';
import { useConfiguracion } from '../lib/consultas';
import { useSesion } from '../lib/sesion';
import { ResultadoBusqueda } from '../lib/tipos';

export function Inicio() {
  const { usuario, puede } = useSesion();
  const config = useConfiguracion();
  const productos = useQuery({
    queryKey: ['productos', 'conteo'],
    queryFn: () => api.get<ResultadoBusqueda>('/productos', { porPagina: 1 }),
  });

  return (
    <>
      <Encabezado titulo={`Hola, ${usuario?.nombre ?? ''}`} descripcion={config.data?.empresa.razonSocial} />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TarjetaTasas />
        </div>
        <Tarjeta titulo="Catálogo">
          <div className="cifra text-3xl font-semibold text-slate-900">
            {productos.data?.total.toLocaleString('es-VE') ?? '…'}
          </div>
          <p className="text-sm text-slate-500">productos activos</p>
          <div className="mt-4 flex flex-col gap-2 text-sm">
            <Atajo a="/productos" icono={<Package className="size-4" />} texto="Buscar productos" />
            {puede('GERENTE') && (
              <Atajo a="/precios/ajuste" icono={<Percent className="size-4" />} texto="Ajustar precios por proveedor o marca" />
            )}
            {puede('GERENTE') && (
              <Atajo a="/importar" icono={<Upload className="size-4" />} texto="Importar catálogo desde Excel" />
            )}
          </div>
        </Tarjeta>
      </div>
    </>
  );
}

function Atajo({ a, icono, texto }: { a: string; icono: React.ReactNode; texto: string }) {
  return (
    <Link to={a} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-marca-700 hover:bg-marca-50">
      {icono}
      {texto}
    </Link>
  );
}
