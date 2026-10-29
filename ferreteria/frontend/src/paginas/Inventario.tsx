import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ClipboardList, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { cantidad, Existencia, ModalKardex, ProductoInventario } from '../componentes/inventario';
import { Aviso, Boton, Cargando, Encabezado, Paginador, Selector, Tabla, Tarjeta, td, th } from '../componentes/ui';
import { api } from '../lib/api';
import { useCategorias } from '../lib/consultas';
import { numero } from '../lib/formato';
import { useSesion } from '../lib/sesion';
import { ResultadoBusqueda, ResumenInventario } from '../lib/tipos';

type Filtro = '' | 'bajo-minimo' | 'sin-existencia';

const PESTANAS: { valor: Filtro; texto: string }[] = [
  { valor: '', texto: 'Todos' },
  { valor: 'bajo-minimo', texto: 'Bajo el mínimo' },
  { valor: 'sin-existencia', texto: 'Sin existencia' },
];

export function Inventario() {
  const { puede } = useSesion();
  const categorias = useCategorias();
  const [texto, setTexto] = useState('');
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('');
  const [categoriaId, setCategoriaId] = useState('');
  const [pagina, setPagina] = useState(1);
  const [seleccionado, setSeleccionado] = useState<ProductoInventario | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(texto);
      setPagina(1);
    }, 300);
    return () => clearTimeout(t);
  }, [texto]);

  const resumen = useQuery({
    queryKey: ['inventario', 'resumen'],
    queryFn: () => api.get<ResumenInventario>('/inventario/resumen'),
  });
  const lista = useQuery({
    queryKey: ['productos', 'inventario', q, filtro, categoriaId, pagina],
    queryFn: () => api.get<ResultadoBusqueda>('/productos', { q, existencia: filtro, categoriaId, pagina, porPagina: 50 }),
    placeholderData: keepPreviousData,
  });

  const r = resumen.data;
  return (
    <>
      <Encabezado
        titulo="Inventario"
        descripcion="Existencias, productos por reponer y movimientos de cada producto."
        acciones={
          puede('GERENTE', 'ALMACEN') && (
            <Link to="/inventario/conteo">
              <Boton icono={<ClipboardList className="size-4" />}>Conteo físico</Boton>
            </Link>
          )
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador titulo="Productos activos" valor={r ? numero(r.productosActivos, 0) : '…'} />
        <Indicador
          titulo="Bajo el mínimo"
          valor={r ? numero(r.bajoMinimo, 0) : '…'}
          tono={r && r.bajoMinimo > 0 ? 'ambar' : undefined}
          alPulsar={() => {
            setFiltro('bajo-minimo');
            setPagina(1);
          }}
        />
        <Indicador
          titulo="Sin existencia"
          valor={r ? numero(r.sinExistencia, 0) : '…'}
          tono={r && r.sinExistencia > 0 ? 'rojo' : undefined}
          alPulsar={() => {
            setFiltro('sin-existencia');
            setPagina(1);
          }}
        />
        {r?.valorUsd !== undefined && <Indicador titulo="Valor al costo" valor={`$ ${numero(r.valorUsd, 2)}`} />}
      </div>

      <Tarjeta>
        <div className="mb-3 flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1" role="tablist">
          {PESTANAS.map((p) => (
            <button
              key={p.valor}
              type="button"
              role="tab"
              aria-selected={filtro === p.valor}
              onClick={() => {
                setFiltro(p.valor);
                setPagina(1);
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                filtro === p.valor ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {p.texto}
            </button>
          ))}
        </div>
        <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_16rem]">
          <div className="relative">
            <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-slate-400" />
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Buscar por descripción, código o código de barras…"
              className="block w-full rounded-lg border-0 py-2 pr-3 pl-9 text-sm ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-marca-500"
              aria-label="Buscar en inventario"
            />
          </div>
          <Selector
            aria-label="Categoría"
            value={categoriaId}
            onChange={(e) => {
              setCategoriaId(e.target.value);
              setPagina(1);
            }}
          >
            <option value="">Todas las categorías</option>
            {categorias.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.ruta}
              </option>
            ))}
          </Selector>
        </div>

        {lista.error && <Aviso tipo="error">{lista.error.message}</Aviso>}
        {lista.isLoading ? (
          <Cargando />
        ) : (
          <Tabla>
            <thead>
              <tr>
                <th className={th}>Código</th>
                <th className={th}>Descripción</th>
                <th className={th}>Ubicación</th>
                <th className={`${th} text-right`}>Mínimo</th>
                <th className={`${th} text-right`}>Existencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lista.data?.datos.map((p) => (
                <tr
                  key={p.id}
                  className="cursor-pointer hover:bg-marca-50/60"
                  onClick={() =>
                    setSeleccionado({
                      id: p.id,
                      codigo: p.codigo,
                      descripcion: p.descripcion,
                      unidad: p.unidad,
                      existencia: p.existencia,
                      stockMinimo: p.stockMinimo,
                    })
                  }
                >
                  <td className={`${td} font-mono text-xs whitespace-nowrap text-slate-600`}>{p.codigo}</td>
                  <td className={td}>
                    <div className="font-medium text-slate-900">{p.descripcion}</div>
                    <div className="text-xs text-slate-500">{[p.marca, p.categoria].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td className={`${td} text-slate-600`}>{p.ubicacion ?? '—'}</td>
                  <td className={`${td} cifra text-right text-slate-500`}>
                    {Number(p.stockMinimo) > 0 ? cantidad(p.stockMinimo) : '—'}
                  </td>
                  <td className={`${td} text-right whitespace-nowrap`}>
                    <Existencia existencia={p.existencia} minimo={p.stockMinimo} unidad={p.unidad} />
                  </td>
                </tr>
              ))}
              {lista.data?.datos.length === 0 && (
                <tr>
                  <td colSpan={5} className={`${td} py-8 text-center text-slate-500`}>
                    {filtro === 'bajo-minimo'
                      ? 'Ningún producto está por debajo de su mínimo.'
                      : filtro === 'sin-existencia'
                        ? 'Todos los productos tienen existencia.'
                        : 'No se encontraron productos.'}
                  </td>
                </tr>
              )}
            </tbody>
          </Tabla>
        )}
        {lista.data && (
          <Paginador pagina={lista.data.pagina} porPagina={lista.data.porPagina} total={lista.data.total} alCambiar={setPagina} />
        )}
      </Tarjeta>

      <ModalKardex producto={seleccionado} alCerrar={() => setSeleccionado(null)} />
    </>
  );
}

function Indicador({
  titulo,
  valor,
  tono,
  alPulsar,
}: {
  titulo: string;
  valor: string;
  tono?: 'ambar' | 'rojo';
  alPulsar?: () => void;
}) {
  const color = tono === 'rojo' ? 'text-red-700' : tono === 'ambar' ? 'text-amber-700' : 'text-slate-900';
  const contenido = (
    <>
      <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">{titulo}</div>
      <div className={`cifra mt-1 text-2xl font-semibold ${color}`}>{valor}</div>
    </>
  );
  const estilo = 'rounded-xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-200';
  return alPulsar ? (
    <button type="button" onClick={alPulsar} className={`${estilo} transition hover:ring-marca-300`}>
      {contenido}
    </button>
  ) : (
    <div className={estilo}>{contenido}</div>
  );
}
