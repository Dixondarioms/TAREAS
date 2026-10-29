import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Plus, Printer, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAvisos } from '../componentes/avisos';
import { cantidad } from '../componentes/inventario';
import {
  AreaTexto,
  Aviso,
  Boton,
  Campo,
  Cargando,
  Encabezado,
  Insignia,
  Modal,
  Paginador,
  Selector,
  Tabla,
  Tarjeta,
  td,
  th,
} from '../componentes/ui';
import { api } from '../lib/api';
import { Compra, ESTADOS_ORDEN, EstadoOrden, OrdenCompra, ResumenPorPagar, simbolo } from '../lib/compras';
import { useConfiguracion } from '../lib/consultas';
import { aDecimalApi, fecha, numero } from '../lib/formato';
import { useSesion } from '../lib/sesion';
import { Pagina } from '../lib/tipos';
import { LISTA_METODOS, METODOS } from '../lib/ventas';

const hoy = () => new Date().toLocaleDateString('en-CA');

type Pestana = 'compras' | 'ordenes' | 'porPagar';

export function Compras() {
  const { puede } = useSesion();
  // ?vista=ordenes&orden=N abre una orden recién creada para imprimirla.
  const [parametros] = useSearchParams();
  const [pestana, setPestana] = useState<Pestana>(parametros.get('vista') === 'ordenes' ? 'ordenes' : 'compras');
  const [abierta, setAbierta] = useState<number | null>(null);
  const [ordenAbierta, setOrdenAbierta] = useState<number | null>(Number(parametros.get('orden')) || null);
  const pestanas: [Pestana, string][] = [
    ['compras', 'Compras'],
    ['ordenes', 'Órdenes de compra'],
    ...(puede('GERENTE') ? [['porPagar', 'Cuentas por pagar'] as [Pestana, string]] : []),
  ];
  return (
    <>
      <div className={abierta !== null || ordenAbierta !== null ? 'print:hidden' : undefined}>
        <Encabezado
          titulo="Compras"
          descripcion="Pedidos a proveedores, mercancía recibida y lo que falta por pagarles."
          acciones={
            <>
              <Link to="/compras/ordenes/nueva">
                <Boton variante="secundario" icono={<ClipboardList className="size-4" />}>
                  Nueva orden
                </Boton>
              </Link>
              <Link to="/compras/nueva">
                <Boton icono={<Plus className="size-4" />}>Registrar compra</Boton>
              </Link>
            </>
          }
        />
        <div className="mb-4 flex w-fit gap-1 rounded-lg bg-slate-200/70 p-1 print:hidden" role="tablist">
          {pestanas.map(([valor, texto]) => (
            <button
              key={valor}
              type="button"
              role="tab"
              aria-selected={pestana === valor}
              onClick={() => setPestana(valor)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${pestana === valor ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
            >
              {texto}
            </button>
          ))}
        </div>
        {pestana === 'compras' ? (
          <ListaCompras alAbrir={setAbierta} />
        ) : pestana === 'ordenes' ? (
          <ListaOrdenes alAbrir={setOrdenAbierta} />
        ) : (
          <PorPagar alAbrir={setAbierta} />
        )}
      </div>
      <DetalleCompra id={abierta} alCerrar={() => setAbierta(null)} />
      <DetalleOrden id={ordenAbierta} alCerrar={() => setOrdenAbierta(null)} alAbrirCompra={setAbierta} />
    </>
  );
}

function ListaCompras({ alAbrir }: { alAbrir: (id: number) => void }) {
  const [texto, setTexto] = useState('');
  const [filtro, setFiltro] = useState({ q: '', pago: '' });
  const [pagina, setPagina] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => {
      setFiltro((f) => ({ ...f, q: texto }));
      setPagina(1);
    }, 300);
    return () => clearTimeout(t);
  }, [texto]);
  const lista = useQuery({
    queryKey: ['compras', 'lista', filtro, pagina],
    queryFn: () => api.get<Pagina<Compra>>('/compras', { ...filtro, pagina, porPagina: 50 }),
    placeholderData: keepPreviousData,
  });
  return (
    <Tarjeta>
      <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_12rem]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-slate-400" />
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="N° de documento o proveedor…"
            className="block w-full rounded-lg border-0 py-2 pr-3 pl-9 text-sm ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-marca-500"
            aria-label="Buscar compras"
          />
        </div>
        <Selector
          aria-label="Estado de pago"
          value={filtro.pago}
          onChange={(e) => {
            setFiltro({ ...filtro, pago: e.target.value });
            setPagina(1);
          }}
        >
          <option value="">Todas</option>
          <option value="pendientes">Con saldo por pagar</option>
          <option value="pagadas">Pagadas</option>
          <option value="anuladas">Anuladas</option>
        </Selector>
      </div>
      {lista.error && <Aviso tipo="error">{lista.error.message}</Aviso>}
      {lista.isLoading ? (
        <Cargando />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th className={th}>Fecha</th>
              <th className={th}>Documento</th>
              <th className={th}>Proveedor</th>
              <th className={`${th} text-right`}>Total</th>
              <th className={`${th} text-right`}>Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lista.data?.datos.map((c) => (
              <tr key={c.id} className="cursor-pointer hover:bg-marca-50/60" onClick={() => alAbrir(c.id)}>
                <td className={`${td} whitespace-nowrap`}>{fecha(c.fecha)}</td>
                <td className={td}>
                  <span className="cifra">{c.numero}</span>{' '}
                  {!c.facturaCompraId && c.estado === 'REGISTRADA' && <Insignia>Nota de entrega</Insignia>}
                </td>
                <td className={td}>{c.proveedor.razonSocial}</td>
                <td className={`${td} cifra text-right`}>
                  {simbolo(c.moneda)} {numero(c.total, 2)}
                </td>
                <td className={`${td} cifra text-right`}>
                  {c.estado === 'ANULADA' ? (
                    <Insignia color="rojo">Anulada</Insignia>
                  ) : Number(c.saldo) > 0 ? (
                    <span className="font-medium text-amber-800">
                      {simbolo(c.moneda)} {numero(c.saldo, 2)}
                    </span>
                  ) : (
                    <Insignia color="verde">Pagada</Insignia>
                  )}
                </td>
              </tr>
            ))}
            {lista.data?.datos.length === 0 && (
              <tr>
                <td colSpan={5} className={`${td} py-8 text-center text-slate-500`}>
                  No hay compras registradas.
                </td>
              </tr>
            )}
          </tbody>
        </Tabla>
      )}
      {lista.data && (
        <Paginador pagina={pagina} porPagina={lista.data.porPagina} total={lista.data.total} alCambiar={setPagina} />
      )}
    </Tarjeta>
  );
}

function PorPagar({ alAbrir }: { alAbrir: (id: number) => void }) {
  const r = useQuery({ queryKey: ['compras', 'por-pagar'], queryFn: () => api.get<ResumenPorPagar>('/compras/por-pagar') });
  if (r.isLoading) return <Cargando />;
  if (r.error) return <Aviso tipo="error">{r.error.message}</Aviso>;
  const d = r.data!;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {d.totales.map((t) => (
          <div key={t.moneda} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">
              Por pagar en {t.moneda === 'USD' ? 'dólares' : 'bolívares'}
            </div>
            <div className="cifra mt-1 text-2xl font-semibold text-slate-900">
              {simbolo(t.moneda)} {numero(t.saldo, 2)}
            </div>
            {Number(t.vencido) > 0 && (
              <div className="cifra text-sm text-red-700">
                Vencido: {simbolo(t.moneda)} {numero(t.vencido, 2)}
              </div>
            )}
          </div>
        ))}
      </div>
      <Tarjeta>
        <Tabla>
          <thead>
            <tr>
              <th className={th}>Vence</th>
              <th className={th}>Proveedor</th>
              <th className={th}>Documento</th>
              <th className={`${th} text-right`}>Total</th>
              <th className={`${th} text-right`}>Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {d.cuentas.map((c) => (
              <tr key={c.id} className="cursor-pointer hover:bg-marca-50/60" onClick={() => alAbrir(c.id)}>
                <td className={`${td} whitespace-nowrap`}>
                  {fecha(c.vencimiento)}{' '}
                  {c.diasVencida > 0 ? (
                    <Insignia color="rojo">Vencida hace {c.diasVencida} d</Insignia>
                  ) : c.diasVencida === 0 ? (
                    <Insignia color="ambar">Vence hoy</Insignia>
                  ) : (
                    <span className="text-xs text-slate-500">en {-c.diasVencida} d</span>
                  )}
                </td>
                <td className={td}>
                  <div>{c.proveedor.razonSocial}</div>
                  <div className="text-xs text-slate-500">{c.proveedor.rif}</div>
                </td>
                <td className={`${td} cifra`}>{c.numero}</td>
                <td className={`${td} cifra text-right text-slate-500`}>
                  {simbolo(c.moneda)} {numero(c.total, 2)}
                </td>
                <td className={`${td} cifra text-right font-medium`}>
                  {simbolo(c.moneda)} {numero(c.saldo, 2)}
                </td>
              </tr>
            ))}
            {d.cuentas.length === 0 && (
              <tr>
                <td colSpan={5} className={`${td} py-8 text-center text-slate-500`}>
                  No hay deudas con proveedores.
                </td>
              </tr>
            )}
          </tbody>
        </Tabla>
      </Tarjeta>
    </div>
  );
}

function DetalleCompra({ id, alCerrar }: { id: number | null; alCerrar: () => void }) {
  const { puede } = useSesion();
  const avisos = useAvisos();
  const consultas = useQueryClient();
  const [pago, setPago] = useState({ fecha: hoy(), metodo: 'TRANSFERENCIA', monto: '', referencia: '' });
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const compra = useQuery({
    queryKey: ['compras', 'detalle', id],
    queryFn: () => api.get<Compra>(`/compras/${id}`),
    enabled: id !== null,
  });
  const pagar = useMutation({
    mutationFn: () =>
      api.post<Compra>(`/compras/${id}/pagos`, {
        ...pago,
        monto: aDecimalApi(pago.monto),
        referencia: pago.referencia || undefined,
      }),
    onSuccess: () => {
      avisos.exito('Pago registrado');
      setPago({ ...pago, monto: '', referencia: '' });
      void consultas.invalidateQueries({ queryKey: ['compras'] });
    },
    onError: avisos.error,
  });
  const anular = useMutation({
    mutationFn: () => api.post<Compra>(`/compras/${id}/anular`, { motivo }),
    onSuccess: (r) => {
      avisos.exito(`Compra ${r.numero} anulada: la mercancía salió del inventario`);
      setAnulando(false);
      setMotivo('');
      for (const clave of ['compras', 'productos', 'inventario', 'fiscal'])
        void consultas.invalidateQueries({ queryKey: [clave] });
    },
    onError: avisos.error,
  });
  const c = compra.data;
  const s = c ? simbolo(c.moneda) : '';
  return (
    <Modal
      titulo={c ? `${c.proveedor.razonSocial} · ${c.numero}` : 'Compra'}
      abierto={id !== null}
      alCerrar={alCerrar}
      ancho="max-w-3xl"
    >
      {!c ? (
        <Cargando />
      ) : (
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Dato titulo="Fecha" valor={fecha(c.fecha)} />
            <Dato titulo="N° de control" valor={c.numeroControl ?? '—'} />
            <Dato titulo="Condición" valor={c.condicion === 'CREDITO' ? `Crédito, vence ${fecha(c.vencimiento)}` : 'Contado'} />
            <Dato titulo="Tasa" valor={`Bs ${numero(c.tasa, 4)}`} />
          </div>
          <div className="flex flex-wrap gap-2">
            {c.estado === 'ANULADA' ? (
              <Insignia color="rojo">Anulada</Insignia>
            ) : c.facturaCompraId ? (
              <Insignia color="azul">En el libro de compras</Insignia>
            ) : (
              <Insignia>Nota de entrega (sin factura)</Insignia>
            )}
            {c.actualizoCostos && <Insignia color="verde">Actualizó costos</Insignia>}
            {c.ordenId && <Insignia color="azul">Orden de compra N° {c.ordenId}</Insignia>}
          </div>
          {c.estado === 'ANULADA' && (
            <Aviso tipo="error">
              Anulada el {fecha(c.anuladaEn)}: {c.motivoAnulacion}. La mercancía salió del inventario y el documento no cuenta en
              el libro de compras.
            </Aviso>
          )}
          <Tabla>
            <thead>
              <tr>
                <th className={th}>Producto</th>
                <th className={`${th} text-right`}>Cantidad</th>
                <th className={`${th} text-right`}>Costo unit.</th>
                <th className={`${th} text-right`}>Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {c.lineas?.map((l) => (
                <tr key={l.id}>
                  <td className={td}>
                    {l.descripcion}
                    {l.alicuotaIva === 'EXENTO' && <span className="text-slate-500"> (E)</span>}
                    <div className="font-mono text-xs text-slate-400">{l.codigo}</div>
                  </td>
                  <td className={`${td} cifra text-right whitespace-nowrap`}>
                    {cantidad(l.cantidad)} {l.unidad}
                  </td>
                  <td className={`${td} cifra text-right`}>
                    {s} {numero(l.costoUnitario, Number(l.costoUnitario) < 0.1 ? 4 : 2)}
                  </td>
                  <td className={`${td} cifra text-right`}>
                    {s} {numero(l.subtotal, 2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabla>
          <div className="ml-auto max-w-xs space-y-1">
            <Fila texto="Subtotal" valor={`${s} ${numero(c.subtotal, 2)}`} />
            <Fila texto="IVA" valor={`${s} ${numero(c.iva, 2)}`} />
            {Number(c.retencionIva) > 0 && (
              <Fila texto="IVA retenido (al SENIAT)" valor={`− ${s} ${numero(c.retencionIva, 2)}`} />
            )}
            <Fila texto="Total" valor={`${s} ${numero(c.total, 2)}`} fuerte />
            {c.estado === 'REGISTRADA' && <Fila texto="Saldo por pagar" valor={`${s} ${numero(c.saldo, 2)}`} fuerte />}
          </div>

          {c.pagos && c.pagos.length > 0 && (
            <div>
              <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">Pagos</div>
              <ul className="divide-y divide-slate-100">
                {c.pagos.map((p) => (
                  <li key={p.id} className="flex justify-between gap-3 py-1.5">
                    <span>
                      {fecha(p.fecha)} · {METODOS[p.metodo]?.nombre ?? p.metodo}
                      {p.referencia && ` · ref. ${p.referencia}`}
                    </span>
                    <span className="cifra">
                      {s} {numero(p.monto, 2)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {puede('GERENTE') && c.estado === 'REGISTRADA' && Number(c.saldo) > 0 && !anulando && (
            <form
              className="grid gap-2 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200 sm:grid-cols-[9rem_10rem_1fr_1fr_auto] sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                pagar.mutate();
              }}
            >
              <Campo
                etiqueta="Fecha"
                type="date"
                required
                value={pago.fecha}
                onChange={(e) => setPago({ ...pago, fecha: e.target.value })}
              />
              <Selector etiqueta="Método" value={pago.metodo} onChange={(e) => setPago({ ...pago, metodo: e.target.value })}>
                {LISTA_METODOS.map((m) => (
                  <option key={m} value={m}>
                    {METODOS[m].nombre}
                  </option>
                ))}
              </Selector>
              <Campo
                etiqueta={`Monto (${s})`}
                inputMode="decimal"
                required
                placeholder={numero(c.saldo, 2)}
                value={pago.monto}
                onChange={(e) => setPago({ ...pago, monto: e.target.value })}
              />
              <Campo
                etiqueta="Referencia"
                value={pago.referencia}
                onChange={(e) => setPago({ ...pago, referencia: e.target.value })}
              />
              <Boton type="submit" cargando={pagar.isPending}>
                Registrar pago
              </Boton>
              <p className="text-xs text-slate-500 sm:col-span-5">
                El monto va en la moneda de la compra. Si paga en efectivo de la caja, registre también un retiro en Caja.
              </p>
            </form>
          )}

          {puede('GERENTE') &&
            c.estado === 'REGISTRADA' &&
            !c.pagos?.length &&
            (anulando ? (
              <form
                className="space-y-3 rounded-lg bg-red-50 p-3 ring-1 ring-red-200"
                onSubmit={(e) => {
                  e.preventDefault();
                  anular.mutate();
                }}
              >
                <p className="text-slate-700">
                  La mercancía sale del inventario, el costo vuelve al anterior (si nadie lo cambió después) y el documento se
                  quita del libro de compras. Úselo solo para compras registradas por error.
                </p>
                <AreaTexto
                  etiqueta="Motivo"
                  required
                  minLength={3}
                  rows={2}
                  placeholder="Ej.: se cargó dos veces, proveedor equivocado"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <Boton variante="fantasma" onClick={() => setAnulando(false)}>
                    Volver
                  </Boton>
                  <Boton type="submit" variante="peligro" cargando={anular.isPending}>
                    Anular compra
                  </Boton>
                </div>
              </form>
            ) : (
              <div className="flex justify-end border-t border-slate-100 pt-3">
                <Boton variante="secundario" onClick={() => setAnulando(true)}>
                  Anular compra
                </Boton>
              </div>
            ))}
        </div>
      )}
    </Modal>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500 uppercase">{titulo}</div>
      <div className="font-medium text-slate-900">{valor}</div>
    </div>
  );
}

function Fila({ texto, valor, fuerte = false }: { texto: string; valor: string; fuerte?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${fuerte ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>
      <span>{texto}</span>
      <span className="cifra">{valor}</span>
    </div>
  );
}

function ListaOrdenes({ alAbrir }: { alAbrir: (id: number) => void }) {
  const [estado, setEstado] = useState('abiertas');
  const [pagina, setPagina] = useState(1);
  const lista = useQuery({
    queryKey: ['compras', 'ordenes', 'lista', estado, pagina],
    queryFn: () => api.get<Pagina<OrdenCompra>>('/compras/ordenes', { estado: estado || undefined, pagina, porPagina: 50 }),
    placeholderData: keepPreviousData,
  });
  return (
    <Tarjeta>
      <div className="mb-3 max-w-xs">
        <Selector
          aria-label="Estado de las órdenes"
          value={estado}
          onChange={(e) => {
            setEstado(e.target.value);
            setPagina(1);
          }}
        >
          <option value="abiertas">Por recibir</option>
          <option value="">Todas</option>
          {(Object.keys(ESTADOS_ORDEN) as EstadoOrden[]).map((e) => (
            <option key={e} value={e}>
              {ESTADOS_ORDEN[e].texto}
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
              <th className={th}>N°</th>
              <th className={th}>Fecha</th>
              <th className={th}>Proveedor</th>
              <th className={th}>Estado</th>
              <th className={`${th} text-right`}>Estimado sin IVA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lista.data?.datos.map((o) => (
              <tr key={o.id} className="cursor-pointer hover:bg-marca-50/60" onClick={() => alAbrir(o.id)}>
                <td className={`${td} cifra`}>{o.id}</td>
                <td className={`${td} whitespace-nowrap`}>{fecha(o.fecha)}</td>
                <td className={td}>{o.proveedor.razonSocial}</td>
                <td className={td}>
                  <Insignia color={ESTADOS_ORDEN[o.estado].color}>{ESTADOS_ORDEN[o.estado].texto}</Insignia>
                </td>
                <td className={`${td} cifra text-right`}>
                  {simbolo(o.moneda)} {numero(o.subtotal, 2)}
                </td>
              </tr>
            ))}
            {lista.data?.datos.length === 0 && (
              <tr>
                <td colSpan={5} className={`${td} py-8 text-center text-slate-500`}>
                  {estado === 'abiertas' ? 'No hay órdenes por recibir.' : 'No hay órdenes de compra.'}
                </td>
              </tr>
            )}
          </tbody>
        </Tabla>
      )}
      {lista.data && (
        <Paginador pagina={pagina} porPagina={lista.data.porPagina} total={lista.data.total} alCambiar={setPagina} />
      )}
    </Tarjeta>
  );
}

function DetalleOrden({
  id,
  alCerrar,
  alAbrirCompra,
}: {
  id: number | null;
  alCerrar: () => void;
  alAbrirCompra: (id: number) => void;
}) {
  const avisos = useAvisos();
  const consultas = useQueryClient();
  const config = useConfiguracion();
  const empresa = config.data?.empresa;
  const orden = useQuery({
    queryKey: ['compras', 'ordenes', 'detalle', id],
    queryFn: () => api.get<OrdenCompra>(`/compras/ordenes/${id}`),
    enabled: id !== null,
  });
  const cancelar = useMutation({
    mutationFn: () => api.post<OrdenCompra>(`/compras/ordenes/${id}/cancelar`),
    onSuccess: (o) => {
      avisos.exito(`Orden N° ${o.id} cancelada`);
      void consultas.invalidateQueries({ queryKey: ['compras', 'ordenes'] });
    },
    onError: avisos.error,
  });
  const o = orden.data;
  const s = o ? simbolo(o.moneda) : '';
  const abierta = o?.estado === 'PENDIENTE' || o?.estado === 'PARCIAL';
  const recibida = o?.estado !== 'PENDIENTE';
  return (
    <Modal
      titulo={o ? `Orden de compra N° ${o.id}` : 'Orden de compra'}
      abierto={id !== null}
      alCerrar={alCerrar}
      ancho="max-w-3xl"
    >
      {!o ? (
        <Cargando />
      ) : (
        <div className="space-y-4 text-sm">
          {/* Membrete: solo en papel, para enviarla al proveedor. */}
          <div className="hidden border-b border-slate-300 pb-3 print:block">
            <div className="text-base font-semibold text-slate-900">{empresa?.razonSocial}</div>
            {empresa?.rif && <div>RIF {empresa.rif}</div>}
            {empresa?.direccion && <div>{empresa.direccion}</div>}
            <div className="mt-2 text-lg font-semibold">Orden de compra N° {o.id}</div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Dato titulo="Proveedor" valor={o.proveedor.razonSocial} />
            <Dato titulo="RIF" valor={o.proveedor.rif} />
            <Dato titulo="Fecha" valor={fecha(o.fecha)} />
            <div className="print:hidden">
              <div className="text-xs text-slate-500 uppercase">Estado</div>
              <Insignia color={ESTADOS_ORDEN[o.estado].color}>{ESTADOS_ORDEN[o.estado].texto}</Insignia>
            </div>
          </div>
          <Tabla>
            <thead>
              <tr>
                <th className={th}>Producto</th>
                <th className={`${th} text-right`}>Cantidad</th>
                {recibida && <th className={`${th} text-right print:hidden`}>Recibido</th>}
                <th className={`${th} text-right`}>Costo unit.</th>
                <th className={`${th} text-right`}>Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {o.lineas?.map((l) => {
                const completa = Number(l.cantidadRecibida) >= Number(l.cantidad);
                return (
                  <tr key={l.id}>
                    <td className={td}>
                      {l.descripcion}
                      <div className="font-mono text-xs text-slate-400">{l.codigo}</div>
                    </td>
                    <td className={`${td} cifra text-right whitespace-nowrap`}>
                      {cantidad(l.cantidad)} {l.unidad}
                    </td>
                    {recibida && (
                      <td
                        className={`${td} cifra text-right whitespace-nowrap print:hidden ${completa ? 'text-emerald-700' : 'text-amber-800'}`}
                      >
                        {cantidad(l.cantidadRecibida)}
                      </td>
                    )}
                    <td className={`${td} cifra text-right`}>
                      {s} {numero(l.costoUnitario, Number(l.costoUnitario) < 0.1 ? 4 : 2)}
                    </td>
                    <td className={`${td} cifra text-right`}>
                      {s} {numero(Number(l.cantidad) * Number(l.costoUnitario), 2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Tabla>
          <div className="ml-auto max-w-xs">
            <Fila texto="Estimado sin IVA" valor={`${s} ${numero(o.subtotal, 2)}`} fuerte />
          </div>
          {o.notas && (
            <p className="text-slate-700">
              <span className="font-medium">Notas:</span> {o.notas}
            </p>
          )}

          {o.compras && o.compras.length > 0 && (
            <div className="print:hidden">
              <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">Recepciones</div>
              <ul className="divide-y divide-slate-100">
                {o.compras.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="flex w-full justify-between gap-3 py-1.5 text-left hover:text-marca-700"
                      onClick={() => alAbrirCompra(c.id)}
                    >
                      <span>
                        {fecha(c.fecha)} · documento <span className="cifra">{c.numero}</span>{' '}
                        {c.estado === 'ANULADA' && <Insignia color="rojo">Anulada</Insignia>}
                      </span>
                      <span className="cifra">
                        {simbolo(c.moneda)} {numero(c.total, 2)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3 print:hidden">
            {abierta && (
              <>
                <Boton
                  variante="fantasma"
                  cargando={cancelar.isPending}
                  onClick={() => {
                    if (window.confirm(`¿Cancelar la orden N° ${o.id}? Lo que falta por llegar ya no se esperará.`))
                      cancelar.mutate();
                  }}
                >
                  Cancelar orden
                </Boton>
                <Link to={`/compras/nueva?orden=${o.id}`}>
                  <Boton variante="secundario">Recibir mercancía</Boton>
                </Link>
              </>
            )}
            <Boton icono={<Printer className="size-4" />} onClick={() => window.print()}>
              Imprimir
            </Boton>
          </div>
        </div>
      )}
    </Modal>
  );
}
