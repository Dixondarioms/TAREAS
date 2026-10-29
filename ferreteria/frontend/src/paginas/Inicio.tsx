import { useQuery } from '@tanstack/react-query';
import { Boxes, ClipboardList, Package, Percent, Upload } from 'lucide-react';
import { Link } from 'react-router';
import { TarjetaTasas } from '../componentes/TarjetaTasas';
import { Encabezado, Tarjeta } from '../componentes/ui';
import { api } from '../lib/api';
import { useConfiguracion } from '../lib/consultas';
import { RAZON_SOCIAL } from '../lib/marca';
import { useSesion } from '../lib/sesion';
import { numero } from '../lib/formato';
import { ResultadoBusqueda, ResumenInventario } from '../lib/tipos';

export function Inicio() {
  const { usuario, puede } = useSesion();
  const config = useConfiguracion();
  const productos = useQuery({
    queryKey: ['productos', 'conteo'],
    queryFn: () => api.get<ResultadoBusqueda>('/productos', { porPagina: 1 }),
  });
  const inventario = useQuery({
    queryKey: ['inventario', 'resumen'],
    queryFn: () => api.get<ResumenInventario>('/inventario/resumen'),
  });
  const inv = inventario.data;

  return (
    <>
      <Encabezado titulo={`Hola, ${usuario?.nombre ?? ''}`} descripcion={config.data?.empresa.razonSocial || RAZON_SOCIAL} />
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
        <Tarjeta titulo="Inventario" className="lg:col-span-3">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Cifra
              valor={inv ? numero(inv.bajoMinimo, 0) : '…'}
              texto="productos en el mínimo o por debajo"
              tono={inv && inv.bajoMinimo > 0 ? 'text-amber-700' : 'text-slate-900'}
            />
            <Cifra
              valor={inv ? numero(inv.sinExistencia, 0) : '…'}
              texto="productos sin existencia"
              tono={inv && inv.sinExistencia > 0 ? 'text-red-700' : 'text-slate-900'}
            />
            {inv?.valorUsd !== undefined && (
              <Cifra valor={`$ ${numero(inv.valorUsd, 2)}`} texto="valor del inventario al costo" />
            )}
            <div className="flex flex-col gap-2 text-sm">
              <Atajo a="/inventario" icono={<Boxes className="size-4" />} texto="Ver inventario" />
              {puede('GERENTE', 'ALMACEN') && (
                <Atajo a="/inventario/conteo" icono={<ClipboardList className="size-4" />} texto="Hacer un conteo físico" />
              )}
            </div>
          </div>
        </Tarjeta>
      </div>
    </>
  );
}

function Cifra({ valor, texto, tono = 'text-slate-900' }: { valor: string; texto: string; tono?: string }) {
  return (
    <div>
      <div className={`cifra text-3xl font-semibold whitespace-nowrap ${tono}`}>{valor}</div>
      <p className="text-sm text-slate-500">{texto}</p>
    </div>
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
