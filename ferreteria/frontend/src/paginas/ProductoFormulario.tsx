import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useAvisos } from '../componentes/avisos';
import {
  AreaTexto,
  Aviso,
  Boton,
  Campo,
  Cargando,
  Casilla,
  Encabezado,
  Insignia,
  Selector,
  Tabla,
  Tarjeta,
  td,
  th,
} from '../componentes/ui';
import { api } from '../lib/api';
import { useCategorias, useConfiguracion, useEstadoTasas, useListas, useMarcas, useUnidades } from '../lib/consultas';
import { aDecimalApi, bs, fecha, numero, porcentaje, sinCeros, usd } from '../lib/formato';
import { useSesion } from '../lib/sesion';
import { AlicuotaIva, HistorialCosto, ModoPrecio, Pagina, ProductoDetalle, Proveedor } from '../lib/tipos';

interface PrecioForm {
  listaId: number;
  modo: ModoPrecio;
  margen: string;
  precioUsd: string;
}
interface PresentacionForm {
  unidadId: string;
  factor: string;
  codigosBarras: string;
}
interface ProveedorForm {
  proveedorId: string;
  codigoProveedor: string;
  costoUsd: string;
}

const separarCodigos = (texto: string) =>
  texto
    .split(/[\s,;|]+/)
    .map((c) => c.trim())
    .filter(Boolean);

export function ProductoFormulario() {
  const { id } = useParams();
  const esNuevo = !id;
  const navegar = useNavigate();
  const avisos = useAvisos();
  const consultas = useQueryClient();
  const { puede } = useSesion();
  const puedeEditar = puede('GERENTE', 'ALMACEN');
  const puedePrecios = puede('GERENTE');
  const verCostos = puede('GERENTE', 'ALMACEN');

  const unidades = useUnidades();
  const categorias = useCategorias();
  const marcas = useMarcas();
  const listas = useListas();
  const config = useConfiguracion();
  const tasas = useEstadoTasas();
  const proveedores = useQuery({
    queryKey: ['proveedores', 'todos'],
    queryFn: () => api.get<Pagina<Proveedor>>('/proveedores', { porPagina: 200 }),
    enabled: verCostos,
  });
  const detalle = useQuery({
    queryKey: ['productos', 'detalle', id],
    queryFn: () => api.get<ProductoDetalle>(`/productos/${id}`),
    enabled: !esNuevo,
  });
  const historial = useQuery({
    queryKey: ['productos', 'historial', id],
    queryFn: () => api.get<HistorialCosto[]>(`/productos/${id}/historial-costos`),
    enabled: !esNuevo && verCostos,
  });

  const [codigo, setCodigo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [marcaId, setMarcaId] = useState('');
  const [unidadBaseId, setUnidadBaseId] = useState('');
  const [costoUsd, setCostoUsd] = useState('0');
  const [motivoCosto, setMotivoCosto] = useState('');
  const [alicuotaIva, setAlicuotaIva] = useState<AlicuotaIva>('GENERAL');
  const [stockMinimo, setStockMinimo] = useState('0');
  const [stockMaximo, setStockMaximo] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [notas, setNotas] = useState('');
  const [activo, setActivo] = useState(true);
  const [codigosBarras, setCodigosBarras] = useState('');
  const [presentaciones, setPresentaciones] = useState<PresentacionForm[]>([]);
  const [precios, setPrecios] = useState<PrecioForm[]>([]);
  const [provs, setProvs] = useState<ProveedorForm[]>([]);
  const [costoOriginal, setCostoOriginal] = useState<string | null>(null);

  // Carga inicial del formulario (producto existente o valores por defecto).
  useEffect(() => {
    if (esNuevo) {
      if (unidades.data && !unidadBaseId)
        setUnidadBaseId(String(unidades.data.find((u) => u.codigo === 'UND')?.id ?? unidades.data[0]?.id ?? ''));
      if (listas.data && precios.length === 0) {
        setPrecios(
          listas.data
            .filter((l) => l.activa)
            .map((l) => ({ listaId: l.id, modo: 'MARGEN', margen: sinCeros(l.margenPorDefecto), precioUsd: '' })),
        );
      }
      return;
    }
    const p = detalle.data;
    if (!p) return;
    setCodigo(p.codigo);
    setDescripcion(p.descripcion);
    setCategoriaId(p.categoria ? String(p.categoria.id) : '');
    setMarcaId(p.marca ? String(p.marca.id) : '');
    setUnidadBaseId(String(p.unidadBase.id));
    setCostoUsd(sinCeros(p.costoUsd ?? '0'));
    setCostoOriginal(p.costoUsd ?? null);
    setAlicuotaIva(p.alicuotaIva);
    setStockMinimo(sinCeros(p.stockMinimo));
    setStockMaximo(sinCeros(p.stockMaximo));
    setUbicacion(p.ubicacion ?? '');
    setNotas(p.notas ?? '');
    setActivo(p.activo);
    setCodigosBarras(p.codigosBarras.join(' '));
    setPresentaciones(
      p.presentaciones.map((x) => ({
        unidadId: String(x.unidad.id),
        factor: sinCeros(x.factor),
        codigosBarras: x.codigosBarras.join(' '),
      })),
    );
    setPrecios(
      p.precios.map((x) => ({
        listaId: x.lista.id,
        modo: x.modo ?? 'MARGEN',
        margen: sinCeros(x.margen),
        precioUsd: sinCeros(x.precioUsd),
      })),
    );
    setProvs(
      p.proveedores.map((x) => ({
        proveedorId: String(x.proveedor.id),
        codigoProveedor: x.codigoProveedor ?? '',
        costoUsd: sinCeros(x.costoUsd),
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detalle.data, unidades.data, listas.data, esNuevo]);

  const tasa = tasas.data?.USD.vigente?.valor ?? null;
  const ivaPct = Number(config.data?.alicuotasIva[alicuotaIva] ?? 0);

  /** Vista previa local; el servidor recalcula y es la fuente oficial. */
  const vistaPrecios = useMemo(
    () =>
      precios.map((p) => {
        const costo = Number(aDecimalApi(costoUsd)) || 0;
        const precio =
          p.modo === 'MARGEN' ? costo * (1 + (Number(aDecimalApi(p.margen)) || 0) / 100) : Number(aDecimalApi(p.precioUsd)) || 0;
        const margen = p.modo === 'FIJO' && costo > 0 ? (precio / costo - 1) * 100 : Number(aDecimalApi(p.margen));
        const conIva = precio * (1 + ivaPct / 100);
        return { precio, margen, conIva, bsConIva: tasa ? conIva * Number(tasa) : null };
      }),
    [precios, costoUsd, ivaPct, tasa],
  );

  const guardar = useMutation({
    mutationFn: () => {
      const cuerpo: Record<string, unknown> = {
        codigo: codigo.trim(),
        descripcion: descripcion.trim(),
        categoriaId: categoriaId ? Number(categoriaId) : null,
        marcaId: marcaId ? Number(marcaId) : null,
        unidadBaseId: Number(unidadBaseId),
        alicuotaIva,
        stockMinimo: aDecimalApi(stockMinimo || '0'),
        stockMaximo: stockMaximo ? aDecimalApi(stockMaximo) : null,
        ubicacion: ubicacion || null,
        notas: notas || null,
        activo,
        codigosBarras: separarCodigos(codigosBarras),
        presentaciones: presentaciones
          .filter((p) => p.unidadId)
          .map((p) => ({
            unidadId: Number(p.unidadId),
            factor: aDecimalApi(p.factor),
            codigosBarras: separarCodigos(p.codigosBarras),
          })),
      };
      if (verCostos) {
        cuerpo.proveedores = provs
          .filter((p) => p.proveedorId)
          .map((p) => ({
            proveedorId: Number(p.proveedorId),
            codigoProveedor: p.codigoProveedor || null,
            costoUsd: p.costoUsd ? aDecimalApi(p.costoUsd) : null,
          }));
      }
      if (puedePrecios) {
        cuerpo.costoUsd = aDecimalApi(costoUsd || '0');
        cuerpo.precios = precios.map((p) =>
          p.modo === 'MARGEN'
            ? { listaId: p.listaId, modo: p.modo, margen: aDecimalApi(p.margen || '0') }
            : { listaId: p.listaId, modo: p.modo, precioUsd: aDecimalApi(p.precioUsd || '0') },
        );
        if (!esNuevo && motivoCosto) cuerpo.motivoCambioCosto = motivoCosto;
      }
      return esNuevo ? api.post<ProductoDetalle>('/productos', cuerpo) : api.put<ProductoDetalle>(`/productos/${id}`, cuerpo);
    },
    onSuccess: (p) => {
      avisos.exito(esNuevo ? 'Producto creado' : 'Cambios guardados');
      setMotivoCosto('');
      void consultas.invalidateQueries({ queryKey: ['productos'] });
      if (esNuevo) navegar(`/productos/${p.id}`, { replace: true });
    },
    onError: avisos.error,
  });

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    guardar.mutate();
  };

  if (!esNuevo && detalle.isLoading) return <Cargando />;
  if (!esNuevo && detalle.error) return <Aviso tipo="error">{detalle.error.message}</Aviso>;

  const soloLectura = !puedeEditar;
  const nombreLista = (listaId: number) => listas.data?.find((l) => l.id === listaId)?.nombre ?? `Lista ${listaId}`;
  const unidadBase = unidades.data?.find((u) => String(u.id) === unidadBaseId);
  const cambioCosto = !esNuevo && costoOriginal !== null && Number(aDecimalApi(costoUsd)) !== Number(costoOriginal);

  return (
    <form onSubmit={enviar}>
      <Encabezado
        titulo={esNuevo ? 'Nuevo producto' : `${codigo} · ${descripcion}`}
        descripcion={detalle.data ? `Última modificación: ${fecha(detalle.data.actualizadoEn)}` : undefined}
        acciones={
          <>
            <Link to="/productos">
              <Boton variante="secundario" icono={<ArrowLeft className="size-4" />}>
                Volver
              </Boton>
            </Link>
            {!soloLectura && (
              <Boton type="submit" cargando={guardar.isPending}>
                {esNuevo ? 'Crear producto' : 'Guardar cambios'}
              </Boton>
            )}
          </>
        }
      />
      <fieldset disabled={soloLectura} className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Tarjeta titulo="Datos generales">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo
                etiqueta="Código interno"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                required
                maxLength={40}
                pattern="[0-9A-Za-z./\-_#]+"
                title="Sin espacios"
              />
              <Selector
                etiqueta="Unidad base"
                value={unidadBaseId}
                onChange={(e) => setUnidadBaseId(e.target.value)}
                required
                ayuda="Unidad en que se lleva el inventario y el costo."
              >
                {unidades.data?.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.codigo} — {u.nombre}
                  </option>
                ))}
              </Selector>
              <Campo
                contenedor="sm:col-span-2"
                etiqueta="Descripción"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                required
                minLength={2}
                maxLength={200}
              />
              <Selector etiqueta="Categoría" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
                <option value="">— Sin categoría —</option>
                {categorias.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.ruta}
                  </option>
                ))}
              </Selector>
              <Selector etiqueta="Marca" value={marcaId} onChange={(e) => setMarcaId(e.target.value)}>
                <option value="">— Sin marca —</option>
                {marcas.data?.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </Selector>
              <Selector
                etiqueta="Alícuota de IVA"
                value={alicuotaIva}
                onChange={(e) => setAlicuotaIva(e.target.value as AlicuotaIva)}
              >
                <option value="GENERAL">General ({config.data?.alicuotasIva.GENERAL ?? 16} %)</option>
                <option value="REDUCIDA">Reducida ({config.data?.alicuotasIva.REDUCIDA ?? 8} %)</option>
                <option value="EXENTO">Exento</option>
              </Selector>
              <Campo
                etiqueta="Ubicación"
                placeholder="Pasillo 3 · Estante 2"
                value={ubicacion}
                onChange={(e) => setUbicacion(e.target.value)}
                maxLength={60}
              />
              <Campo
                etiqueta="Stock mínimo"
                inputMode="decimal"
                value={stockMinimo}
                onChange={(e) => setStockMinimo(e.target.value)}
              />
              <Campo
                etiqueta="Stock máximo"
                inputMode="decimal"
                value={stockMaximo}
                onChange={(e) => setStockMaximo(e.target.value)}
              />
              <AreaTexto
                contenedor="sm:col-span-2"
                etiqueta="Notas"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                maxLength={2000}
              />
              <Casilla
                etiqueta="Producto activo (disponible para la venta)"
                checked={activo}
                onChange={(e) => setActivo(e.target.checked)}
              />
            </div>
          </Tarjeta>

          <Tarjeta titulo="Costo y precios de venta">
            {!puedePrecios && <p className="mb-3 text-sm text-slate-500">Solo gerencia puede modificar costos y precios.</p>}
            <fieldset disabled={!puedePrecios} className="space-y-4">
              {verCostos && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo
                    etiqueta={`Costo en USD por ${unidadBase?.codigo ?? 'unidad'} (sin IVA)`}
                    inputMode="decimal"
                    value={costoUsd}
                    onChange={(e) => setCostoUsd(e.target.value)}
                    ayuda={
                      detalle.data?.costoActualizadoEn
                        ? `Última actualización: ${fecha(detalle.data.costoActualizadoEn)}`
                        : undefined
                    }
                  />
                  {cambioCosto && (
                    <Campo
                      etiqueta="Motivo del cambio de costo"
                      placeholder="Factura del proveedor, ajuste…"
                      value={motivoCosto}
                      onChange={(e) => setMotivoCosto(e.target.value)}
                      maxLength={200}
                    />
                  )}
                </div>
              )}
              <Tabla>
                <thead>
                  <tr>
                    <th className={th}>Lista</th>
                    {verCostos && <th className={th}>Modo</th>}
                    {verCostos && <th className={th}>Margen %</th>}
                    <th className={`${th} text-right`}>Precio $ sin IVA</th>
                    <th className={`${th} text-right`}>$ con IVA</th>
                    <th className={`${th} text-right`}>Bs con IVA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {precios.map((p, i) => {
                    const v = vistaPrecios[i];
                    const actualizar = (cambios: Partial<PrecioForm>) =>
                      setPrecios((lista) => lista.map((x, j) => (j === i ? { ...x, ...cambios } : x)));
                    return (
                      <tr key={p.listaId}>
                        <td className={`${td} font-medium`}>{nombreLista(p.listaId)}</td>
                        {verCostos && (
                          <td className={`${td} min-w-28`}>
                            <Selector
                              value={p.modo}
                              aria-label="Modo de precio"
                              onChange={(e) =>
                                actualizar({
                                  modo: e.target.value as ModoPrecio,
                                  precioUsd: v.precio.toFixed(4),
                                  margen: Number.isFinite(v.margen) ? v.margen.toFixed(2) : p.margen,
                                })
                              }
                            >
                              <option value="MARGEN">Margen</option>
                              <option value="FIJO">Fijo</option>
                            </Selector>
                          </td>
                        )}
                        {verCostos && (
                          <td className={`${td} w-28`}>
                            {p.modo === 'MARGEN' ? (
                              <Campo
                                aria-label="Margen"
                                inputMode="decimal"
                                value={p.margen}
                                onChange={(e) => actualizar({ margen: e.target.value })}
                              />
                            ) : (
                              <span className="cifra text-slate-500">
                                {Number.isFinite(v.margen) ? porcentaje(String(v.margen)) : '—'}
                              </span>
                            )}
                          </td>
                        )}
                        <td className={`${td} w-36 text-right`}>
                          {p.modo === 'FIJO' && puedePrecios ? (
                            <Campo
                              aria-label="Precio"
                              inputMode="decimal"
                              className="text-right"
                              value={p.precioUsd}
                              onChange={(e) => actualizar({ precioUsd: e.target.value })}
                            />
                          ) : (
                            <span className="cifra">{usd(v.precio.toFixed(4))}</span>
                          )}
                        </td>
                        <td className={`${td} cifra text-right`}>{usd(v.conIva.toFixed(2))}</td>
                        <td className={`${td} cifra text-right font-semibold`}>
                          {v.bsConIva === null ? '—' : bs(v.bsConIva.toFixed(2))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Tabla>
              <p className="text-xs text-slate-500">
                «Margen»: el precio se recalcula solo cuando cambia el costo. «Fijo»: se mantiene aunque cambie el costo.
                {!tasa && ' No hay tasa BCV cargada: los precios en Bs no se pueden calcular.'}
              </p>
            </fieldset>
          </Tarjeta>

          <Tarjeta
            titulo="Presentaciones"
            acciones={
              !soloLectura && (
                <Boton
                  variante="secundario"
                  icono={<Plus className="size-4" />}
                  onClick={() => setPresentaciones((l) => [...l, { unidadId: '', factor: '', codigosBarras: '' }])}
                >
                  Agregar
                </Boton>
              )
            }
          >
            <p className="mb-3 text-sm text-slate-500">
              Otras formas de vender o comprar el producto. Ej.: caja de 100 {unidadBase?.codigo ?? 'UND'}, rollo de 100 m.
            </p>
            {presentaciones.length === 0 && <p className="text-sm text-slate-400">Sin presentaciones adicionales.</p>}
            <div className="space-y-3">
              {presentaciones.map((p, i) => {
                const actualizar = (c: Partial<PresentacionForm>) =>
                  setPresentaciones((l) => l.map((x, j) => (j === i ? { ...x, ...c } : x)));
                const precioServidor = detalle.data?.presentaciones.find((x) => String(x.unidad.id) === p.unidadId)?.precios[0];
                return (
                  <div
                    key={i}
                    className="grid items-end gap-3 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200 sm:grid-cols-[10rem_8rem_1fr_auto]"
                  >
                    <Selector
                      etiqueta="Unidad"
                      value={p.unidadId}
                      onChange={(e) => actualizar({ unidadId: e.target.value })}
                      required
                    >
                      <option value="">—</option>
                      {unidades.data
                        ?.filter((u) => String(u.id) !== unidadBaseId)
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.codigo} — {u.nombre}
                          </option>
                        ))}
                    </Selector>
                    <Campo
                      etiqueta={`Contiene (${unidadBase?.codigo ?? ''})`}
                      inputMode="decimal"
                      value={p.factor}
                      onChange={(e) => actualizar({ factor: e.target.value })}
                      required
                    />
                    <Campo
                      etiqueta="Códigos de barras"
                      placeholder="Separados por espacio"
                      value={p.codigosBarras}
                      onChange={(e) => actualizar({ codigosBarras: e.target.value })}
                      ayuda={
                        precioServidor
                          ? `${nombreLista(precioServidor.listaId)}: ${usd(precioServidor.precioUsdConIva)} · ${bs(precioServidor.precioBsConIva)}`
                          : undefined
                      }
                    />
                    {!soloLectura && (
                      <Boton
                        variante="fantasma"
                        aria-label="Quitar presentación"
                        onClick={() => setPresentaciones((l) => l.filter((_, j) => j !== i))}
                        icono={<Trash2 className="size-4 text-red-600" />}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-4">
              <Campo
                etiqueta={`Códigos de barras de la unidad base (${unidadBase?.codigo ?? ''})`}
                placeholder="Escanee o escriba; separe varios con espacio"
                value={codigosBarras}
                onChange={(e) => setCodigosBarras(e.target.value)}
                onKeyDown={(e) => {
                  // El lector envía Enter al final: se agrega un espacio en lugar de enviar el formulario.
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    setCodigosBarras((c) => (c.trim() ? `${c.trim()} ` : c));
                  }
                }}
              />
            </div>
          </Tarjeta>
        </div>

        <div className="space-y-5">
          {verCostos && (
            <Tarjeta
              titulo="Proveedores"
              acciones={
                !soloLectura && (
                  <Boton
                    variante="secundario"
                    icono={<Plus className="size-4" />}
                    onClick={() => setProvs((l) => [...l, { proveedorId: '', codigoProveedor: '', costoUsd: '' }])}
                  >
                    Agregar
                  </Boton>
                )
              }
            >
              {provs.length === 0 && <p className="text-sm text-slate-400">Sin proveedores asociados.</p>}
              <div className="space-y-3">
                {provs.map((p, i) => {
                  const actualizar = (c: Partial<ProveedorForm>) =>
                    setProvs((l) => l.map((x, j) => (j === i ? { ...x, ...c } : x)));
                  return (
                    <div key={i} className="space-y-2 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
                      <div className="flex gap-2">
                        <Selector
                          contenedor="flex-1"
                          aria-label="Proveedor"
                          value={p.proveedorId}
                          onChange={(e) => actualizar({ proveedorId: e.target.value })}
                          required
                        >
                          <option value="">— Proveedor —</option>
                          {proveedores.data?.datos.map((pr) => (
                            <option key={pr.id} value={pr.id}>
                              {pr.razonSocial}
                            </option>
                          ))}
                        </Selector>
                        {!soloLectura && (
                          <Boton
                            variante="fantasma"
                            aria-label="Quitar proveedor"
                            onClick={() => setProvs((l) => l.filter((_, j) => j !== i))}
                            icono={<Trash2 className="size-4 text-red-600" />}
                          />
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Campo
                          aria-label="Código del proveedor"
                          placeholder="Su código"
                          value={p.codigoProveedor}
                          onChange={(e) => actualizar({ codigoProveedor: e.target.value })}
                        />
                        <Campo
                          aria-label="Costo del proveedor"
                          placeholder="Costo $"
                          inputMode="decimal"
                          value={p.costoUsd}
                          onChange={(e) => actualizar({ costoUsd: e.target.value })}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Tarjeta>
          )}
          {!esNuevo && verCostos && (
            <Tarjeta titulo="Historial de costos">
              {historial.data?.length ? (
                <ul className="space-y-2 text-sm">
                  {historial.data.map((h) => (
                    <li key={h.id} className="border-b border-slate-100 pb-2 last:border-0">
                      <div className="cifra">
                        {usd(h.costoAnterior)} → <strong>{usd(h.costoNuevo)}</strong>{' '}
                        <VariacionCosto anterior={h.costoAnterior} nuevo={h.costoNuevo} />
                      </div>
                      <div className="text-xs text-slate-500">
                        {fecha(h.creadoEn)} · {h.motivo}
                        {h.usuario && ` · ${h.usuario.nombre}`}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-400">Sin cambios de costo registrados.</p>
              )}
            </Tarjeta>
          )}
        </div>
      </fieldset>
    </form>
  );
}

function VariacionCosto({ anterior, nuevo }: { anterior: string; nuevo: string }): ReactNode {
  const a = Number(anterior);
  if (!a) return null;
  const v = (Number(nuevo) / a - 1) * 100;
  return <Insignia color={v > 0 ? 'rojo' : 'verde'}>{`${v > 0 ? '+' : ''}${numero(v, 1)} %`}</Insignia>;
}
