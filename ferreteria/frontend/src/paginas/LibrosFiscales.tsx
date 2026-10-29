import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Plus, Printer, Trash2 } from 'lucide-react';
import { FormEvent, ReactNode, useState } from 'react';
import { useAvisos } from '../componentes/avisos';
import {
  AreaTexto,
  Aviso,
  Boton,
  Campo,
  Cargando,
  Encabezado,
  Insignia,
  Modal,
  Selector,
  Tabla,
  Tarjeta,
  td,
  th,
} from '../componentes/ui';
import { api, descargar } from '../lib/api';
import { useConfiguracion } from '../lib/consultas';
import { aDecimalApi, fecha, numero } from '../lib/formato';
import {
  ComprobanteRetencion,
  FilaLibroCompras,
  FilaLibroVentas,
  Libro,
  NOMBRE_DOCUMENTO,
  ResumenIva,
  TipoDocumentoCompra,
} from '../lib/fiscal';
import { Pagina, Proveedor } from '../lib/tipos';

type Pestana = 'ventas' | 'compras' | 'retenciones' | 'resumen';

const mesActual = () => {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
};

/** Montos del libro: negativos en rojo (notas de crédito). */
const Monto = ({ valor }: { valor: string }) => (
  <span className={Number(valor) < 0 ? 'text-red-700' : undefined}>{numero(valor, 2)}</span>
);

export function LibrosFiscales() {
  const avisos = useAvisos();
  const [mes, setMes] = useState(mesActual());
  const [pestana, setPestana] = useState<Pestana>('ventas');

  const excel = (libro: 'libro-ventas' | 'libro-compras') =>
    descargar(`/fiscal/${libro}/excel?mes=${mes}`, `${libro}-${mes}.xlsx`).catch(avisos.error);

  return (
    <>
      <Encabezado
        titulo="Libros fiscales"
        descripcion="Libros de ventas y de compras del mes y resumen del IVA, para entregar al contador."
        acciones={
          <>
            <Campo type="month" aria-label="Mes" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} />
            {(pestana === 'ventas' || pestana === 'compras') && (
              <Boton
                variante="secundario"
                icono={<Download className="size-4" />}
                onClick={() => excel(pestana === 'ventas' ? 'libro-ventas' : 'libro-compras')}
              >
                Descargar Excel
              </Boton>
            )}
          </>
        }
      />
      <div className="mb-4 flex w-fit gap-1 rounded-lg bg-slate-200/70 p-1 print:hidden" role="tablist">
        {(
          [
            ['ventas', 'Libro de ventas'],
            ['compras', 'Libro de compras'],
            ['retenciones', 'Retenciones de IVA'],
            ['resumen', 'Resumen del IVA'],
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
      {pestana === 'ventas' && <LibroVentas mes={mes} />}
      {pestana === 'compras' && <LibroCompras mes={mes} />}
      {pestana === 'retenciones' && <Retenciones mes={mes} />}
      {pestana === 'resumen' && <Resumen mes={mes} />}
    </>
  );
}

function Totales({
  etiqueta,
  totales,
  columnas,
}: {
  etiqueta: string;
  totales: Record<string, string>;
  columnas: (string | null)[];
}) {
  return (
    <tr className="bg-slate-50 font-semibold">
      <td className={td}>{etiqueta}</td>
      {columnas.map((c, i) =>
        c ? (
          <td key={i} className={`${td} cifra text-right`}>
            <Monto valor={totales[c] ?? '0'} />
          </td>
        ) : (
          <td key={i} className={td} />
        ),
      )}
    </tr>
  );
}

function LibroVentas({ mes }: { mes: string }) {
  const libro = useQuery({
    queryKey: ['fiscal', 'ventas', mes],
    queryFn: () => api.get<Libro<FilaLibroVentas>>('/fiscal/libro-ventas', { mes }),
  });
  if (libro.isLoading) return <Cargando />;
  if (libro.error) return <Aviso tipo="error">{libro.error.message}</Aviso>;
  const l = libro.data!;
  return (
    <Tarjeta>
      <Tabla>
        <thead>
          <tr>
            <th className={th}>Fecha</th>
            <th className={th}>Documento</th>
            <th className={th}>Control</th>
            <th className={th}>Cliente</th>
            <th className={`${th} text-right`}>Total con IVA</th>
            <th className={`${th} text-right`}>Exento</th>
            <th className={`${th} text-right`}>Base 16 %</th>
            <th className={`${th} text-right`}>IVA 16 %</th>
            <th className={`${th} text-right`}>Base 8 %</th>
            <th className={`${th} text-right`}>IVA 8 %</th>
            <th className={`${th} text-right`}>IGTF</th>
            <th className={`${th} text-right`}>IVA retenido</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {l.filas.map((f) => (
            <tr key={`${f.documento}-${f.numero}`} className={f.tipoTransaccion === '03-ANU' ? 'text-slate-400' : undefined}>
              <td className={`${td} whitespace-nowrap`}>{fecha(f.fecha)}</td>
              <td className={`${td} whitespace-nowrap`}>
                {NOMBRE_DOCUMENTO[f.documento]} <span className="cifra">{f.numero}</span>
                {f.facturaAfectada && <div className="text-xs text-slate-500">afecta factura {f.facturaAfectada}</div>}
                {f.tipoTransaccion === '03-ANU' && (
                  <div>
                    <Insignia color="rojo">Anulada</Insignia>
                  </div>
                )}
              </td>
              <td className={`${td} cifra whitespace-nowrap`}>{f.numeroControl}</td>
              <td className={td}>
                <div>{f.nombre}</div>
                {f.rif && <div className="text-xs text-slate-500">{f.rif}</div>}
              </td>
              {(
                ['totalBs', 'exentoBs', 'baseGeneralBs', 'ivaGeneralBs', 'baseReducidaBs', 'ivaReducidaBs', 'igtfBs'] as const
              ).map((k) => (
                <td key={k} className={`${td} cifra text-right`}>
                  <Monto valor={f[k]} />
                </td>
              ))}
              <td className={`${td} cifra text-right`}>
                <Monto valor={f.ivaRetenidoBs} />
                {f.comprobanteRetencion && <div className="text-xs text-slate-500">comp. {f.comprobanteRetencion}</div>}
              </td>
            </tr>
          ))}
          {l.filas.length === 0 ? (
            <tr>
              <td colSpan={12} className={`${td} py-8 text-center text-slate-500`}>
                No hay ventas en este mes.
              </td>
            </tr>
          ) : (
            <Totales
              etiqueta="Totales"
              totales={l.totales}
              columnas={[
                null,
                null,
                null,
                'totalBs',
                'exentoBs',
                'baseGeneralBs',
                'ivaGeneralBs',
                'baseReducidaBs',
                'ivaReducidaBs',
                'igtfBs',
                'ivaRetenidoBs',
              ]}
            />
          )}
        </tbody>
      </Tabla>
    </Tarjeta>
  );
}

const VACIO = {
  proveedorId: '',
  tipo: 'FACTURA' as TipoDocumentoCompra,
  fecha: '',
  numero: '',
  numeroControl: '',
  facturaAfectada: '',
  baseExentaBs: '',
  baseGeneralBs: '',
  ivaGeneralBs: '',
  baseReducidaBs: '',
  ivaReducidaBs: '',
  porcentajeRetencion: '75',
  notas: '',
};

function LibroCompras({ mes }: { mes: string }) {
  const avisos = useAvisos();
  const consultas = useQueryClient();
  const config = useConfiguracion();
  const [registrando, setRegistrando] = useState(false);
  const [comprobante, setComprobante] = useState<number | null>(null);
  const [form, setForm] = useState(VACIO);
  const libro = useQuery({
    queryKey: ['fiscal', 'compras', mes],
    queryFn: () => api.get<Libro<FilaLibroCompras>>('/fiscal/libro-compras', { mes }),
  });
  const proveedores = useQuery({
    queryKey: ['proveedores', 'todos'],
    queryFn: () => api.get<Pagina<Proveedor>>('/proveedores', { porPagina: 200 }),
    enabled: registrando,
  });
  const refrescar = () => void consultas.invalidateQueries({ queryKey: ['fiscal'] });

  const dec = (v: string) => (v.trim() ? aDecimalApi(v) : undefined);
  const crear = useMutation({
    mutationFn: () =>
      api.post('/fiscal/compras', {
        proveedorId: Number(form.proveedorId),
        tipo: form.tipo,
        fecha: form.fecha,
        numero: form.numero,
        numeroControl: form.numeroControl,
        facturaAfectada: form.facturaAfectada || undefined,
        baseExentaBs: dec(form.baseExentaBs),
        baseGeneralBs: dec(form.baseGeneralBs),
        ivaGeneralBs: dec(form.ivaGeneralBs),
        baseReducidaBs: dec(form.baseReducidaBs),
        ivaReducidaBs: dec(form.ivaReducidaBs),
        porcentajeRetencion: agente ? Number(form.porcentajeRetencion) : undefined,
        notas: form.notas || undefined,
      }),
    onSuccess: () => {
      avisos.exito('Documento registrado en el libro de compras');
      setRegistrando(false);
      setForm(VACIO);
      refrescar();
    },
    onError: avisos.error,
  });
  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/fiscal/compras/${id}`),
    onSuccess: refrescar,
    onError: avisos.error,
  });

  /** Al escribir la base, propone el IVA con la alícuota configurada. */
  const base = (campo: 'baseGeneralBs' | 'baseReducidaBs', iva: 'ivaGeneralBs' | 'ivaReducidaBs', pct: string | undefined) => ({
    value: form[campo],
    onChange: (e: { target: { value: string } }) => {
      const valor = e.target.value;
      const n = Number(aDecimalApi(valor));
      setForm({ ...form, [campo]: valor, [iva]: valor && Number.isFinite(n) && pct ? ((n * Number(pct)) / 100).toFixed(2) : '' });
    },
  });
  const campo = (k: keyof typeof VACIO) => ({
    value: form[k],
    onChange: (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value }),
  });
  const alicuotas = config.data?.alicuotasIva;
  const agente = Boolean(config.data?.empresa.contribuyenteEspecial);

  if (libro.isLoading) return <Cargando />;
  if (libro.error) return <Aviso tipo="error">{libro.error.message}</Aviso>;
  const l = libro.data!;
  return (
    <Tarjeta
      acciones={
        <Boton
          icono={<Plus className="size-4" />}
          onClick={() => {
            setForm({ ...VACIO, fecha: `${mes}-01` });
            setRegistrando(true);
          }}
        >
          Registrar factura de compra
        </Boton>
      }
      titulo="Documentos de proveedores"
    >
      <Tabla>
        <thead>
          <tr>
            <th className={th}>Fecha</th>
            <th className={th}>Documento</th>
            <th className={th}>Control</th>
            <th className={th}>Proveedor</th>
            <th className={`${th} text-right`}>Total con IVA</th>
            <th className={`${th} text-right`}>Exento</th>
            <th className={`${th} text-right`}>Base 16 %</th>
            <th className={`${th} text-right`}>IVA 16 %</th>
            <th className={`${th} text-right`}>Base 8 %</th>
            <th className={`${th} text-right`}>IVA 8 %</th>
            <th className={`${th} text-right`}>IVA retenido</th>
            <th className={th} />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {l.filas.map((f) => (
            <tr key={f.id}>
              <td className={`${td} whitespace-nowrap`}>{fecha(f.fecha)}</td>
              <td className={`${td} whitespace-nowrap`}>
                {NOMBRE_DOCUMENTO[f.documento]} <span className="cifra">{f.numero}</span>
                {f.facturaAfectada && <div className="text-xs text-slate-500">afecta factura {f.facturaAfectada}</div>}
                {f.numeroComprobante && (
                  <button
                    type="button"
                    className="block text-xs text-marca-700 hover:underline print:hidden"
                    onClick={() => setComprobante(f.id)}
                  >
                    Comprobante {f.numeroComprobante}
                  </button>
                )}
              </td>
              <td className={`${td} cifra`}>{f.numeroControl}</td>
              <td className={td}>
                <div>{f.nombre}</div>
                <div className="text-xs text-slate-500">{f.rif}</div>
              </td>
              {(
                [
                  'totalBs',
                  'exentoBs',
                  'baseGeneralBs',
                  'ivaGeneralBs',
                  'baseReducidaBs',
                  'ivaReducidaBs',
                  'ivaRetenidoBs',
                ] as const
              ).map((k) => (
                <td key={k} className={`${td} cifra text-right`}>
                  <Monto valor={f[k]} />
                </td>
              ))}
              <td className={`${td} text-right`}>
                <button
                  type="button"
                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 print:hidden"
                  aria-label={`Eliminar documento ${f.numero}`}
                  onClick={() => {
                    if (window.confirm(`¿Eliminar del libro el documento ${f.numero} de ${f.nombre}?`)) eliminar.mutate(f.id);
                  }}
                >
                  <Trash2 className="size-4" />
                </button>
              </td>
            </tr>
          ))}
          {l.filas.length === 0 ? (
            <tr>
              <td colSpan={12} className={`${td} py-8 text-center text-slate-500`}>
                No hay compras registradas en este mes.
              </td>
            </tr>
          ) : (
            <Totales
              etiqueta="Totales"
              totales={l.totales}
              columnas={[
                null,
                null,
                null,
                'totalBs',
                'exentoBs',
                'baseGeneralBs',
                'ivaGeneralBs',
                'baseReducidaBs',
                'ivaReducidaBs',
                'ivaRetenidoBs',
                null,
              ]}
            />
          )}
        </tbody>
      </Tabla>

      <ModalComprobante id={comprobante} alCerrar={() => setComprobante(null)} />
      <Modal titulo="Registrar factura de compra" abierto={registrando} alCerrar={() => setRegistrando(false)} ancho="max-w-2xl">
        <form
          className="space-y-3"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            crear.mutate();
          }}
        >
          <p className="text-sm text-slate-600">Copie los montos en bolívares tal como aparecen en el documento del proveedor.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Selector etiqueta="Proveedor" required {...campo('proveedorId')}>
              <option value="">— Elija —</option>
              {proveedores.data?.datos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.razonSocial} ({p.rif})
                </option>
              ))}
            </Selector>
            <Selector etiqueta="Documento" {...campo('tipo')}>
              <option value="FACTURA">Factura</option>
              <option value="NOTA_CREDITO">Nota de crédito</option>
              <option value="NOTA_DEBITO">Nota de débito</option>
            </Selector>
            <Campo etiqueta="Fecha de emisión" type="date" required {...campo('fecha')} />
            <Campo etiqueta="N° de documento" required {...campo('numero')} />
            <Campo etiqueta="N° de control" required {...campo('numeroControl')} />
            {form.tipo !== 'FACTURA' && <Campo etiqueta="Factura que modifica" required {...campo('facturaAfectada')} />}
          </div>
          <Fila>
            <Campo etiqueta="Exento" inputMode="decimal" {...campo('baseExentaBs')} />
            <span />
          </Fila>
          <Fila>
            <Campo
              etiqueta={`Base ${alicuotas?.GENERAL ?? 16} %`}
              inputMode="decimal"
              {...base('baseGeneralBs', 'ivaGeneralBs', alicuotas?.GENERAL)}
            />
            <Campo etiqueta={`IVA ${alicuotas?.GENERAL ?? 16} %`} inputMode="decimal" {...campo('ivaGeneralBs')} />
          </Fila>
          <Fila>
            <Campo
              etiqueta={`Base ${alicuotas?.REDUCIDA ?? 8} %`}
              inputMode="decimal"
              {...base('baseReducidaBs', 'ivaReducidaBs', alicuotas?.REDUCIDA)}
            />
            <Campo etiqueta={`IVA ${alicuotas?.REDUCIDA ?? 8} %`} inputMode="decimal" {...campo('ivaReducidaBs')} />
          </Fila>
          {agente && (
            <Fila>
              <Selector etiqueta="Retención de IVA" {...campo('porcentajeRetencion')}>
                <option value="75">75 % (general)</option>
                <option value="100">100 %</option>
              </Selector>
              <p className="self-end text-xs text-slate-500">Se emite el comprobante de retención al registrar.</p>
            </Fila>
          )}
          <AreaTexto etiqueta="Notas" rows={2} {...campo('notas')} />
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

const Fila = ({ children }: { children: ReactNode }) => <div className="grid gap-3 sm:grid-cols-2">{children}</div>;

function Resumen({ mes }: { mes: string }) {
  const r = useQuery({ queryKey: ['fiscal', 'resumen', mes], queryFn: () => api.get<ResumenIva>('/fiscal/resumen', { mes }) });
  if (r.isLoading) return <Cargando />;
  if (r.error) return <Aviso tipo="error">{r.error.message}</Aviso>;
  const d = r.data!;
  const diferencia = Number(d.diferenciaBs);
  const linea = (texto: string, valor: string, fuerte = false) => (
    <div
      className={`flex justify-between gap-4 py-1.5 ${fuerte ? 'border-t border-slate-200 pt-2 font-semibold text-slate-900' : ''}`}
    >
      <span>{texto}</span>
      <span className="cifra">Bs {numero(valor, 2)}</span>
    </div>
  );
  return (
    <Tarjeta titulo="Resumen del IVA" className="max-w-xl">
      <div className="text-sm text-slate-700">
        {linea('Débito fiscal (IVA de ventas menos notas de crédito)', d.debitoFiscalBs)}
        {linea('Crédito fiscal (IVA de compras)', d.creditoFiscalBs)}
        {Number(d.retencionesRecibidasBs) > 0 && linea('Retenciones que le hicieron sus clientes', d.retencionesRecibidasBs)}
        {linea(
          diferencia >= 0 ? 'Cuota del período (débito − crédito − retenciones)' : 'Excedente de crédito para el mes siguiente',
          Math.abs(diferencia).toFixed(2),
          true,
        )}
        <div className="mt-3 space-y-1 text-xs text-slate-500">
          <div>IVA retenido a proveedores: Bs {numero(d.ivaRetenidoBs, 2)} (se entera aparte; no reduce la cuota).</div>
          <div>IGTF percibido en ventas: Bs {numero(d.igtfPercibidoBs, 2)}.</div>
          <div>Es una ayuda para la declaración: no incluye excedentes ni retenciones de meses anteriores.</div>
        </div>
      </div>
    </Tarjeta>
  );
}

function Retenciones({ mes }: { mes: string }) {
  const avisos = useAvisos();
  const [comprobante, setComprobante] = useState<number | null>(null);
  const r = useQuery({
    queryKey: ['fiscal', 'retenciones', mes],
    queryFn: () =>
      api.get<(ComprobanteRetencion['factura'] & { proveedor: { rif: string; razonSocial: string } })[]>('/fiscal/retenciones', {
        mes,
      }),
  });
  const txt = (quincena: 1 | 2) =>
    descargar(`/fiscal/retenciones/txt?mes=${mes}&quincena=${quincena}`, `retenciones-iva-${mes}-q${quincena}.txt`).catch(
      avisos.error,
    );
  if (r.isLoading) return <Cargando />;
  if (r.error) return <Aviso tipo="error">{r.error.message}</Aviso>;
  return (
    <Tarjeta
      titulo="Comprobantes de retención emitidos"
      acciones={
        <>
          <Boton variante="secundario" icono={<Download className="size-4" />} onClick={() => void txt(1)}>
            TXT 1.ª quincena
          </Boton>
          <Boton variante="secundario" icono={<Download className="size-4" />} onClick={() => void txt(2)}>
            TXT 2.ª quincena
          </Boton>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-600">
        Los comprobantes se emiten solos al registrar facturas de proveedores cuando la empresa es agente de retención
        (Configuración). El archivo TXT es para el portal del SENIAT: revise el formato con su contador antes de la primera
        declaración.
      </p>
      <Tabla>
        <thead>
          <tr>
            <th className={th}>Comprobante</th>
            <th className={th}>Proveedor</th>
            <th className={th}>Documento</th>
            <th className={`${th} text-right`}>IVA</th>
            <th className={`${th} text-right`}>%</th>
            <th className={`${th} text-right`}>Retenido</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {r.data!.map((f) => (
            <tr key={f.id} className="cursor-pointer hover:bg-marca-50/60" onClick={() => setComprobante(f.id)}>
              <td className={td}>
                <div className="cifra font-medium">{f.numeroComprobante}</div>
                <div className="text-xs text-slate-500">{fecha(f.fechaComprobante)}</div>
              </td>
              <td className={td}>
                <div>{f.proveedor.razonSocial}</div>
                <div className="text-xs text-slate-500">{f.proveedor.rif}</div>
              </td>
              <td className={td}>
                {NOMBRE_DOCUMENTO[f.tipo]} <span className="cifra">{f.numero}</span>
              </td>
              <td className={`${td} cifra text-right`}>{numero(Number(f.ivaGeneralBs) + Number(f.ivaReducidaBs), 2)}</td>
              <td className={`${td} cifra text-right`}>{numero(f.porcentajeRetencion, 0)}</td>
              <td className={`${td} cifra text-right font-medium`}>{numero(f.ivaRetenidoBs, 2)}</td>
            </tr>
          ))}
          {r.data!.length === 0 && (
            <tr>
              <td colSpan={6} className={`${td} py-8 text-center text-slate-500`}>
                No se emitieron comprobantes en este mes.
              </td>
            </tr>
          )}
        </tbody>
      </Tabla>
      <ModalComprobante id={comprobante} alCerrar={() => setComprobante(null)} />
    </Tarjeta>
  );
}

/** Comprobante de retención de IVA para imprimir y entregar al proveedor. */
function ModalComprobante({ id, alCerrar }: { id: number | null; alCerrar: () => void }) {
  const r = useQuery({
    queryKey: ['fiscal', 'comprobante', id],
    queryFn: () => api.get<ComprobanteRetencion>(`/fiscal/compras/${id}/comprobante`),
    enabled: id !== null,
  });
  const c = r.data;
  const f = c?.factura;
  const fila = (texto: string, valor: string) => (
    <div className="flex justify-between gap-3">
      <span>{texto}</span>
      <span className="cifra">Bs {numero(valor, 2)}</span>
    </div>
  );
  return (
    <Modal titulo="Comprobante de retención de IVA" abierto={id !== null} alCerrar={alCerrar} ancho="max-w-2xl">
      {!c || !f ? (
        <Cargando />
      ) : (
        <div className="space-y-4 text-sm text-slate-700">
          <div className="flex flex-wrap justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <div className="text-xs text-slate-500 uppercase">Agente de retención</div>
              <div className="font-semibold text-slate-900">{c.agente.razonSocial}</div>
              <div>RIF {c.agente.rif}</div>
              {c.agente.direccion && <div className="text-xs text-slate-500">{c.agente.direccion}</div>}
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500 uppercase">Comprobante N°</div>
              <div className="cifra text-lg font-semibold text-slate-900">{f.numeroComprobante}</div>
              <div>Fecha {fecha(f.fechaComprobante)}</div>
              <div>
                Período fiscal {c.periodo.slice(0, 4)}-{c.periodo.slice(4)}
              </div>
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 uppercase">Sujeto retenido</div>
            <div className="font-medium text-slate-900">{f.proveedor.razonSocial}</div>
            <div>RIF {f.proveedor.rif}</div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div>
              <div className="text-xs text-slate-500 uppercase">Documento</div>
              {NOMBRE_DOCUMENTO[f.tipo]} {f.numero}
            </div>
            <div>
              <div className="text-xs text-slate-500 uppercase">N° de control</div>
              {f.numeroControl}
            </div>
            <div>
              <div className="text-xs text-slate-500 uppercase">Fecha</div>
              {fecha(f.fecha)}
            </div>
            <div>
              <div className="text-xs text-slate-500 uppercase">Factura afectada</div>
              {f.facturaAfectada ?? '—'}
            </div>
          </div>
          <div className="ml-auto max-w-sm space-y-1">
            {fila('Total del documento (con IVA)', f.totalBs)}
            {Number(f.baseExentaBs) > 0 && fila('Exento', f.baseExentaBs)}
            {Number(f.baseGeneralBs) > 0 && fila('Base imponible alícuota general', f.baseGeneralBs)}
            {Number(f.ivaGeneralBs) > 0 && fila('IVA alícuota general', f.ivaGeneralBs)}
            {Number(f.baseReducidaBs) > 0 && fila('Base imponible alícuota reducida', f.baseReducidaBs)}
            {Number(f.ivaReducidaBs) > 0 && fila('IVA alícuota reducida', f.ivaReducidaBs)}
            <div className="flex justify-between gap-3 border-t border-slate-200 pt-1 font-semibold text-slate-900">
              <span>IVA retenido ({numero(f.porcentajeRetencion, 0)} %)</span>
              <span className="cifra">Bs {numero(f.ivaRetenidoBs, 2)}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-8 pt-10 text-center text-xs text-slate-500">
            <div className="border-t border-slate-400 pt-1">Firma y sello del agente de retención</div>
            <div className="border-t border-slate-400 pt-1">Recibido por el proveedor</div>
          </div>
          <div className="flex justify-end print:hidden">
            <Boton variante="secundario" icono={<Printer className="size-4" />} onClick={() => window.print()}>
              Imprimir
            </Boton>
          </div>
        </div>
      )}
    </Modal>
  );
}
