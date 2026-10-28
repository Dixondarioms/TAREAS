import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Printer, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useAvisos } from '../componentes/avisos';
import { ResumenFactura } from '../componentes/factura';
import {
  AreaTexto,
  Aviso,
  Boton,
  Cargando,
  Campo,
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
import { bs, fecha } from '../lib/formato';
import { useSesion } from '../lib/sesion';
import { Pagina } from '../lib/tipos';
import { numeroFactura, Venta } from '../lib/ventas';

export function Ventas() {
  const { puede } = useSesion();
  const [params] = useSearchParams();
  const [texto, setTexto] = useState('');
  const [filtro, setFiltro] = useState({ q: '', desde: '', hasta: '', estado: '', sesionId: params.get('sesionId') ?? '' });
  const [pagina, setPagina] = useState(1);
  const [abierta, setAbierta] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setFiltro((f) => ({ ...f, q: texto }));
      setPagina(1);
    }, 300);
    return () => clearTimeout(t);
  }, [texto]);

  const lista = useQuery({
    queryKey: ['ventas', 'lista', filtro, pagina],
    queryFn: () => api.get<Pagina<Venta>>('/ventas', { ...filtro, pagina, porPagina: 50 }),
    placeholderData: keepPreviousData,
  });
  const cambiar = (cambios: Partial<typeof filtro>) => {
    setFiltro((f) => ({ ...f, ...cambios }));
    setPagina(1);
  };

  return (
    <>
      {/* Al imprimir una factura abierta, solo sale la factura. */}
      <div className={abierta !== null ? 'print:hidden' : undefined}>
        <Encabezado titulo="Ventas" descripcion={puede('GERENTE') ? 'Todas las ventas facturadas.' : 'Sus ventas facturadas.'} />
        <Tarjeta>
          <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_10rem_10rem_10rem]">
            <div className="relative">
              <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-slate-400" />
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="N° de factura, cliente o cédula/RIF…"
                className="block w-full rounded-lg border-0 py-2 pr-3 pl-9 text-sm ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-marca-500"
                aria-label="Buscar ventas"
              />
            </div>
            <Campo type="date" aria-label="Desde" value={filtro.desde} onChange={(e) => cambiar({ desde: e.target.value })} />
            <Campo type="date" aria-label="Hasta" value={filtro.hasta} onChange={(e) => cambiar({ hasta: e.target.value })} />
            <Selector aria-label="Estado" value={filtro.estado} onChange={(e) => cambiar({ estado: e.target.value })}>
              <option value="">Todas</option>
              <option value="COMPLETADA">Completadas</option>
              <option value="ANULADA">Anuladas</option>
            </Selector>
          </div>
          {filtro.sesionId && (
            <div className="mb-3">
              <Aviso tipo="info">
                Ventas de la caja N° {filtro.sesionId}.{' '}
                <button type="button" className="underline" onClick={() => cambiar({ sesionId: '' })}>
                  Ver todas
                </button>
              </Aviso>
            </div>
          )}
          {lista.error && <Aviso tipo="error">{lista.error.message}</Aviso>}
          {lista.isLoading ? (
            <Cargando />
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <th className={th}>Factura</th>
                  <th className={th}>Fecha</th>
                  <th className={th}>Cliente</th>
                  {puede('GERENTE') && <th className={th}>Cajero</th>}
                  <th className={`${th} text-right`}>Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lista.data?.datos.map((v) => (
                  <tr key={v.id} className="cursor-pointer hover:bg-marca-50/60" onClick={() => setAbierta(v.id)}>
                    <td className={`${td} whitespace-nowrap`}>
                      <span className="cifra font-medium">{numeroFactura(v)}</span>{' '}
                      {v.estado === 'ANULADA' && <Insignia color="rojo">Anulada</Insignia>}
                    </td>
                    <td className={`${td} whitespace-nowrap text-slate-600`}>{fecha(v.creadoEn)}</td>
                    <td className={td}>
                      <div>{v.clienteNombre}</div>
                      {v.clienteDocumento && <div className="text-xs text-slate-500">{v.clienteDocumento}</div>}
                    </td>
                    {puede('GERENTE') && <td className={td}>{v.usuario?.nombre}</td>}
                    <td
                      className={`${td} cifra text-right font-medium ${v.estado === 'ANULADA' ? 'text-slate-400 line-through' : ''}`}
                    >
                      {bs(v.totalPagarBs)}
                    </td>
                  </tr>
                ))}
                {lista.data?.datos.length === 0 && (
                  <tr>
                    <td colSpan={5} className={`${td} py-8 text-center text-slate-500`}>
                      No hay ventas con esos filtros.
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
      </div>
      <DetalleVenta id={abierta} alCerrar={() => setAbierta(null)} />
    </>
  );
}

function DetalleVenta({ id, alCerrar }: { id: number | null; alCerrar: () => void }) {
  const avisos = useAvisos();
  const consultas = useQueryClient();
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const venta = useQuery({
    queryKey: ['ventas', 'detalle', id],
    queryFn: () => api.get<Venta>(`/ventas/${id}`),
    enabled: id !== null,
  });
  const anular = useMutation({
    mutationFn: () => api.post<Venta>(`/ventas/${id}/anular`, { motivo }),
    onSuccess: () => {
      avisos.exito('Venta anulada; la mercancía volvió al inventario');
      setAnulando(false);
      setMotivo('');
      void consultas.invalidateQueries({ queryKey: ['ventas'] });
      void consultas.invalidateQueries({ queryKey: ['caja'] });
      void consultas.invalidateQueries({ queryKey: ['productos'] });
      void consultas.invalidateQueries({ queryKey: ['inventario'] });
    },
    onError: avisos.error,
  });
  const cerrar = () => {
    setAnulando(false);
    alCerrar();
  };
  const v = venta.data;
  return (
    <Modal titulo={v ? `Factura ${numeroFactura(v)}` : 'Factura'} abierto={id !== null} alCerrar={cerrar} ancho="max-w-2xl">
      {!v ? (
        <Cargando />
      ) : (
        <div className="space-y-4">
          <ResumenFactura venta={v} />
          {anulando ? (
            <form
              className="space-y-3 rounded-lg bg-red-50 p-3 ring-1 ring-red-200"
              onSubmit={(e) => {
                e.preventDefault();
                anular.mutate();
              }}
            >
              <p className="text-sm text-red-800">
                La mercancía vuelve al inventario y la factura N° {numeroFactura(v)} queda anulada. Marque también la factura del
                talonario como ANULADA y guárdela.
              </p>
              <AreaTexto
                etiqueta="Motivo"
                required
                minLength={3}
                rows={2}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Boton variante="fantasma" onClick={() => setAnulando(false)}>
                  Volver
                </Boton>
                <Boton type="submit" variante="peligro" cargando={anular.isPending}>
                  Anular venta
                </Boton>
              </div>
            </form>
          ) : (
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 print:hidden">
              {v.estado === 'COMPLETADA' && (
                <Boton variante="secundario" onClick={() => setAnulando(true)}>
                  Anular
                </Boton>
              )}
              <Boton variante="secundario" icono={<Printer className="size-4" />} onClick={() => window.print()}>
                Imprimir
              </Boton>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
