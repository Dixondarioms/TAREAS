import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { useState } from 'react';
import { cantidad } from '../componentes/inventario';
import { Aviso, Boton, Campo, Cargando, Encabezado, Tabla, Tarjeta, td, th } from '../componentes/ui';
import { api } from '../lib/api';
import { bs, fecha, numero } from '../lib/formato';
import { MetodoPago, METODOS, simboloMoneda } from '../lib/ventas';

interface ReporteVentas {
  desde: string;
  hasta: string;
  totales: {
    facturas: number;
    anuladas: number;
    totalBs: string;
    ventaNetaUsd: string;
    ivaBs: string;
    igtfBs: string;
    notasCreditoBs: string;
    costoUsd: string;
    gananciaUsd: string;
    margenPorcentaje: string | null;
    ticketPromedioUsd: string;
    lineasSinCosto: number;
  };
  porDia: { fecha: string; facturas: number; totalBs: string; ventaUsd: string }[];
  porMetodo: { metodo: MetodoPago; monto: string; montoBs: string }[];
  porCajero: { usuario: string; facturas: number; totalBs: string }[];
  productos: {
    productoId: number;
    codigo: string;
    descripcion: string;
    cantidadBase: string;
    ventaUsd: string;
    costoUsd: string | null;
    gananciaUsd: string | null;
  }[];
}

const iso = (d: Date) => d.toLocaleDateString('en-CA');

/** Atajos de período; las fechas se calculan con el reloj del equipo. */
const PERIODOS: { texto: string; rango: () => [string, string] }[] = [
  { texto: 'Hoy', rango: () => [iso(new Date()), iso(new Date())] },
  {
    texto: 'Últimos 7 días',
    rango: () => {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      return [iso(d), iso(new Date())];
    },
  },
  {
    texto: 'Este mes',
    rango: () => {
      const d = new Date();
      return [iso(new Date(d.getFullYear(), d.getMonth(), 1)), iso(d)];
    },
  },
  {
    texto: 'Mes pasado',
    rango: () => {
      const d = new Date();
      return [iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)), iso(new Date(d.getFullYear(), d.getMonth(), 0))];
    },
  },
];

export function Reportes() {
  const [[desde, hasta], setRango] = useState<[string, string]>(PERIODOS[2].rango());
  const r = useQuery({
    queryKey: ['reportes', 'ventas', desde, hasta],
    queryFn: () => api.get<ReporteVentas>('/reportes/ventas', { desde, hasta, limite: 30 }),
    enabled: Boolean(desde && hasta),
  });
  const d = r.data;
  const maxDia = Math.max(1, ...(d?.porDia.map((x) => Number(x.ventaUsd)) ?? [1]));
  return (
    <>
      <Encabezado
        titulo="Reportes de ventas"
        descripcion="Ventas, ganancia y productos más vendidos del período. Los montos en dólares usan la tasa de cada factura."
        acciones={
          <Boton variante="secundario" icono={<Printer className="size-4" />} onClick={() => window.print()}>
            Imprimir
          </Boton>
        }
      />
      <div className="mb-5 flex flex-wrap items-end gap-2 print:hidden">
        <Campo etiqueta="Desde" type="date" value={desde} onChange={(e) => setRango([e.target.value, hasta])} />
        <Campo etiqueta="Hasta" type="date" value={hasta} onChange={(e) => setRango([desde, e.target.value])} />
        {PERIODOS.map((p) => (
          <Boton key={p.texto} variante="fantasma" onClick={() => setRango(p.rango())}>
            {p.texto}
          </Boton>
        ))}
      </div>
      <p className="mb-3 hidden text-sm text-slate-600 print:block">
        Período: {fecha(desde)} al {fecha(hasta)}
      </p>

      {r.error && <Aviso tipo="error">{r.error.message}</Aviso>}
      {r.isLoading || !d ? (
        !r.error && <Cargando />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Indicador
              titulo="Ventas netas"
              valor={`$ ${numero(d.totales.ventaNetaUsd, 2)}`}
              detalle={`${bs(d.totales.totalBs)} con IVA`}
            />
            <Indicador
              titulo="Ganancia bruta"
              valor={`$ ${numero(d.totales.gananciaUsd, 2)}`}
              detalle={
                d.totales.margenPorcentaje !== null
                  ? `margen ${numero(d.totales.margenPorcentaje, 1)} %`
                  : 'sin costos registrados'
              }
            />
            <Indicador
              titulo="Facturas"
              valor={numero(d.totales.facturas, 0)}
              detalle={`ticket promedio $ ${numero(d.totales.ticketPromedioUsd, 2)}${d.totales.anuladas ? ` · ${d.totales.anuladas} anuladas` : ''}`}
            />
            <Indicador
              titulo="Impuestos"
              valor={bs(d.totales.ivaBs)}
              detalle={`IVA${Number(d.totales.igtfBs) > 0 ? ` · IGTF ${bs(d.totales.igtfBs)}` : ''}`}
            />
          </div>
          {Number(d.totales.notasCreditoBs) > 0 && (
            <Aviso tipo="info">Se restaron {bs(d.totales.notasCreditoBs)} de notas de crédito (devoluciones).</Aviso>
          )}
          {d.totales.lineasSinCosto > 0 && (
            <Aviso tipo="advertencia">
              {d.totales.lineasSinCosto} renglones de ventas anteriores a esta versión no tienen costo registrado y no entran en
              la ganancia.
            </Aviso>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <Tarjeta titulo="Facturado por día (antes de devoluciones)">
              {d.porDia.length === 0 ? (
                <p className="text-sm text-slate-500">Sin ventas en el período.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {d.porDia.map((x) => (
                    <li key={x.fecha} className="grid grid-cols-[5.5rem_1fr_6rem] items-center gap-2">
                      <span className="text-slate-600">{fecha(x.fecha)}</span>
                      <span
                        className="h-2.5 rounded bg-marca-500/80"
                        style={{ width: `${(Number(x.ventaUsd) / maxDia) * 100}%` }}
                      />
                      <span className="cifra text-right">$ {numero(x.ventaUsd, 2)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Tarjeta>
            <div className="space-y-5">
              <Tarjeta titulo="Cobrado por método">
                <ul className="divide-y divide-slate-100 text-sm">
                  {d.porMetodo.map((m) => (
                    <li key={m.metodo} className="flex justify-between gap-3 py-1.5">
                      <span>{METODOS[m.metodo]?.nombre ?? m.metodo}</span>
                      <span className="cifra">
                        {simboloMoneda(m.metodo)} {numero(m.monto, 2)}
                        {METODOS[m.metodo]?.moneda === 'USD' && <span className="text-slate-500"> ({bs(m.montoBs)})</span>}
                      </span>
                    </li>
                  ))}
                  {d.porMetodo.length === 0 && <li className="py-1.5 text-slate-500">—</li>}
                </ul>
              </Tarjeta>
              <Tarjeta titulo="Por cajero">
                <ul className="divide-y divide-slate-100 text-sm">
                  {d.porCajero.map((c) => (
                    <li key={c.usuario} className="flex justify-between gap-3 py-1.5">
                      <span>
                        {c.usuario} <span className="text-slate-500">· {c.facturas} facturas</span>
                      </span>
                      <span className="cifra">{bs(c.totalBs)}</span>
                    </li>
                  ))}
                  {d.porCajero.length === 0 && <li className="py-1.5 text-slate-500">—</li>}
                </ul>
              </Tarjeta>
            </div>
          </div>

          <Tarjeta titulo="Productos más vendidos">
            <Tabla>
              <thead>
                <tr>
                  <th className={th}>Producto</th>
                  <th className={`${th} text-right`}>Cantidad</th>
                  <th className={`${th} text-right`}>Venta</th>
                  <th className={`${th} text-right`}>Costo</th>
                  <th className={`${th} text-right`}>Ganancia</th>
                  <th className={`${th} text-right`}>Margen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {d.productos.map((p) => {
                  const margen =
                    p.gananciaUsd !== null && Number(p.ventaUsd) > 0 ? (Number(p.gananciaUsd) / Number(p.ventaUsd)) * 100 : null;
                  return (
                    <tr key={p.productoId}>
                      <td className={td}>
                        {p.descripcion}
                        <div className="font-mono text-xs text-slate-400">{p.codigo}</div>
                      </td>
                      <td className={`${td} cifra text-right`}>{cantidad(p.cantidadBase)}</td>
                      <td className={`${td} cifra text-right`}>$ {numero(p.ventaUsd, 2)}</td>
                      <td className={`${td} cifra text-right text-slate-500`}>
                        {p.costoUsd !== null ? `$ ${numero(p.costoUsd, 2)}` : '—'}
                      </td>
                      <td className={`${td} cifra text-right font-medium`}>
                        {p.gananciaUsd !== null ? `$ ${numero(p.gananciaUsd, 2)}` : '—'}
                      </td>
                      <td className={`${td} cifra text-right ${margen !== null && margen < 10 ? 'text-red-700' : ''}`}>
                        {margen !== null ? `${numero(margen, 1)} %` : '—'}
                      </td>
                    </tr>
                  );
                })}
                {d.productos.length === 0 && (
                  <tr>
                    <td colSpan={6} className={`${td} py-8 text-center text-slate-500`}>
                      Sin ventas en el período.
                    </td>
                  </tr>
                )}
              </tbody>
            </Tabla>
          </Tarjeta>
        </div>
      )}
    </>
  );
}

function Indicador({ titulo, valor, detalle }: { titulo: string; valor: string; detalle: string }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">{titulo}</div>
      <div className="cifra mt-1 text-2xl font-semibold text-slate-900">{valor}</div>
      <div className="text-xs text-slate-500">{detalle}</div>
    </div>
  );
}
