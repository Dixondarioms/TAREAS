import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { KeyboardEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Aviso, Boton, Cargando, Encabezado, Insignia, Paginador, Selector, Tabla, Tarjeta, td, th } from '../componentes/ui';
import { api } from '../lib/api';
import { useCategorias, useListas, useMarcas } from '../lib/consultas';
import { bs, fecha, NOMBRE_IVA, numero, usd } from '../lib/formato';
import { useSesion } from '../lib/sesion';
import { ProductoDetalle, ResultadoBusqueda } from '../lib/tipos';

export function Productos() {
  const { puede } = useSesion();
  const navegar = useNavigate();
  const [params, setParams] = useSearchParams();
  const [texto, setTexto] = useState(params.get('q') ?? '');
  const categorias = useCategorias();
  const marcas = useMarcas();
  const listas = useListas();

  const filtro = {
    q: params.get('q') ?? '',
    categoriaId: params.get('categoriaId') ?? '',
    marcaId: params.get('marcaId') ?? '',
    listaId: params.get('listaId') ?? '',
    estado: params.get('estado') ?? 'activos',
    pagina: Number(params.get('pagina') ?? 1),
  };

  const cambiar = (cambios: Record<string, string>) => {
    const nuevos = new URLSearchParams(params);
    for (const [k, v] of Object.entries(cambios)) {
      if (v) nuevos.set(k, v);
      else nuevos.delete(k);
    }
    if (!('pagina' in cambios)) nuevos.delete('pagina');
    setParams(nuevos, { replace: true });
  };

  // La búsqueda se lanza 300 ms después de dejar de escribir.
  useEffect(() => {
    const t = setTimeout(() => {
      if (texto !== filtro.q) cambiar({ q: texto });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  const resultado = useQuery({
    queryKey: ['productos', filtro],
    queryFn: () => api.get<ResultadoBusqueda>('/productos', { ...filtro, porPagina: 50 }),
    placeholderData: keepPreviousData,
  });

  /** Con el lector de código de barras (que envía Enter) se abre el producto directamente. */
  const alPresionarTecla = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || !texto.trim() || /\s/.test(texto.trim())) return;
    try {
      const r = await api.get<{ producto: ProductoDetalle }>(`/productos/por-codigo/${encodeURIComponent(texto.trim())}`);
      navegar(`/productos/${r.producto.id}`);
    } catch {
      /* no es un código exacto: se queda la búsqueda normal */
    }
  };

  const datos = resultado.data;
  const verCostos = puede('GERENTE', 'ALMACEN');

  return (
    <>
      <Encabezado
        titulo="Productos"
        descripcion={
          datos?.tasa
            ? `Precios en Bs a la tasa BCV ${numero(datos.tasa.valor, 4)} (fecha valor ${fecha(datos.tasa.fechaValor)})`
            : undefined
        }
        acciones={
          puede('GERENTE', 'ALMACEN') && (
            <Link to="/productos/nuevo">
              <Boton icono={<Plus className="size-4" />}>Nuevo producto</Boton>
            </Link>
          )
        }
      />
      <Tarjeta>
        <div className="grid gap-3 md:grid-cols-[1fr_repeat(4,minmax(0,11rem))]">
          <div className="relative">
            <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-slate-400" />
            <input
              autoFocus
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={alPresionarTecla}
              placeholder="Buscar por descripción, código, marca o código de barras…"
              className="block w-full rounded-lg border-0 py-2 pr-3 pl-9 text-sm ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-marca-500"
              aria-label="Buscar productos"
            />
          </div>
          <Selector value={filtro.categoriaId} onChange={(e) => cambiar({ categoriaId: e.target.value })} aria-label="Categoría">
            <option value="">Todas las categorías</option>
            {categorias.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.ruta}
              </option>
            ))}
          </Selector>
          <Selector value={filtro.marcaId} onChange={(e) => cambiar({ marcaId: e.target.value })} aria-label="Marca">
            <option value="">Todas las marcas</option>
            {marcas.data?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </Selector>
          <Selector value={filtro.listaId} onChange={(e) => cambiar({ listaId: e.target.value })} aria-label="Lista de precios">
            {listas.data
              ?.filter((l) => l.activa)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nombre}
                </option>
              ))}
          </Selector>
          <Selector value={filtro.estado} onChange={(e) => cambiar({ estado: e.target.value })} aria-label="Estado">
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
            <option value="todos">Todos</option>
          </Selector>
        </div>

        {datos?.busquedaAproximada && (
          <div className="mt-3">
            <Aviso tipo="advertencia">No hubo coincidencias exactas; se muestran productos con descripción parecida.</Aviso>
          </div>
        )}
        {resultado.error && (
          <div className="mt-3">
            <Aviso tipo="error">{resultado.error.message}</Aviso>
          </div>
        )}

        <div className="mt-3">
          {resultado.isLoading ? (
            <Cargando />
          ) : (
            <>
              {/* Teléfonos: tarjetas con el precio visible sin desplazar */}
              <ul className="divide-y divide-slate-100 md:hidden">
                {datos?.datos.map((p) => (
                  <li key={p.id}>
                    <Link to={`/productos/${p.id}`} className="flex items-start justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900">{p.descripcion}</div>
                        <div className="text-xs text-slate-500">
                          <span className="font-mono">{p.codigo}</span> · {p.unidad}
                          {p.marca && ` · ${p.marca}`}
                          {p.ubicacion && ` · ${p.ubicacion}`}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="cifra font-semibold text-slate-900">{bs(p.precio?.precioBsConIva)}</div>
                        <div className="cifra text-xs text-slate-500">{usd(p.precio?.precioUsdConIva)}</div>
                      </div>
                    </Link>
                  </li>
                ))}
                {datos?.datos.length === 0 && (
                  <li className="py-8 text-center text-sm text-slate-500">No se encontraron productos.</li>
                )}
              </ul>
              <div className="hidden md:block">
                <Tabla>
                  <thead>
                    <tr>
                      <th className={th}>Código</th>
                      <th className={th}>Descripción</th>
                      <th className={th}>Unidad</th>
                      <th className={th}>IVA</th>
                      {verCostos && <th className={`${th} text-right`}>Costo</th>}
                      <th className={`${th} text-right`}>Precio $ (con IVA)</th>
                      <th className={`${th} text-right`}>Precio Bs (con IVA)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {datos?.datos.map((p) => (
                      <tr
                        key={p.id}
                        className="cursor-pointer hover:bg-marca-50/60"
                        onClick={() => navegar(`/productos/${p.id}`)}
                      >
                        <td className={`${td} font-mono text-xs whitespace-nowrap text-slate-600`}>{p.codigo}</td>
                        <td className={td}>
                          <div className="font-medium text-slate-900">
                            {p.descripcion} {!p.activo && <Insignia color="rojo">Inactivo</Insignia>}
                          </div>
                          <div className="text-xs text-slate-500">
                            {[p.marca, p.categoria, p.ubicacion && `Ubic. ${p.ubicacion}`].filter(Boolean).join(' · ')}
                          </div>
                        </td>
                        <td className={td}>{p.unidad}</td>
                        <td className={td}>
                          <Insignia color={p.alicuotaIva === 'EXENTO' ? 'azul' : 'gris'}>{NOMBRE_IVA[p.alicuotaIva]}</Insignia>
                        </td>
                        {verCostos && <td className={`${td} cifra text-right text-slate-500`}>{usd(p.costoUsd)}</td>}
                        <td className={`${td} cifra text-right`}>{usd(p.precio?.precioUsdConIva)}</td>
                        <td className={`${td} cifra text-right font-semibold text-slate-900`}>{bs(p.precio?.precioBsConIva)}</td>
                      </tr>
                    ))}
                    {datos?.datos.length === 0 && (
                      <tr>
                        <td colSpan={7} className={`${td} py-8 text-center text-slate-500`}>
                          No se encontraron productos.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </Tabla>
              </div>
            </>
          )}
          {datos && (
            <Paginador
              pagina={datos.pagina}
              porPagina={datos.porPagina}
              total={datos.total}
              alCambiar={(p) => cambiar({ pagina: String(p) })}
            />
          )}
        </div>
      </Tarjeta>
    </>
  );
}
