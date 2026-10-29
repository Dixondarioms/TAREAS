import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Minus, Plus, Printer, ScanBarcode, Trash2, UserRound, X } from 'lucide-react';
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useAvisos } from '../componentes/avisos';
import { ResumenFactura } from '../componentes/factura';
import { cantidad as formatoCantidad } from '../componentes/inventario';
import { Aviso, Boton, Campo, Cargando, Encabezado, Modal, Selector, Tarjeta } from '../componentes/ui';
import { api, ErrorApi } from '../lib/api';
import { useListas } from '../lib/consultas';
import { aDecimalApi, bs, numero, usd } from '../lib/formato';
import { ProductoDetalle, ResultadoBusqueda } from '../lib/tipos';
import {
  Cliente,
  Cotizacion,
  EstadoFacturacion,
  LISTA_METODOS,
  MetodoPago,
  METODOS,
  CajaActual,
  cajaAbierta,
  EstadoCuenta,
  simboloMoneda,
  Venta,
} from '../lib/ventas';

interface LineaCarrito {
  clave: string;
  productoId: number;
  codigo: string;
  descripcion: string;
  presentacionId: number | null;
  /** Unidades disponibles: base y presentaciones. */
  opciones: { presentacionId: number | null; unidad: string; factor: string; decimales: boolean }[];
  cantidad: string;
}

interface PagoForm {
  metodo: MetodoPago;
  monto: string;
  referencia: string;
}

const esCantidad = (t: string) => /^\d+([.,]\d{1,3})?$/.test(t.trim()) && Number(aDecimalApi(t)) > 0;

function lineaDesdeDetalle(p: ProductoDetalle, presentacionId: number | null): LineaCarrito {
  return {
    clave: `${p.id}-${presentacionId ?? 'base'}`,
    productoId: p.id,
    codigo: p.codigo,
    descripcion: p.descripcion,
    presentacionId,
    opciones: [
      { presentacionId: null, unidad: p.unidadBase.codigo, factor: '1', decimales: p.unidadBase.permiteDecimales },
      ...p.presentaciones.map((pr) => ({
        presentacionId: pr.id,
        unidad: pr.unidad.codigo,
        factor: pr.factor,
        decimales: pr.unidad.permiteDecimales,
      })),
    ],
    cantidad: '1',
  };
}

export function PuntoDeVenta() {
  const avisos = useAvisos();
  const consultas = useQueryClient();
  const listas = useListas();
  const caja = useQuery({ queryKey: ['caja', 'actual'], queryFn: () => api.get<CajaActual>('/caja/actual') });
  const facturacion = useQuery({
    queryKey: ['talonarios', 'estado'],
    queryFn: () => api.get<EstadoFacturacion>('/talonarios/estado'),
  });

  const [lineas, setLineas] = useState<LineaCarrito[]>([]);
  const [listaId, setListaId] = useState('');
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const credito = useQuery({
    queryKey: ['clientes', 'estado', cliente?.id],
    queryFn: () => api.get<EstadoCuenta>(`/clientes/${cliente!.id}/estado-cuenta`),
    enabled: Boolean(cliente && Number(cliente.limiteCreditoUsd) > 0),
  });
  const [texto, setTexto] = useState('');
  const [q, setQ] = useState('');
  const [cobrando, setCobrando] = useState(false);
  const [vendida, setVendida] = useState<Venta | null>(null);
  const buscador = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setQ(texto.trim()), 250);
    return () => clearTimeout(t);
  }, [texto]);

  const sugerencias = useQuery({
    queryKey: ['productos', 'pos', q, listaId],
    queryFn: () => api.get<ResultadoBusqueda>('/productos', { q, porPagina: 8, listaId }),
    enabled: q.length >= 2,
  });

  const lineasValidas = lineas.every((l) => esCantidad(l.cantidad));
  const cuerpoLineas = useMemo(
    () => lineas.map((l) => ({ productoId: l.productoId, presentacionId: l.presentacionId, cantidad: aDecimalApi(l.cantidad) })),
    [lineas],
  );
  const cotizacion = useQuery({
    queryKey: ['ventas', 'cotizar', cuerpoLineas, listaId],
    queryFn: () =>
      api.post<Cotizacion>('/ventas/cotizar', {
        lineas: cuerpoLineas,
        pagos: [],
        listaId: listaId ? Number(listaId) : undefined,
      }),
    enabled: lineas.length > 0 && lineasValidas,
    placeholderData: keepPreviousData,
  });

  const agregar = async (productoId: number, presentacionId: number | null, detalle?: ProductoDetalle) => {
    const p = detalle ?? (await api.get<ProductoDetalle>(`/productos/${productoId}`));
    const nueva = lineaDesdeDetalle(p, presentacionId);
    setLineas((ls) => {
      const existente = ls.find((l) => l.clave === nueva.clave);
      if (existente) {
        return ls.map((l) =>
          l.clave === nueva.clave && esCantidad(l.cantidad) ? { ...l, cantidad: String(Number(aDecimalApi(l.cantidad)) + 1) } : l,
        );
      }
      return [...ls, nueva];
    });
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
      const r = await api.get<{ presentacionId: number | null; producto: ProductoDetalle }>(
        `/productos/por-codigo/${encodeURIComponent(codigo)}`,
      );
      await agregar(r.producto.id, r.presentacionId, r.producto);
    } catch (error) {
      const unico = sugerencias.data?.datos.length === 1 ? sugerencias.data.datos[0] : null;
      if (unico) await agregar(unico.id, null);
      else if (error instanceof ErrorApi && error.estado === 404) avisos.error(new Error(`No se encontró «${codigo}»`));
      else avisos.error(error);
    }
  };

  const cambiarLinea = (clave: string, cambios: Partial<LineaCarrito>) =>
    setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambios, clave: claveDe({ ...l, ...cambios }) } : l)));

  const nuevaVenta = () => {
    setVendida(null);
    setLineas([]);
    setCliente(null);
    setTimeout(() => buscador.current?.focus(), 0);
  };

  if (caja.isLoading || facturacion.isLoading) return <Cargando />;

  if (vendida) {
    return (
      <>
        <Encabezado
          titulo="Venta registrada"
          descripcion="Copie estos datos en la factura del talonario y entregue la factura al cliente."
          acciones={
            <>
              <Boton variante="secundario" icono={<Printer className="size-4" />} onClick={() => window.print()}>
                Imprimir
              </Boton>
              <Boton onClick={nuevaVenta} autoFocus>
                Nueva venta
              </Boton>
            </>
          }
        />
        <Tarjeta className="mx-auto max-w-2xl">
          <ResumenFactura venta={vendida} />
        </Tarjeta>
      </>
    );
  }

  if (!cajaAbierta(caja.data)) {
    return (
      <>
        <Encabezado titulo="Punto de venta" />
        <Tarjeta>
          <Aviso tipo="advertencia">Para vender, primero abra su caja con el fondo inicial.</Aviso>
          <Link to="/caja" className="mt-3 inline-block">
            <Boton>Abrir caja</Boton>
          </Link>
        </Tarjeta>
      </>
    );
  }

  const c = cotizacion.data;
  const proxima = facturacion.data?.proxima;
  return (
    <>
      <Encabezado
        titulo="Punto de venta"
        descripcion={
          proxima
            ? `Próxima factura N° ${proxima.serie ? `${proxima.serie}-` : ''}${proxima.numero} · control ${proxima.numeroControl}`
            : undefined
        }
      />
      {!proxima && (
        <div className="mb-4">
          <Aviso tipo="error">
            No quedan facturas en los talonarios activos. Un gerente debe registrar un talonario nuevo en{' '}
            <Link to="/facturacion" className="underline">
              Facturación
            </Link>
            .
          </Aviso>
        </div>
      )}
      {proxima && facturacion.data?.pocas && (
        <div className="mb-4">
          <Aviso tipo="advertencia">Quedan {facturacion.data.restantes} facturas en el talonario. Prepare el siguiente.</Aviso>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <Tarjeta>
          <div className="relative">
            <ScanBarcode className="pointer-events-none absolute top-2.5 left-3 size-4 text-slate-400" />
            <input
              ref={buscador}
              autoFocus
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => void alPresionarTecla(e)}
              placeholder="Escanee o escriba código o nombre del producto…"
              className="block w-full rounded-lg border-0 py-2.5 pr-3 pl-9 text-sm ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-marca-500"
              aria-label="Agregar producto"
            />
            {q.length >= 2 && (
              <ul className="absolute z-20 mt-1 max-h-80 w-full divide-y divide-slate-100 overflow-y-auto rounded-lg bg-white shadow-lg ring-1 ring-slate-200">
                {sugerencias.data?.datos.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => void agregar(p.id, null).catch(avisos.error)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-marca-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-slate-800">{p.descripcion}</span>
                        <span className="text-xs text-slate-500">
                          <span className="font-mono">{p.codigo}</span> · existencia {formatoCantidad(p.existencia)} {p.unidad}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="cifra block font-semibold text-slate-900">{bs(p.precio?.precioBsConIva)}</span>
                        <span className="cifra text-xs text-slate-500">{usd(p.precio?.precioUsdConIva)}</span>
                      </span>
                    </button>
                  </li>
                ))}
                {sugerencias.data?.datos.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">Sin resultados.</li>}
              </ul>
            )}
          </div>

          {lineas.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-500">Agregue productos con el lector o el buscador.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {lineas.map((l, i) => {
                const calculada = c?.lineas[i];
                const opcion = l.opciones.find((o) => o.presentacionId === l.presentacionId)!;
                const invalida = !esCantidad(l.cantidad) || (!opcion.decimales && !/^\d+$/.test(l.cantidad.trim()));
                return (
                  <li key={l.clave} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-slate-900">{l.descripcion}</div>
                      <div className="font-mono text-xs text-slate-500">{l.codigo}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="rounded p-1 text-slate-500 hover:bg-slate-100"
                        aria-label={`Restar uno a ${l.codigo}`}
                        onClick={() =>
                          esCantidad(l.cantidad) &&
                          Number(aDecimalApi(l.cantidad)) > 1 &&
                          cambiarLinea(l.clave, { cantidad: String(Number(aDecimalApi(l.cantidad)) - 1) })
                        }
                      >
                        <Minus className="size-4" />
                      </button>
                      <input
                        inputMode="decimal"
                        value={l.cantidad}
                        onChange={(e) => cambiarLinea(l.clave, { cantidad: e.target.value })}
                        aria-label={`Cantidad de ${l.codigo}`}
                        className={`cifra w-20 rounded-lg border-0 px-2 py-1.5 text-right text-sm ring-1 ring-inset focus:ring-2 focus:ring-marca-500 ${
                          invalida ? 'ring-red-400' : 'ring-slate-300'
                        }`}
                      />
                      <button
                        type="button"
                        className="rounded p-1 text-slate-500 hover:bg-slate-100"
                        aria-label={`Sumar uno a ${l.codigo}`}
                        onClick={() =>
                          esCantidad(l.cantidad) &&
                          cambiarLinea(l.clave, { cantidad: String(Number(aDecimalApi(l.cantidad)) + 1) })
                        }
                      >
                        <Plus className="size-4" />
                      </button>
                      {l.opciones.length > 1 ? (
                        <select
                          value={l.presentacionId ?? ''}
                          onChange={(e) =>
                            cambiarLinea(l.clave, { presentacionId: e.target.value ? Number(e.target.value) : null })
                          }
                          aria-label={`Unidad de ${l.codigo}`}
                          className="rounded-lg border-0 py-1.5 pr-7 pl-2 text-sm ring-1 ring-slate-300 ring-inset"
                        >
                          {l.opciones.map((o) => (
                            <option key={o.presentacionId ?? 'base'} value={o.presentacionId ?? ''}>
                              {o.unidad}
                              {o.presentacionId ? ` ×${formatoCantidad(o.factor)}` : ''}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="w-12 text-xs text-slate-500">{opcion.unidad}</span>
                      )}
                    </div>
                    <div className="w-28 text-right">
                      <div className="cifra font-semibold text-slate-900">{calculada ? bs(calculada.subtotalBs) : '—'}</div>
                      <div className="cifra text-xs text-slate-500">{calculada ? `${bs(calculada.precioBs)} c/u` : ''}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLineas((ls) => ls.filter((x) => x.clave !== l.clave))}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      aria-label={`Quitar ${l.codigo}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {cotizacion.error && (
            <div className="mt-3">
              <Aviso tipo="error">{cotizacion.error.message}</Aviso>
            </div>
          )}
        </Tarjeta>

        <div className="space-y-5">
          <SelectorCliente cliente={cliente} alCambiar={setCliente} credito={credito.data} />
          <Tarjeta titulo="Total">
            <div className="space-y-1 text-sm">
              <Selector
                aria-label="Lista de precios"
                value={listaId}
                onChange={(e) => setListaId(e.target.value)}
                contenedor="mb-3"
              >
                {listas.data
                  ?.filter((l) => l.activa)
                  .map((l, i) => (
                    <option key={l.id} value={i === 0 ? '' : l.id}>
                      {l.nombre}
                    </option>
                  ))}
              </Selector>
              {c && Number(c.baseExentaBs) > 0 && <Fila texto="Exento" valor={bs(c.baseExentaBs)} />}
              {c && Number(c.baseReducidaBs) > 0 && <Fila texto="Base reducida" valor={bs(c.baseReducidaBs)} />}
              {c && Number(c.ivaReducidaBs) > 0 && <Fila texto="IVA reducido" valor={bs(c.ivaReducidaBs)} />}
              <Fila texto="Base imponible" valor={c ? bs(c.baseGeneralBs) : '—'} />
              <Fila texto="IVA" valor={c ? bs(c.ivaGeneralBs) : '—'} />
              <div className="mt-2 border-t border-slate-200 pt-2">
                <div className="flex items-baseline justify-between">
                  <span className="font-medium text-slate-700">Total</span>
                  <span className="cifra text-2xl font-semibold text-slate-900">
                    {c && lineas.length ? bs(c.totalBs) : 'Bs 0,00'}
                  </span>
                </div>
                <div className="cifra text-right text-sm text-slate-500">
                  {c && lineas.length ? `$ ${numero(c.totalPagarUsd, 2)} · tasa ${numero(c.tasa.valor, 4)}` : ''}
                </div>
                {c?.cobraIgtf && <p className="mt-1 text-xs text-slate-500">Se suma 3 % de IGTF a lo que se pague en divisas.</p>}
              </div>
            </div>
            <Boton
              className="mt-4 w-full py-3 text-base"
              disabled={!lineas.length || !lineasValidas || !c || cotizacion.isFetching || !proxima}
              onClick={() => setCobrando(true)}
            >
              Cobrar
            </Boton>
          </Tarjeta>
        </div>
      </div>

      {cobrando && c && (
        <ModalCobro
          lineas={cuerpoLineas}
          listaId={listaId}
          clienteId={cliente?.id ?? null}
          creditoDisponibleUsd={credito.data ? credito.data.disponibleUsd : null}
          totalBs={c.totalBs}
          tasa={c.tasa.valor}
          alCerrar={() => setCobrando(false)}
          alVender={(v) => {
            setCobrando(false);
            setVendida(v);
            void consultas.invalidateQueries({ queryKey: ['caja'] });
            void consultas.invalidateQueries({ queryKey: ['talonarios'] });
            void consultas.invalidateQueries({ queryKey: ['productos'] });
            void consultas.invalidateQueries({ queryKey: ['inventario'] });
            void consultas.invalidateQueries({ queryKey: ['ventas'] });
            void consultas.invalidateQueries({ queryKey: ['clientes'] });
          }}
        />
      )}
    </>
  );
}

const claveDe = (l: Pick<LineaCarrito, 'productoId' | 'presentacionId'>) => `${l.productoId}-${l.presentacionId ?? 'base'}`;

function Fila({ texto, valor }: { texto: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3 text-slate-600">
      <span>{texto}</span>
      <span className="cifra">{valor}</span>
    </div>
  );
}

function SelectorCliente({
  cliente,
  alCambiar,
  credito,
}: {
  cliente: Cliente | null;
  alCambiar: (c: Cliente | null) => void;
  credito?: EstadoCuenta;
}) {
  const avisos = useAvisos();
  const [documento, setDocumento] = useState('');
  const [registrando, setRegistrando] = useState(false);
  const [form, setForm] = useState({ documento: '', nombre: '', direccion: '', telefono: '' });

  const buscar = useMutation({
    mutationFn: () => api.get<Cliente>(`/clientes/por-documento/${encodeURIComponent(documento.trim())}`),
    onSuccess: (c) => {
      alCambiar(c);
      setDocumento('');
    },
    onError: (e) => {
      if (e instanceof ErrorApi && e.estado === 404) {
        setForm({ documento: documento.trim(), nombre: '', direccion: '', telefono: '' });
        setRegistrando(true);
      } else avisos.error(e);
    },
  });
  const crear = useMutation({
    mutationFn: () =>
      api.post<Cliente>('/clientes', { ...form, direccion: form.direccion || null, telefono: form.telefono || null }),
    onSuccess: (c) => {
      alCambiar(c);
      setRegistrando(false);
      setDocumento('');
    },
    onError: avisos.error,
  });

  return (
    <Tarjeta titulo="Cliente">
      {cliente ? (
        <div className="flex items-start justify-between gap-2 text-sm">
          <div>
            <div className="font-medium text-slate-900">{cliente.nombre}</div>
            <div className="text-slate-500">{cliente.documento}</div>
            {credito && (
              <div className={`cifra text-xs ${Number(credito.vencidoUsd) > 0 ? 'text-red-700' : 'text-slate-500'}`}>
                Crédito disponible $ {numero(credito.disponibleUsd, 2)} · debe $ {numero(credito.saldoUsd, 2)}
                {Number(credito.vencidoUsd) > 0 && ` (vencido $ ${numero(credito.vencidoUsd, 2)})`}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => alCambiar(null)}
            className="rounded p-1 text-slate-400 hover:bg-slate-100"
            aria-label="Quitar cliente"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <form
          className="flex gap-2"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (documento.trim()) buscar.mutate();
          }}
        >
          <Campo
            contenedor="flex-1"
            placeholder="Cédula o RIF (vacío: consumidor final)"
            aria-label="Cédula o RIF del cliente"
            value={documento}
            onChange={(e) => setDocumento(e.target.value)}
          />
          <Boton type="submit" variante="secundario" cargando={buscar.isPending} icono={<UserRound className="size-4" />}>
            Buscar
          </Boton>
        </form>
      )}
      {!cliente && <p className="mt-2 text-xs text-slate-500">Sin cliente, la factura sale a «Consumidor final».</p>}

      <Modal titulo="Registrar cliente" abierto={registrando} alCerrar={() => setRegistrando(false)}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            crear.mutate();
          }}
        >
          <Aviso tipo="info">El documento {form.documento} no está registrado.</Aviso>
          <Campo
            etiqueta="Cédula o RIF"
            required
            value={form.documento}
            onChange={(e) => setForm({ ...form, documento: e.target.value })}
          />
          <Campo
            etiqueta="Nombre o razón social"
            required
            minLength={2}
            autoFocus
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
          />
          <Campo
            etiqueta="Dirección fiscal"
            value={form.direccion}
            onChange={(e) => setForm({ ...form, direccion: e.target.value })}
          />
          <Campo etiqueta="Teléfono" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
          <div className="flex justify-end gap-2">
            <Boton variante="fantasma" onClick={() => setRegistrando(false)}>
              Cancelar
            </Boton>
            <Boton type="submit" cargando={crear.isPending}>
              Registrar
            </Boton>
          </div>
        </form>
      </Modal>
    </Tarjeta>
  );
}

function ModalCobro({
  lineas,
  listaId,
  clienteId,
  creditoDisponibleUsd,
  totalBs,
  tasa,
  alCerrar,
  alVender,
}: {
  lineas: { productoId: number; presentacionId: number | null; cantidad: string }[];
  listaId: string;
  clienteId: number | null;
  /** Null si el cliente no compra a crédito. */
  creditoDisponibleUsd: string | null;
  totalBs: string;
  tasa: string;
  alCerrar: () => void;
  alVender: (v: Venta) => void;
}) {
  const avisos = useAvisos();
  const [pagos, setPagos] = useState<PagoForm[]>([]);
  const [nuevo, setNuevo] = useState<PagoForm>({ metodo: 'EFECTIVO_BS', monto: '', referencia: '' });
  const [vueltoMetodo, setVueltoMetodo] = useState<MetodoPago>('EFECTIVO_BS');

  const cuerpo = {
    lineas,
    listaId: listaId ? Number(listaId) : undefined,
    pagos: pagos.map((p) => ({ metodo: p.metodo, monto: aDecimalApi(p.monto), referencia: p.referencia || undefined })),
    vueltoMetodo,
  };
  const cuadre = useQuery({
    queryKey: ['ventas', 'cotizar', 'cobro', cuerpo],
    queryFn: () => api.post<Cotizacion>('/ventas/cotizar', cuerpo),
    placeholderData: keepPreviousData,
  });
  const c = cuadre.data;
  const faltante = c ? Number(c.faltanteBs) : Number(totalBs);

  /** Lo que falta, expresado en la moneda del método (USD redondeado hacia arriba al céntimo). */
  const faltanteEn = (m: MetodoPago) => {
    if (faltante <= 0) return '';
    if (m === 'CREDITO') {
      // No más de lo que le queda de crédito.
      const disponibleBs = Math.floor(Number(creditoDisponibleUsd ?? 0) * Number(tasa) * 100) / 100;
      return Math.min(faltante, disponibleBs).toFixed(2);
    }
    if (METODOS[m].moneda === 'BS') return faltante.toFixed(2);
    // Con IGTF el monto en divisas también genera impuesto: se estima por encima y el vuelto ajusta.
    const factor = c?.cobraIgtf ? 1.03 : 1;
    return (Math.ceil(((faltante * factor) / Number(tasa)) * 100) / 100).toFixed(2);
  };

  const agregarPago = (e?: FormEvent) => {
    e?.preventDefault();
    const monto = aDecimalApi(nuevo.monto || faltanteEn(nuevo.metodo));
    if (!(Number(monto) > 0)) return;
    if (METODOS[nuevo.metodo].referencia && !nuevo.referencia.trim()) {
      avisos.error(new Error(`Indique la referencia del pago por ${METODOS[nuevo.metodo].nombre}`));
      return;
    }
    setPagos((ps) => [...ps, { ...nuevo, monto }]);
    setNuevo({ ...nuevo, monto: '', referencia: '' });
  };

  const vender = useMutation({
    mutationFn: () => api.post<Venta>('/ventas', { ...cuerpo, clienteId }),
    onSuccess: alVender,
    onError: avisos.error,
  });

  const listo = c && Number(c.faltanteBs) === 0 && pagos.length > 0;
  return (
    <Modal titulo="Cobrar" abierto alCerrar={alCerrar} ancho="max-w-xl">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm">
          <div>
            <div className="text-xs text-slate-500 uppercase">Total a pagar</div>
            <div className="cifra text-xl font-semibold text-slate-900">{bs(c?.totalPagarBs ?? totalBs)}</div>
            <div className="cifra text-slate-500">$ {numero(c?.totalPagarUsd ?? '0', 2)}</div>
            {c && Number(c.igtfBs) > 0 && <div className="cifra text-xs text-slate-500">incluye IGTF {bs(c.igtfBs)}</div>}
          </div>
          <div className="text-right">
            {c && Number(c.vueltoBs) > 0 ? (
              <>
                <div className="text-xs text-emerald-700 uppercase">Vuelto</div>
                <div className="cifra text-xl font-semibold text-emerald-700">
                  {simboloMoneda(vueltoMetodo)} {numero(c.vueltoMonto, 2)}
                </div>
                <div className="cifra text-slate-500">{bs(c.vueltoBs)}</div>
              </>
            ) : (
              <>
                <div className="text-xs text-slate-500 uppercase">Falta</div>
                <div className={`cifra text-xl font-semibold ${faltante > 0 ? 'text-red-700' : 'text-slate-900'}`}>
                  {bs(c?.faltanteBs ?? totalBs)}
                </div>
                <div className="cifra text-slate-500">$ {numero(faltante / Number(tasa), 2)}</div>
              </>
            )}
          </div>
        </div>

        {pagos.length > 0 && (
          <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
            {pagos.map((p, i) => (
              <li key={i} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>
                  {METODOS[p.metodo].nombre}
                  {p.referencia && <span className="text-slate-500"> · ref. {p.referencia}</span>}
                </span>
                <span className="flex items-center gap-2">
                  <span className="cifra font-medium">
                    {simboloMoneda(p.metodo)} {numero(p.monto, 2)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPagos((ps) => ps.filter((_, j) => j !== i))}
                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    aria-label="Quitar pago"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        {faltante > 0 && (
          <form onSubmit={agregarPago} className="grid gap-2 sm:grid-cols-[11rem_1fr_auto] sm:items-end">
            <Selector
              etiqueta="Método"
              value={nuevo.metodo}
              onChange={(e) => setNuevo({ ...nuevo, metodo: e.target.value as MetodoPago, monto: '' })}
            >
              {[...LISTA_METODOS, ...(creditoDisponibleUsd !== null ? (['CREDITO'] as const) : [])].map((m) => (
                <option key={m} value={m}>
                  {METODOS[m].nombre}
                </option>
              ))}
            </Selector>
            <div className="grid gap-2 sm:grid-cols-2">
              <Campo
                etiqueta={`Monto (${simboloMoneda(nuevo.metodo)})`}
                inputMode="decimal"
                placeholder={faltanteEn(nuevo.metodo) && numero(faltanteEn(nuevo.metodo), 2)}
                value={nuevo.monto}
                onChange={(e) => setNuevo({ ...nuevo, monto: e.target.value })}
                autoFocus
              />
              {METODOS[nuevo.metodo].referencia && (
                <Campo
                  etiqueta="Referencia"
                  value={nuevo.referencia}
                  onChange={(e) => setNuevo({ ...nuevo, referencia: e.target.value })}
                />
              )}
            </div>
            <Boton type="submit" variante="secundario">
              Agregar
            </Boton>
          </form>
        )}
        {faltante > 0 && <p className="text-xs text-slate-500">Si deja el monto vacío se toma lo que falta.</p>}

        {c && Number(c.vueltoBs) > 0 && (
          <Selector
            etiqueta="Entregar el vuelto en"
            value={vueltoMetodo}
            onChange={(e) => setVueltoMetodo(e.target.value as MetodoPago)}
          >
            {LISTA_METODOS.filter((m) => METODOS[m].vuelto).map((m) => (
              <option key={m} value={m}>
                {METODOS[m].nombre}
              </option>
            ))}
          </Selector>
        )}

        {cuadre.error && <Aviso tipo="error">{cuadre.error.message}</Aviso>}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <Boton variante="fantasma" onClick={alCerrar}>
            Volver
          </Boton>
          <Boton disabled={!listo || cuadre.isFetching} cargando={vender.isPending} onClick={() => vender.mutate()}>
            Registrar venta
          </Boton>
        </div>
      </div>
    </Modal>
  );
}
