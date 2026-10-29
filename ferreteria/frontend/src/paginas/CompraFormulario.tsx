import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ListChecks, ScanBarcode, Trash2 } from 'lucide-react';
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useAvisos } from '../componentes/avisos';
import { Aviso, Boton, Campo, Casilla, Encabezado, Selector, Tabla, Tarjeta, td, th } from '../componentes/ui';
import { api, ErrorApi } from '../lib/api';
import { Compra, LineaSugerida, MonedaCompra, OrdenCompra, simbolo } from '../lib/compras';
import { useConfiguracion, useEstadoTasas } from '../lib/consultas';
import { aDecimalApi, numero, sinCeros } from '../lib/formato';
import { useSesion } from '../lib/sesion';
import { AlicuotaIva, Pagina, ProductoDetalle, Proveedor, ResultadoBusqueda } from '../lib/tipos';

interface Linea {
  clave: string;
  productoId: number;
  codigo: string;
  descripcion: string;
  alicuotaIva: AlicuotaIva;
  /** Costo actual en USD por unidad base (si el usuario puede verlo). */
  costoUsd?: string;
  opciones: { presentacionId: number | null; unidad: string; factor: string }[];
  presentacionId: number | null;
  cantidad: string;
  costoUnitario: string;
}

const hoy = () => new Date().toLocaleDateString('en-CA');
const esNumero = (t: string) => t.trim() !== '' && Number.isFinite(Number(aDecimalApi(t))) && Number(aDecimalApi(t)) >= 0;

/**
 * Registro de una compra (mercancía recibida) o de una orden de compra
 * (pedido al proveedor, no mueve inventario). Con ?orden=N recibe esa orden:
 * propone lo que falta por llegar.
 */
export function CompraFormulario({ modo = 'compra' }: { modo?: 'compra' | 'orden' }) {
  const esOrden = modo === 'orden';
  const { puede } = useSesion();
  const avisos = useAvisos();
  const navegar = useNavigate();
  const [parametros] = useSearchParams();
  const ordenId = esOrden ? null : Number(parametros.get('orden')) || null;
  const consultas = useQueryClient();
  const config = useConfiguracion();
  const tasas = useEstadoTasas();
  const proveedores = useQuery({
    queryKey: ['proveedores', 'todos'],
    queryFn: () => api.get<Pagina<Proveedor>>('/proveedores', { porPagina: 200 }),
  });

  const [cabecera, setCabecera] = useState({
    proveedorId: '',
    fecha: hoy(),
    numero: '',
    numeroControl: '',
    moneda: 'USD' as MonedaCompra,
    tasa: '',
    condicion: 'CONTADO',
    vencimiento: '',
    facturaFiscal: true,
    actualizarCostos: puede('GERENTE'),
    notas: '',
  });
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [texto, setTexto] = useState('');
  const [q, setQ] = useState('');
  const [sugiriendo, setSugiriendo] = useState(false);
  const buscador = useRef<HTMLInputElement>(null);

  const orden = useQuery({
    queryKey: ['compras', 'ordenes', 'detalle', ordenId],
    queryFn: () => api.get<OrdenCompra>(`/compras/ordenes/${ordenId}`),
    enabled: ordenId !== null,
  });
  // Al recibir una orden se proponen su proveedor, su moneda y lo que falta por llegar.
  const ordenCargada = useRef(false);
  useEffect(() => {
    const o = orden.data;
    if (!o || ordenCargada.current) return;
    ordenCargada.current = true;
    setCabecera((c) => ({ ...c, proveedorId: String(o.proveedorId), moneda: o.moneda }));
    const pendientes = (o.lineas ?? []).filter((l) => Number(l.cantidad) > Number(l.cantidadRecibida));
    void Promise.all(pendientes.map((l) => api.get<ProductoDetalle>(`/productos/${l.productoId}`))).then(
      (productos) =>
        setLineas(
          pendientes.map((l, i) =>
            nuevaLinea(
              productos[i],
              l.presentacionId,
              sinCeros(String(Number(l.cantidad) - Number(l.cantidadRecibida))),
              sinCeros(l.costoUnitario),
            ),
          ),
        ),
      avisos.error,
    );
  }, [orden.data, avisos.error]);

  // La tasa se propone con la BCV vigente; el usuario puede corregirla.
  useEffect(() => {
    const vigente = tasas.data?.USD?.vigente?.valor;
    if (vigente && !cabecera.tasa) setCabecera((c) => ({ ...c, tasa: sinCeros(vigente) }));
  }, [tasas.data, cabecera.tasa]);
  useEffect(() => {
    const t = setTimeout(() => setQ(texto.trim()), 250);
    return () => clearTimeout(t);
  }, [texto]);

  const sugerencias = useQuery({
    queryKey: ['productos', 'compra', q],
    queryFn: () => api.get<ResultadoBusqueda>('/productos', { q, porPagina: 8, estado: 'todos' }),
    enabled: q.length >= 2,
  });

  /** Costo sugerido: el actual, en la moneda y unidad de la línea. */
  const costoSugerido = (costoUsd: string | undefined, factor: string) => {
    if (!costoUsd) return '';
    const enUsd = Number(costoUsd) * Number(factor);
    const valor = cabecera.moneda === 'USD' ? enUsd : enUsd * Number(aDecimalApi(cabecera.tasa || '0'));
    return valor ? String(Math.round(valor * 10000) / 10000) : '';
  };

  function nuevaLinea(p: ProductoDetalle, presentacionId: number | null, cantidad = '', costo?: string): Linea {
    const opciones = [
      { presentacionId: null, unidad: p.unidadBase.codigo, factor: '1' },
      ...p.presentaciones.map((pr) => ({ presentacionId: pr.id, unidad: pr.unidad.codigo, factor: pr.factor })),
    ];
    const factor = opciones.find((o) => o.presentacionId === presentacionId)?.factor ?? '1';
    return {
      clave: `${p.id}-${presentacionId ?? 'base'}`,
      productoId: p.id,
      codigo: p.codigo,
      descripcion: p.descripcion,
      alicuotaIva: p.alicuotaIva,
      costoUsd: p.costoUsd,
      opciones,
      presentacionId,
      cantidad,
      costoUnitario: costo ?? costoSugerido(p.costoUsd, factor),
    };
  }

  const agregar = (p: ProductoDetalle, presentacionId: number | null) => {
    const linea = nuevaLinea(p, presentacionId);
    if (lineas.some((l) => l.clave === linea.clave)) {
      avisos.error(new Error(`${p.codigo} ya está en ${esOrden ? 'la orden' : 'la compra'}`));
    } else {
      setLineas((ls) => [...ls, linea]);
    }
    setTexto('');
    setQ('');
    buscador.current?.focus();
  };

  const alPresionarTecla = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const codigo = texto.trim();
    if (!codigo) return;
    try {
      const r = await api.get<{ presentacionId: number | null; producto: ProductoDetalle }>(
        `/productos/por-codigo/${encodeURIComponent(codigo)}`,
      );
      agregar(r.producto, r.presentacionId);
    } catch (error) {
      const unico = sugerencias.data?.datos.length === 1 ? sugerencias.data.datos[0] : null;
      if (unico) agregar(await api.get<ProductoDetalle>(`/productos/${unico.id}`), null);
      else if (!(error instanceof ErrorApi && error.estado === 404)) avisos.error(error);
    }
  };

  /** Agrega los productos del proveedor que están bajo el mínimo. */
  const sugerir = async () => {
    setSugiriendo(true);
    try {
      const sugeridas = await api.get<LineaSugerida[]>('/compras/ordenes/sugerencia', {
        proveedorId: cabecera.proveedorId,
        moneda: cabecera.moneda,
      });
      const nuevas = sugeridas.filter((s) => !lineas.some((l) => l.clave === `${s.productoId}-base`));
      if (nuevas.length === 0) {
        avisos.exito(
          sugeridas.length === 0
            ? 'Ningún producto de este proveedor está bajo el mínimo'
            : 'Los productos bajo el mínimo ya están en la orden',
        );
        return;
      }
      const productos = await Promise.all(nuevas.map((s) => api.get<ProductoDetalle>(`/productos/${s.productoId}`)));
      setLineas((ls) => [...ls, ...nuevas.map((s, i) => nuevaLinea(productos[i], null, s.cantidad, s.costoUnitario))]);
      avisos.exito(`${nuevas.length} producto(s) bajo el mínimo agregados`);
    } catch (e) {
      avisos.error(e);
    } finally {
      setSugiriendo(false);
    }
  };

  const cambiar = (clave: string, cambios: Partial<Linea>) =>
    setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambios } : l)));

  // Totales con las mismas reglas de la API: 2 decimales por renglón e IVA sobre la base.
  const alicuotas = config.data?.alicuotasIva;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const bases = { EXENTO: 0, GENERAL: 0, REDUCIDA: 0 };
  for (const l of lineas) {
    if (esNumero(l.cantidad) && esNumero(l.costoUnitario)) {
      bases[l.alicuotaIva] += r2(Number(aDecimalApi(l.cantidad)) * Number(aDecimalApi(l.costoUnitario)));
    }
  }
  const iva = alicuotas
    ? r2((bases.GENERAL * Number(alicuotas.GENERAL)) / 100) + r2((bases.REDUCIDA * Number(alicuotas.REDUCIDA)) / 100)
    : 0;
  const subtotal = bases.EXENTO + bases.GENERAL + bases.REDUCIDA;
  const s = simbolo(cabecera.moneda);
  const completas =
    lineas.length > 0 &&
    lineas.every((l) => esNumero(l.cantidad) && Number(aDecimalApi(l.cantidad)) > 0 && esNumero(l.costoUnitario));

  const lineasApi = () =>
    lineas.map((l) => ({
      productoId: l.productoId,
      presentacionId: l.presentacionId,
      cantidad: aDecimalApi(l.cantidad),
      costoUnitario: aDecimalApi(l.costoUnitario),
    }));
  const guardarOrden = useMutation({
    mutationFn: () =>
      api.post<OrdenCompra>('/compras/ordenes', {
        proveedorId: Number(cabecera.proveedorId),
        fecha: cabecera.fecha,
        moneda: cabecera.moneda,
        notas: cabecera.notas || undefined,
        lineas: lineasApi(),
      }),
    onSuccess: (o) => {
      avisos.exito(`Orden de compra N° ${o.id} creada: imprímala o envíela al proveedor`);
      void consultas.invalidateQueries({ queryKey: ['compras'] });
      navegar(`/compras?vista=ordenes&orden=${o.id}`);
    },
    onError: avisos.error,
  });
  const guardar = useMutation({
    mutationFn: () =>
      api.post<Compra>('/compras', {
        ordenId: ordenId ?? undefined,
        proveedorId: Number(cabecera.proveedorId),
        fecha: cabecera.fecha,
        numero: cabecera.numero,
        numeroControl: cabecera.numeroControl || undefined,
        moneda: cabecera.moneda,
        tasa: cabecera.tasa ? aDecimalApi(cabecera.tasa) : undefined,
        condicion: cabecera.condicion,
        vencimiento: cabecera.condicion === 'CREDITO' ? cabecera.vencimiento : undefined,
        facturaFiscal: cabecera.facturaFiscal,
        actualizarCostos: cabecera.actualizarCostos,
        notas: cabecera.notas || undefined,
        lineas: lineasApi(),
      }),
    onSuccess: (c) => {
      avisos.exito(`Compra ${c.numero} registrada: la mercancía ya está en el inventario`);
      void consultas.invalidateQueries({ queryKey: ['compras'] });
      void consultas.invalidateQueries({ queryKey: ['productos'] });
      void consultas.invalidateQueries({ queryKey: ['inventario'] });
      void consultas.invalidateQueries({ queryKey: ['fiscal'] });
      navegar('/compras');
    },
    onError: avisos.error,
  });

  const campo = (k: 'proveedorId' | 'fecha' | 'numero' | 'numeroControl' | 'tasa' | 'condicion' | 'vencimiento' | 'notas') => ({
    value: cabecera[k],
    onChange: (e: { target: { value: string } }) => setCabecera({ ...cabecera, [k]: e.target.value }),
  });

  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        if (esOrden) guardarOrden.mutate();
        else guardar.mutate();
      }}
    >
      <Encabezado
        titulo={esOrden ? 'Nueva orden de compra' : ordenId ? `Recibir orden de compra N° ${ordenId}` : 'Registrar compra'}
        descripcion={
          esOrden
            ? 'Pedido al proveedor. No mueve el inventario: la mercancía entra cuando se recibe.'
            : 'Copie los datos del documento del proveedor. Al guardar, la mercancía entra al inventario.'
        }
        acciones={
          <>
            <Link to="/compras">
              <Boton variante="secundario" icono={<ArrowLeft className="size-4" />}>
                Volver
              </Boton>
            </Link>
            <Boton type="submit" disabled={!completas} cargando={guardar.isPending || guardarOrden.isPending}>
              {esOrden ? 'Crear orden' : 'Guardar compra'}
            </Boton>
          </>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[24rem_1fr]">
        <Tarjeta titulo={esOrden ? 'Orden' : 'Documento'}>
          <div className="space-y-3">
            {ordenId && (
              <Aviso tipo="info">
                Se cargó lo que falta por llegar de la orden N° {ordenId}. Ajuste las cantidades y costos a lo que dice el
                documento del proveedor.
              </Aviso>
            )}
            <Selector etiqueta="Proveedor" required disabled={ordenId !== null} {...campo('proveedorId')}>
              <option value="">— Elija —</option>
              {proveedores.data?.datos
                .filter((p) => p.activo)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.razonSocial}
                  </option>
                ))}
            </Selector>
            {proveedores.data?.total === 0 && (
              <Aviso tipo="advertencia">
                Registre primero el proveedor en{' '}
                <Link to="/proveedores" className="underline">
                  Proveedores
                </Link>
                .
              </Aviso>
            )}
            {esOrden ? (
              <div className="grid grid-cols-2 gap-3">
                <Campo etiqueta="Fecha" type="date" required {...campo('fecha')} />
                <Selector
                  etiqueta="Moneda"
                  value={cabecera.moneda}
                  onChange={(e) => setCabecera({ ...cabecera, moneda: e.target.value as MonedaCompra })}
                >
                  <option value="USD">Dólares</option>
                  <option value="BS">Bolívares</option>
                </Selector>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Campo etiqueta="Fecha" type="date" required {...campo('fecha')} />
                  <Campo etiqueta="N° de documento" required {...campo('numero')} />
                </div>
                <Casilla
                  etiqueta="Es factura fiscal (va al libro de compras)"
                  checked={cabecera.facturaFiscal}
                  onChange={(e) => setCabecera({ ...cabecera, facturaFiscal: e.target.checked })}
                />
                {cabecera.facturaFiscal && <Campo etiqueta="N° de control" required {...campo('numeroControl')} />}
                <div className="grid grid-cols-2 gap-3">
                  <Selector
                    etiqueta="Moneda"
                    value={cabecera.moneda}
                    disabled={ordenId !== null}
                    onChange={(e) => setCabecera({ ...cabecera, moneda: e.target.value as MonedaCompra })}
                  >
                    <option value="USD">Dólares</option>
                    <option value="BS">Bolívares</option>
                  </Selector>
                  <Campo etiqueta="Tasa (Bs por $)" inputMode="decimal" required {...campo('tasa')} />
                </div>
              </>
            )}
            {esOrden && (
              <Boton
                variante="secundario"
                className="w-full"
                icono={<ListChecks className="size-4" />}
                disabled={!cabecera.proveedorId}
                cargando={sugiriendo}
                onClick={() => void sugerir()}
              >
                Sugerir por mínimos
              </Boton>
            )}
            <div className={esOrden ? 'hidden' : 'grid grid-cols-2 gap-3'}>
              <Selector etiqueta="Condición" {...campo('condicion')}>
                <option value="CONTADO">Contado</option>
                <option value="CREDITO">Crédito</option>
              </Selector>
              {cabecera.condicion === 'CREDITO' && <Campo etiqueta="Vence" type="date" required {...campo('vencimiento')} />}
            </div>
            {puede('GERENTE') && !esOrden && (
              <Casilla
                etiqueta="Actualizar el costo de los productos (y sus precios por margen)"
                checked={cabecera.actualizarCostos}
                onChange={(e) => setCabecera({ ...cabecera, actualizarCostos: e.target.checked })}
              />
            )}
            <Campo etiqueta="Notas" {...campo('notas')} />
          </div>
        </Tarjeta>

        <Tarjeta titulo={esOrden ? 'Productos a pedir' : 'Productos recibidos'}>
          <div className="relative">
            <ScanBarcode className="pointer-events-none absolute top-2.5 left-3 size-4 text-slate-400" />
            <input
              ref={buscador}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => void alPresionarTecla(e)}
              placeholder="Escanee o escriba código o nombre del producto…"
              className="block w-full rounded-lg border-0 py-2 pr-3 pl-9 text-sm ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-marca-500"
              aria-label={esOrden ? 'Agregar producto a la orden' : 'Agregar producto a la compra'}
            />
            {q.length >= 2 && (
              <ul className="absolute z-20 mt-1 max-h-72 w-full divide-y divide-slate-100 overflow-y-auto rounded-lg bg-white shadow-lg ring-1 ring-slate-200">
                {sugerencias.data?.datos.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() =>
                        void api.get<ProductoDetalle>(`/productos/${p.id}`).then((d) => agregar(d, null), avisos.error)
                      }
                      className="flex w-full justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-marca-50"
                    >
                      <span className="truncate font-medium text-slate-800">{p.descripcion}</span>
                      <span className="font-mono text-xs text-slate-500">{p.codigo}</span>
                    </button>
                  </li>
                ))}
                {sugerencias.data?.datos.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">Sin resultados.</li>}
              </ul>
            )}
          </div>

          {lineas.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">
              {esOrden
                ? 'Agregue los productos a pedir, o elija el proveedor y use «Sugerir por mínimos».'
                : 'Agregue los productos que llegaron.'}
            </p>
          ) : (
            <div className="mt-3">
              <Tabla>
                <thead>
                  <tr>
                    <th className={th}>Producto</th>
                    <th className={th}>Unidad</th>
                    <th className={`${th} w-24`}>Cantidad</th>
                    <th className={`${th} w-32`}>Costo ({s}, sin IVA)</th>
                    <th className={`${th} text-right`}>Subtotal</th>
                    <th className={th} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lineas.map((l) => {
                    const sub =
                      esNumero(l.cantidad) && esNumero(l.costoUnitario)
                        ? r2(Number(aDecimalApi(l.cantidad)) * Number(aDecimalApi(l.costoUnitario)))
                        : null;
                    return (
                      <tr key={l.clave}>
                        <td className={td}>
                          {l.descripcion}
                          {l.alicuotaIva === 'EXENTO' && <span className="text-slate-500"> (E)</span>}
                          <div className="font-mono text-xs text-slate-400">{l.codigo}</div>
                        </td>
                        <td className={td}>
                          {l.opciones.length > 1 ? (
                            <select
                              value={l.presentacionId ?? ''}
                              aria-label={`Unidad de ${l.codigo}`}
                              onChange={(e) => {
                                const presentacionId = e.target.value ? Number(e.target.value) : null;
                                const factor = l.opciones.find((o) => o.presentacionId === presentacionId)?.factor ?? '1';
                                cambiar(l.clave, { presentacionId, costoUnitario: costoSugerido(l.costoUsd, factor) });
                              }}
                              className="rounded-lg border-0 py-1.5 pr-7 pl-2 text-sm ring-1 ring-slate-300 ring-inset"
                            >
                              {l.opciones.map((o) => (
                                <option key={o.presentacionId ?? 'base'} value={o.presentacionId ?? ''}>
                                  {o.unidad}
                                  {o.presentacionId ? ` ×${sinCeros(o.factor)}` : ''}
                                </option>
                              ))}
                            </select>
                          ) : (
                            l.opciones[0].unidad
                          )}
                        </td>
                        <td className={td}>
                          <input
                            inputMode="decimal"
                            value={l.cantidad}
                            aria-label={`Cantidad ${esOrden ? 'pedida' : 'recibida'} de ${l.codigo}`}
                            onChange={(e) => cambiar(l.clave, { cantidad: e.target.value })}
                            className="cifra block w-full rounded-lg border-0 px-2 py-1.5 text-right text-sm ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-marca-500"
                          />
                        </td>
                        <td className={td}>
                          <input
                            inputMode="decimal"
                            value={l.costoUnitario}
                            aria-label={`Costo unitario de ${l.codigo}`}
                            onChange={(e) => cambiar(l.clave, { costoUnitario: e.target.value })}
                            className="cifra block w-full rounded-lg border-0 px-2 py-1.5 text-right text-sm ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-marca-500"
                          />
                        </td>
                        <td className={`${td} cifra text-right`}>{sub === null ? '—' : `${s} ${numero(sub, 2)}`}</td>
                        <td className={`${td} text-right`}>
                          <button
                            type="button"
                            onClick={() => setLineas((ls) => ls.filter((x) => x.clave !== l.clave))}
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
              <div className="mt-3 ml-auto max-w-xs space-y-1 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span className="cifra">
                    {s} {numero(subtotal, 2)}
                  </span>
                </div>
                {esOrden ? (
                  <p className="text-xs text-slate-500">Estimado sin IVA: el total final lo da la factura del proveedor.</p>
                ) : (
                  <>
                    <div className="flex justify-between text-slate-600">
                      <span>IVA</span>
                      <span className="cifra">
                        {s} {numero(iva, 2)}
                      </span>
                    </div>
                    <div className="flex justify-between font-semibold text-slate-900">
                      <span>Total</span>
                      <span className="cifra">
                        {s} {numero(subtotal + iva, 2)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </Tarjeta>
      </div>
    </form>
  );
}
