import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, ScanBarcode, Trash2 } from 'lucide-react';
import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useAvisos } from '../componentes/avisos';
import { cantidad, ProductoInventario } from '../componentes/inventario';
import { Aviso, Boton, Campo, Encabezado, Modal, Tabla, Tarjeta, td, th } from '../componentes/ui';
import { api, ErrorApi } from '../lib/api';
import { aDecimalApi } from '../lib/formato';
import { ProductoDetalle, ResultadoBusqueda, ResultadoConteo } from '../lib/tipos';

interface Linea extends ProductoInventario {
  contado: string;
}

/** El conteo en curso se guarda en este navegador para no perderlo si se cierra la página. */
const CLAVE_BORRADOR = 'ferreteria.conteo';

function leerBorrador(): { referencia: string; lineas: Linea[] } {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE_BORRADOR) ?? 'null');
    if (guardado && Array.isArray(guardado.lineas)) return guardado;
  } catch {
    /* sin almacenamiento disponible */
  }
  return { referencia: '', lineas: [] };
}

function guardarBorrador(borrador: { referencia: string; lineas: Linea[] }) {
  try {
    if (borrador.lineas.length || borrador.referencia) localStorage.setItem(CLAVE_BORRADOR, JSON.stringify(borrador));
    else localStorage.removeItem(CLAVE_BORRADOR);
  } catch {
    /* sin almacenamiento disponible */
  }
}

const esNumero = (texto: string) =>
  texto.trim() !== '' && Number.isFinite(Number(aDecimalApi(texto))) && Number(aDecimalApi(texto)) >= 0;

export function ConteoFisico() {
  const avisos = useAvisos();
  const consultas = useQueryClient();
  const inicial = useRef(leerBorrador()).current;
  const [referencia, setReferencia] = useState(inicial.referencia);
  const [lineas, setLineas] = useState<Linea[]>(inicial.lineas);
  const [texto, setTexto] = useState('');
  const [q, setQ] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoConteo | null>(null);
  const buscador = useRef<HTMLInputElement>(null);

  useEffect(() => guardarBorrador({ referencia, lineas }), [referencia, lineas]);
  useEffect(() => {
    const t = setTimeout(() => setQ(texto.trim()), 250);
    return () => clearTimeout(t);
  }, [texto]);

  const sugerencias = useQuery({
    queryKey: ['productos', 'conteo-busqueda', q],
    queryFn: () => api.get<ResultadoBusqueda>('/productos', { q, porPagina: 8 }),
    enabled: q.length >= 2,
  });

  const agregar = (p: ProductoInventario) => {
    if (lineas.some((l) => l.id === p.id)) {
      avisos.error(new Error(`${p.codigo} ya está en el conteo`));
    } else {
      setLineas((ls) => [{ ...p, contado: '' }, ...ls]);
    }
    setTexto('');
    setQ('');
    buscador.current?.focus();
  };

  /** El lector de código de barras escribe el código y envía Enter. */
  const alPresionarTecla = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const codigo = texto.trim();
    if (!codigo) return;
    try {
      const r = await api.get<{ producto: ProductoDetalle }>(`/productos/por-codigo/${encodeURIComponent(codigo)}`);
      const p = r.producto;
      agregar({
        id: p.id,
        codigo: p.codigo,
        descripcion: p.descripcion,
        unidad: p.unidadBase.codigo,
        existencia: p.existencia,
        stockMinimo: p.stockMinimo,
      });
    } catch (error) {
      const unico = sugerencias.data?.datos.length === 1 ? sugerencias.data.datos[0] : null;
      if (unico) agregar(unico);
      else if (!(error instanceof ErrorApi && error.estado === 404)) avisos.error(error as Error);
    }
  };

  const registrar = useMutation({
    mutationFn: () =>
      api.post<ResultadoConteo>('/inventario/conteos', {
        referencia: referencia.trim() || undefined,
        lineas: lineas.map((l) => ({ productoId: l.id, contado: aDecimalApi(l.contado) })),
      }),
    onSuccess: (r) => {
      setResultado(r);
      setConfirmando(false);
      setLineas([]);
      setReferencia('');
      void consultas.invalidateQueries({ queryKey: ['inventario'] });
      void consultas.invalidateQueries({ queryKey: ['productos'] });
    },
    onError: (e) => {
      setConfirmando(false);
      avisos.error(e);
    },
  });

  const incompletas = lineas.filter((l) => !esNumero(l.contado));
  const conDiferencia = lineas.filter((l) => esNumero(l.contado) && Number(aDecimalApi(l.contado)) !== Number(l.existencia));

  if (resultado) {
    const ajustadas = resultado.lineas.filter((l) => Number(l.diferencia) !== 0);
    return (
      <>
        <Encabezado titulo="Conteo registrado" descripcion={resultado.referencia} />
        <Tarjeta>
          <Aviso tipo="exito">
            Se contaron {resultado.lineas.length} productos y se ajustaron {resultado.ajustados}. Los ajustes quedaron en el
            kardex de cada producto con la referencia «{resultado.referencia}».
          </Aviso>
          {ajustadas.length > 0 && (
            <div className="mt-4">
              <TablaDiferencias filas={ajustadas} />
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <Boton onClick={() => setResultado(null)}>Nuevo conteo</Boton>
            <Link to="/inventario">
              <Boton variante="secundario">Ir a inventario</Boton>
            </Link>
          </div>
        </Tarjeta>
      </>
    );
  }

  return (
    <>
      <Encabezado
        titulo="Conteo físico"
        descripcion="Escanee o busque cada producto y escriba la cantidad contada. Al registrar, solo se ajustan las diferencias."
        acciones={
          <Link to="/inventario">
            <Boton variante="secundario" icono={<ArrowLeft className="size-4" />}>
              Volver
            </Boton>
          </Link>
        }
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <Tarjeta titulo="Agregar productos" className="lg:col-span-1">
          <div className="relative">
            <ScanBarcode className="pointer-events-none absolute top-2.5 left-3 size-4 text-slate-400" />
            <input
              ref={buscador}
              autoFocus
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => void alPresionarTecla(e)}
              placeholder="Código de barras, código o nombre…"
              className="block w-full rounded-lg border-0 py-2 pr-3 pl-9 text-sm ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-marca-500"
              aria-label="Buscar producto para el conteo"
            />
          </div>
          {q.length >= 2 && (
            <ul className="mt-2 divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
              {sugerencias.data?.datos.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => agregar(p)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-marca-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-800">{p.descripcion}</span>
                      <span className="font-mono text-xs text-slate-500">{p.codigo}</span>
                    </span>
                    <Plus className="size-4 shrink-0 text-marca-600" />
                  </button>
                </li>
              ))}
              {sugerencias.data?.datos.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">Sin resultados.</li>}
            </ul>
          )}
          <p className="mt-3 text-xs text-slate-500">
            Con el lector de código de barras, cada lectura agrega el producto a la lista. El conteo se guarda en este equipo
            hasta registrarlo.
          </p>
        </Tarjeta>

        <Tarjeta
          titulo={`Productos contados (${lineas.length})`}
          className="lg:col-span-2"
          acciones={
            lineas.length > 0 && (
              <Boton
                variante="fantasma"
                onClick={() => {
                  if (window.confirm('¿Descartar todo el conteo en curso?')) setLineas([]);
                }}
              >
                Descartar
              </Boton>
            )
          }
        >
          {lineas.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">Todavía no hay productos en este conteo.</p>
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <th className={th}>Producto</th>
                  <th className={`${th} text-right`}>Sistema</th>
                  <th className={`${th} w-32`}>Contado</th>
                  <th className={`${th} text-right`}>Diferencia</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lineas.map((l) => {
                  const valido = esNumero(l.contado);
                  const diferencia = valido ? Number(aDecimalApi(l.contado)) - Number(l.existencia) : null;
                  return (
                    <tr key={l.id}>
                      <td className={td}>
                        <div className="font-medium text-slate-900">{l.descripcion}</div>
                        <div className="font-mono text-xs text-slate-500">
                          {l.codigo} · {l.unidad}
                        </div>
                      </td>
                      <td className={`${td} cifra text-right text-slate-600`}>{cantidad(l.existencia)}</td>
                      <td className={td}>
                        <input
                          inputMode="decimal"
                          value={l.contado}
                          onChange={(e) =>
                            setLineas((ls) => ls.map((x) => (x.id === l.id ? { ...x, contado: e.target.value } : x)))
                          }
                          aria-label={`Cantidad contada de ${l.codigo}`}
                          className={`cifra block w-full rounded-lg border-0 px-2 py-1.5 text-right text-sm ring-1 ring-inset focus:ring-2 focus:ring-marca-500 ${
                            l.contado && !valido ? 'ring-red-400' : 'ring-slate-300'
                          }`}
                        />
                      </td>
                      <td
                        className={`${td} cifra text-right font-medium ${
                          diferencia === null || diferencia === 0
                            ? 'text-slate-400'
                            : diferencia > 0
                              ? 'text-emerald-700'
                              : 'text-red-700'
                        }`}
                      >
                        {diferencia === null
                          ? '—'
                          : diferencia === 0
                            ? '0'
                            : `${diferencia > 0 ? '+' : '−'}${cantidad(String(Math.abs(diferencia)))}`}
                      </td>
                      <td className={`${td} text-right`}>
                        <button
                          type="button"
                          onClick={() => setLineas((ls) => ls.filter((x) => x.id !== l.id))}
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          aria-label={`Quitar ${l.codigo}`}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Tabla>
          )}
          {lineas.length > 0 && (
            <div className="mt-4 grid items-end gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[1fr_auto]">
              <Campo
                etiqueta="Referencia (opcional)"
                placeholder="Ej.: Conteo pasillo 3"
                maxLength={60}
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
              />
              <Boton disabled={incompletas.length > 0} onClick={() => setConfirmando(true)}>
                Registrar conteo
              </Boton>
              {incompletas.length > 0 && (
                <p className="text-xs text-slate-500 sm:col-span-2">
                  Falta la cantidad contada de {incompletas.length} producto{incompletas.length === 1 ? '' : 's'}.
                </p>
              )}
            </div>
          )}
        </Tarjeta>
      </div>

      <Modal titulo="Registrar conteo" abierto={confirmando} alCerrar={() => setConfirmando(false)}>
        <div className="space-y-3 text-sm text-slate-700">
          <p>
            Se contaron <strong>{lineas.length}</strong> productos.{' '}
            {conDiferencia.length > 0 ? (
              <>
                <strong>{conDiferencia.length}</strong> tienen diferencias y su existencia se ajustará a lo contado.
              </>
            ) : (
              'Ninguno tiene diferencias con el sistema.'
            )}
          </p>
          <p className="text-xs text-slate-500">
            La diferencia se calcula con la existencia del sistema al momento de registrar. Si hubo movimientos después de contar,
            revise el resultado.
          </p>
          <div className="flex justify-end gap-2">
            <Boton variante="fantasma" onClick={() => setConfirmando(false)}>
              Cancelar
            </Boton>
            <Boton cargando={registrar.isPending} onClick={() => registrar.mutate()}>
              Registrar
            </Boton>
          </div>
        </div>
      </Modal>
    </>
  );
}

const COLUMNAS_DIFERENCIAS = ['Código', 'Descripción', 'Sistema', 'Contado', 'Diferencia'];

function TablaDiferencias({ filas }: { filas: ResultadoConteo['lineas'] }) {
  return (
    <Tabla>
      <thead>
        <tr>
          {COLUMNAS_DIFERENCIAS.map((c, i) => (
            <th key={c} className={`${th} ${i >= 2 ? 'text-right' : ''}`}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {filas.map((l) => {
          const d = Number(l.diferencia);
          return (
            <tr key={l.productoId}>
              <td className={`${td} font-mono text-xs text-slate-600`}>{l.codigo}</td>
              <td className={td}>{l.descripcion}</td>
              <td className={`${td} cifra text-right`}>{cantidad(l.anterior)}</td>
              <td className={`${td} cifra text-right`}>{cantidad(l.contado)}</td>
              <td className={`${td} cifra text-right font-medium ${d > 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {d > 0 ? '+' : '−'}
                {cantidad(String(Math.abs(d)))}
              </td>
            </tr>
          );
        })}
      </tbody>
    </Tabla>
  );
}
