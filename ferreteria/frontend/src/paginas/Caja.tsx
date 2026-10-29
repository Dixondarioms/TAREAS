import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Link } from 'react-router';
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
  Paginador,
  Selector,
  Tabla,
  Tarjeta,
  td,
  th,
} from '../componentes/ui';
import { api } from '../lib/api';
import { aDecimalApi, bs, fecha, numero } from '../lib/formato';
import { useSesion } from '../lib/sesion';
import { Pagina } from '../lib/tipos';
import {
  CajaActual,
  cajaAbierta,
  LISTA_METODOS,
  MetodoPago,
  METODOS,
  MontosPorMetodo,
  ResumenCaja,
  simboloMoneda,
} from '../lib/ventas';

const NOMBRE_MOVIMIENTO = { RETIRO: 'Retiro', GASTO: 'Gasto', INGRESO: 'Ingreso' } as const;

export function Caja() {
  const { puede } = useSesion();
  const [pestana, setPestana] = useState<'mia' | 'historial'>('mia');
  return (
    <>
      <Encabezado titulo="Caja" descripcion="Apertura, retiros y gastos, y cierre con arqueo por método de pago." />
      {puede('GERENTE') && (
        <div className="mb-4 flex w-fit gap-1 rounded-lg bg-slate-200/70 p-1 print:hidden" role="tablist">
          {(
            [
              ['mia', 'Mi caja'],
              ['historial', 'Historial de cajas'],
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
      {pestana === 'mia' ? <MiCaja /> : <Historial />}
    </>
  );
}

function MiCaja() {
  const avisos = useAvisos();
  const consultas = useQueryClient();
  const actual = useQuery({ queryKey: ['caja', 'actual'], queryFn: () => api.get<CajaActual>('/caja/actual') });
  const [cerrada, setCerrada] = useState<ResumenCaja | null>(null);
  const refrescar = () => void consultas.invalidateQueries({ queryKey: ['caja'] });

  if (actual.isLoading) return <Cargando />;
  if (cerrada) {
    return (
      <>
        <Aviso tipo="exito">Caja cerrada. Entregue el dinero contado y este reporte a gerencia.</Aviso>
        <div className="mt-4">
          <ReporteCaja resumen={cerrada} />
        </div>
        <Boton className="mt-4" onClick={() => setCerrada(null)}>
          Listo
        </Boton>
      </>
    );
  }
  if (!cajaAbierta(actual.data)) return <AbrirCaja alAbrir={refrescar} />;

  return (
    <div className="space-y-5">
      <ReporteCaja resumen={actual.data} />
      <div className="grid gap-5 lg:grid-cols-2 print:hidden">
        <FormMovimiento alRegistrar={refrescar} />
        <FormCierre
          esperado={actual.data.esperado}
          alCerrar={(r) => {
            setCerrada(r);
            refrescar();
            avisos.exito('Caja cerrada');
          }}
        />
      </div>
    </div>
  );
}

function AbrirCaja({ alAbrir }: { alAbrir: () => void }) {
  const avisos = useAvisos();
  const [fondo, setFondo] = useState({ bs: '', usd: '' });
  const abrir = useMutation({
    mutationFn: () =>
      api.post<ResumenCaja>('/caja/abrir', { fondoBs: aDecimalApi(fondo.bs || '0'), fondoUsd: aDecimalApi(fondo.usd || '0') }),
    onSuccess: () => {
      avisos.exito('Caja abierta');
      alAbrir();
    },
    onError: avisos.error,
  });
  return (
    <Tarjeta titulo="Abrir caja" className="max-w-lg">
      <form
        className="space-y-3"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          abrir.mutate();
        }}
      >
        <p className="text-sm text-slate-600">Cuente el efectivo con que empieza el turno (el sencillo para dar vuelto).</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo
            etiqueta="Fondo en bolívares"
            inputMode="decimal"
            placeholder="0,00"
            value={fondo.bs}
            onChange={(e) => setFondo({ ...fondo, bs: e.target.value })}
            autoFocus
          />
          <Campo
            etiqueta="Fondo en dólares"
            inputMode="decimal"
            placeholder="0,00"
            value={fondo.usd}
            onChange={(e) => setFondo({ ...fondo, usd: e.target.value })}
          />
        </div>
        <Boton type="submit" cargando={abrir.isPending}>
          Abrir caja
        </Boton>
      </form>
    </Tarjeta>
  );
}

/** Resumen del turno: ventas, cobrado, movimientos y lo esperado (y contado, si ya cerró). */
export function ReporteCaja({ resumen }: { resumen: ResumenCaja }) {
  const s = resumen.sesion;
  const metodos = LISTA_METODOS.filter(
    (m) =>
      resumen.esperado[m] !== undefined ||
      resumen.cobrado[m] !== undefined ||
      resumen.reintegros[m] !== undefined ||
      resumen.abonos[m] !== undefined ||
      s.contado?.[m] !== undefined,
  );
  const cerrada = s.estado === 'CERRADA';
  return (
    <Tarjeta
      titulo={
        <span className="flex items-center gap-2">
          Caja N° {s.id}
          {s.usuario && <span className="font-normal text-slate-500">· {s.usuario.nombre}</span>}
          <Insignia color={cerrada ? 'gris' : 'verde'}>{cerrada ? 'Cerrada' : 'Abierta'}</Insignia>
        </span>
      }
      acciones={
        <Boton variante="fantasma" icono={<Printer className="size-4" />} onClick={() => window.print()}>
          Imprimir
        </Boton>
      }
    >
      <div className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Dato titulo="Abierta" valor={fecha(s.abiertaEn)} />
        <Dato titulo="Cerrada" valor={s.cerradaEn ? fecha(s.cerradaEn) : '—'} />
        <Dato
          titulo="Ventas"
          valor={`${resumen.ventas.cantidad}${resumen.ventas.anuladas ? ` (+${resumen.ventas.anuladas} anuladas)` : ''}`}
        />
        <Dato
          titulo="Total facturado"
          valor={`${bs(resumen.ventas.totalBs)}${Number(resumen.ventas.creditoBs) > 0 ? ` (${bs(resumen.ventas.creditoBs)} fiado)` : ''}`}
        />
      </div>
      <Tabla>
        <thead>
          <tr>
            <th className={th}>Método</th>
            <th className={`${th} text-right`}>Cobrado</th>
            <th className={`${th} text-right`}>Abonos</th>
            <th className={`${th} text-right`}>Vuelto</th>
            <th className={`${th} text-right`}>Reintegros</th>
            <th className={`${th} text-right`}>Esperado</th>
            {cerrada && <th className={`${th} text-right`}>Contado</th>}
            {cerrada && <th className={`${th} text-right`}>Diferencia</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {metodos.map((m) => {
            const dif = resumen.diferencias?.[m];
            return (
              <tr key={m}>
                <td className={td}>{METODOS[m].nombre}</td>
                <td className={`${td} cifra text-right`}>{monto(m, resumen.cobrado[m])}</td>
                <td className={`${td} cifra text-right text-slate-500`}>{monto(m, resumen.abonos[m])}</td>
                <td className={`${td} cifra text-right text-slate-500`}>{monto(m, resumen.vuelto[m])}</td>
                <td className={`${td} cifra text-right text-slate-500`}>{monto(m, resumen.reintegros[m])}</td>
                <td className={`${td} cifra text-right font-medium`}>{monto(m, resumen.esperado[m])}</td>
                {cerrada && <td className={`${td} cifra text-right`}>{monto(m, s.contado?.[m])}</td>}
                {cerrada && (
                  <td
                    className={`${td} cifra text-right font-medium ${
                      !dif || Number(dif) === 0 ? 'text-slate-500' : Number(dif) > 0 ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {dif && Number(dif) > 0 ? '+' : ''}
                    {monto(m, dif)}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </Tabla>
      <p className="mt-2 text-xs text-slate-500">
        Fondo inicial: Bs {numero(s.fondoBs, 2)} y $ {numero(s.fondoUsd, 2)}. Esperado = fondo + cobrado + abonos de clientes −
        vuelto − reintegros ± retiros, gastos e ingresos.
      </p>
      {resumen.movimientos.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-1 text-sm font-semibold text-slate-700">Movimientos de efectivo</h3>
          <ul className="divide-y divide-slate-100 text-sm">
            {resumen.movimientos.map((mov) => (
              <li key={mov.id} className="flex justify-between gap-3 py-1.5">
                <span>
                  {NOMBRE_MOVIMIENTO[mov.tipo]} · {mov.motivo}
                  <span className="text-xs text-slate-500"> · {fecha(mov.creadoEn)}</span>
                </span>
                <span className={`cifra ${mov.tipo === 'INGRESO' ? 'text-emerald-700' : 'text-red-700'}`}>
                  {mov.tipo === 'INGRESO' ? '+' : '−'}
                  {monto(mov.metodo, mov.monto)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {s.observaciones && <p className="mt-3 text-sm text-slate-600">Observaciones: {s.observaciones}</p>}
      {cerrada && (
        <p className="mt-3 text-sm">
          <Link to={`/ventas?sesionId=${s.id}`} className="text-marca-700 hover:underline">
            Ver las ventas de esta caja
          </Link>
        </p>
      )}
    </Tarjeta>
  );
}

const monto = (m: MetodoPago, valor: string | undefined) =>
  valor === undefined ? '—' : `${simboloMoneda(m)} ${numero(valor, 2)}`;

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500 uppercase">{titulo}</div>
      <div className="cifra font-medium text-slate-900">{valor}</div>
    </div>
  );
}

function FormMovimiento({ alRegistrar }: { alRegistrar: () => void }) {
  const avisos = useAvisos();
  const [form, setForm] = useState({ tipo: 'RETIRO', metodo: 'EFECTIVO_BS', monto: '', motivo: '' });
  const registrar = useMutation({
    mutationFn: () => api.post('/caja/movimientos', { ...form, monto: aDecimalApi(form.monto) }),
    onSuccess: () => {
      avisos.exito('Movimiento registrado');
      setForm({ ...form, monto: '', motivo: '' });
      alRegistrar();
    },
    onError: avisos.error,
  });
  return (
    <Tarjeta titulo="Retiro, gasto o ingreso de efectivo">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          registrar.mutate();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Selector etiqueta="Tipo" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
            <option value="RETIRO">Retiro</option>
            <option value="GASTO">Gasto</option>
            <option value="INGRESO">Ingreso</option>
          </Selector>
          <Selector etiqueta="Moneda" value={form.metodo} onChange={(e) => setForm({ ...form, metodo: e.target.value })}>
            <option value="EFECTIVO_BS">Bolívares</option>
            <option value="EFECTIVO_USD">Dólares</option>
          </Selector>
          <Campo
            etiqueta="Monto"
            inputMode="decimal"
            required
            value={form.monto}
            onChange={(e) => setForm({ ...form, monto: e.target.value })}
          />
        </div>
        <Campo
          etiqueta="Motivo"
          required
          minLength={3}
          placeholder="Ej.: depósito en el banco, compra de agua"
          value={form.motivo}
          onChange={(e) => setForm({ ...form, motivo: e.target.value })}
        />
        <Boton type="submit" variante="secundario" cargando={registrar.isPending}>
          Registrar
        </Boton>
      </form>
    </Tarjeta>
  );
}

function FormCierre({ esperado, alCerrar }: { esperado: MontosPorMetodo; alCerrar: (r: ResumenCaja) => void }) {
  const avisos = useAvisos();
  const metodos = LISTA_METODOS.filter((m) => esperado[m] !== undefined);
  const [contado, setContado] = useState<Record<string, string>>({});
  const [observaciones, setObservaciones] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const cerrar = useMutation({
    mutationFn: () =>
      api.post<ResumenCaja>('/caja/cerrar', {
        contado: Object.fromEntries(metodos.map((m) => [m, Number(aDecimalApi(contado[m] || '0')).toFixed(2)])),
        observaciones: observaciones || undefined,
      }),
    onSuccess: (r) => {
      setConfirmando(false);
      alCerrar(r);
    },
    onError: (e) => {
      setConfirmando(false);
      avisos.error(e);
    },
  });
  return (
    <Tarjeta titulo="Cerrar caja">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setConfirmando(true);
        }}
      >
        <p className="text-sm text-slate-600">
          Cuente el efectivo y revise los totales del punto de venta y del banco. Escriba lo que contó, no lo que dice el sistema.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {metodos.map((m) => (
            <Campo
              key={m}
              etiqueta={`${METODOS[m].nombre} (${simboloMoneda(m)})`}
              inputMode="decimal"
              placeholder="0,00"
              value={contado[m] ?? ''}
              onChange={(e) => setContado({ ...contado, [m]: e.target.value })}
            />
          ))}
        </div>
        <AreaTexto etiqueta="Observaciones" rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
        <Boton type="submit" variante="peligro">
          Cerrar caja
        </Boton>
      </form>
      <Modal titulo="Cerrar caja" abierto={confirmando} alCerrar={() => setConfirmando(false)}>
        <p className="text-sm text-slate-700">
          Al cerrar ya no podrá vender ni anular ventas de este turno. Los métodos sin monto se registran como contado en cero.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Boton variante="fantasma" onClick={() => setConfirmando(false)}>
            Volver
          </Boton>
          <Boton variante="peligro" cargando={cerrar.isPending} onClick={() => cerrar.mutate()}>
            Cerrar caja
          </Boton>
        </div>
      </Modal>
    </Tarjeta>
  );
}

function Historial() {
  const [pagina, setPagina] = useState(1);
  const [abierta, setAbierta] = useState<number | null>(null);
  const lista = useQuery({
    queryKey: ['caja', 'sesiones', pagina],
    queryFn: () => api.get<Pagina<ResumenCaja['sesion'] & { usuario: { nombre: string } }>>('/caja/sesiones', { pagina }),
    placeholderData: keepPreviousData,
  });
  const detalle = useQuery({
    queryKey: ['caja', 'sesion', abierta],
    queryFn: () => api.get<ResumenCaja>(`/caja/sesiones/${abierta}`),
    enabled: abierta !== null,
  });
  return (
    <>
      <Tarjeta className={abierta !== null ? 'print:hidden' : undefined}>
        {lista.isLoading ? (
          <Cargando />
        ) : (
          <Tabla>
            <thead>
              <tr>
                <th className={th}>N°</th>
                <th className={th}>Cajero</th>
                <th className={th}>Abierta</th>
                <th className={th}>Cerrada</th>
                <th className={th}>Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lista.data?.datos.map((s) => (
                <tr key={s.id} className="cursor-pointer hover:bg-marca-50/60" onClick={() => setAbierta(s.id)}>
                  <td className={`${td} cifra`}>{s.id}</td>
                  <td className={td}>{s.usuario.nombre}</td>
                  <td className={td}>{fecha(s.abiertaEn)}</td>
                  <td className={td}>{s.cerradaEn ? fecha(s.cerradaEn) : '—'}</td>
                  <td className={td}>
                    <Insignia color={s.estado === 'ABIERTA' ? 'verde' : 'gris'}>
                      {s.estado === 'ABIERTA' ? 'Abierta' : 'Cerrada'}
                    </Insignia>
                  </td>
                </tr>
              ))}
              {lista.data?.datos.length === 0 && (
                <tr>
                  <td colSpan={5} className={`${td} py-8 text-center text-slate-500`}>
                    Todavía no hay cajas registradas.
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
      <Modal titulo={`Caja N° ${abierta ?? ''}`} abierto={abierta !== null} alCerrar={() => setAbierta(null)} ancho="max-w-3xl">
        {detalle.data ? <ReporteCaja resumen={detalle.data} /> : <Cargando />}
      </Modal>
    </>
  );
}
