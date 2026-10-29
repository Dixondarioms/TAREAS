import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAvisos } from '../componentes/avisos';
import { cantidad } from '../componentes/inventario';
import {
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
import { Compra, ResumenPorPagar, simbolo } from '../lib/compras';
import { aDecimalApi, fecha, numero } from '../lib/formato';
import { useSesion } from '../lib/sesion';
import { Pagina } from '../lib/tipos';
import { LISTA_METODOS, METODOS } from '../lib/ventas';

const hoy = () => new Date().toLocaleDateString('en-CA');

export function Compras() {
  const { puede } = useSesion();
  const [pestana, setPestana] = useState<'compras' | 'porPagar'>('compras');
  const [abierta, setAbierta] = useState<number | null>(null);
  return (
    <>
      <Encabezado
        titulo="Compras"
        descripcion="Mercancía recibida de proveedores y lo que falta por pagarles."
        acciones={
          <Link to="/compras/nueva">
            <Boton icono={<Plus className="size-4" />}>Registrar compra</Boton>
          </Link>
        }
      />
      {puede('GERENTE') && (
        <div className="mb-4 flex w-fit gap-1 rounded-lg bg-slate-200/70 p-1 print:hidden" role="tablist">
          {(
            [
              ['compras', 'Compras'],
              ['porPagar', 'Cuentas por pagar'],
            ] as const
          ).map(([valor, texto]) => (
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
      )}
      {pestana === 'compras' ? <ListaCompras alAbrir={setAbierta} /> : <PorPagar alAbrir={setAbierta} />}
      <DetalleCompra id={abierta} alCerrar={() => setAbierta(null)} />
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
                  <span className="cifra">{c.numero}</span> {!c.facturaCompraId && <Insignia>Nota de entrega</Insignia>}
                </td>
                <td className={td}>{c.proveedor.razonSocial}</td>
                <td className={`${td} cifra text-right`}>
                  {simbolo(c.moneda)} {numero(c.total, 2)}
                </td>
                <td className={`${td} cifra text-right`}>
                  {Number(c.saldo) > 0 ? (
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
            {c.facturaCompraId ? (
              <Insignia color="azul">En el libro de compras</Insignia>
            ) : (
              <Insignia>Nota de entrega (sin factura)</Insignia>
            )}
            {c.actualizoCostos && <Insignia color="verde">Actualizó costos</Insignia>}
          </div>
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
            <Fila texto="Saldo por pagar" valor={`${s} ${numero(c.saldo, 2)}`} fuerte />
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

          {puede('GERENTE') && Number(c.saldo) > 0 && (
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
