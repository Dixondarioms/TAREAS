import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { api } from '../lib/api';
import { aDecimalApi, fecha, numero, sinCeros, usd } from '../lib/formato';
import { useSesion } from '../lib/sesion';
import { MovimientoInventario, Pagina, TipoMovimiento } from '../lib/tipos';
import { useAvisos } from './avisos';
import { AreaTexto, Aviso, Boton, Campo, Cargando, Insignia, Modal, Paginador, Selector, Tabla, td, th } from './ui';

export const NOMBRE_MOVIMIENTO: Record<TipoMovimiento, string> = {
  ENTRADA: 'Entrada',
  SALIDA: 'Salida',
  MERMA: 'Merma',
  CONTEO: 'Conteo',
  COMPRA: 'Compra',
  VENTA: 'Venta',
  DEVOLUCION: 'Devolución',
};

/** Cantidad sin ceros sobrantes, en formato venezolano: "1234.500" → "1.234,5". */
export function cantidad(valor: string | null | undefined): string {
  if (valor == null || valor === '') return '—';
  const limpio = sinCeros(valor);
  const decimales = limpio.includes('.') ? limpio.split('.')[1].length : 0;
  return numero(limpio, decimales);
}

/** Existencia con color: rojo si no hay, ámbar si está en el mínimo o por debajo. */
export function Existencia({ existencia, minimo, unidad }: { existencia: string; minimo: string; unidad?: string }) {
  const n = Number(existencia);
  const min = Number(minimo);
  const color = n <= 0 ? 'rojo' : min > 0 && n <= min ? 'ambar' : 'verde';
  return (
    <Insignia color={color}>
      <span className="cifra">
        {cantidad(existencia)}
        {unidad && ` ${unidad}`}
      </span>
    </Insignia>
  );
}

export interface ProductoInventario {
  id: number;
  codigo: string;
  descripcion: string;
  unidad: string;
  existencia: string;
  stockMinimo: string;
}

/** Kardex del producto y, para gerente y almacén, el formulario de ajuste. */
export function ModalKardex({ producto, alCerrar }: { producto: ProductoInventario | null; alCerrar: () => void }) {
  const { puede } = useSesion();
  const avisos = useAvisos();
  const consultas = useQueryClient();
  const [pagina, setPagina] = useState(1);
  const [ajustando, setAjustando] = useState(false);
  const [form, setForm] = useState({ tipo: 'ENTRADA', cantidad: '', motivo: '' });
  /** Existencia tras el último ajuste hecho en esta ventana (la del producto puede venir de antes). */
  const [ajustada, setAjustada] = useState<string | null>(null);
  const verCostos = puede('GERENTE', 'ALMACEN');

  const movimientos = useQuery({
    queryKey: ['inventario', 'movimientos', producto?.id, pagina],
    queryFn: () =>
      api.get<Pagina<MovimientoInventario>>(`/inventario/productos/${producto!.id}/movimientos`, { pagina, porPagina: 15 }),
    enabled: Boolean(producto),
    placeholderData: keepPreviousData,
  });

  const ajustar = useMutation({
    mutationFn: () =>
      api.post<MovimientoInventario>('/inventario/ajustes', {
        productoId: producto!.id,
        tipo: form.tipo,
        cantidad: aDecimalApi(form.cantidad),
        motivo: form.motivo,
      }),
    onSuccess: (m) => {
      avisos.exito(`Ajuste registrado. Existencia: ${cantidad(m.existenciaResultante)} ${producto!.unidad}`);
      setAjustada(m.existenciaResultante);
      setAjustando(false);
      setForm({ tipo: 'ENTRADA', cantidad: '', motivo: '' });
      setPagina(1);
      void consultas.invalidateQueries({ queryKey: ['inventario'] });
      void consultas.invalidateQueries({ queryKey: ['productos'] });
    },
    onError: avisos.error,
  });

  const cerrar = () => {
    setPagina(1);
    setAjustando(false);
    setAjustada(null);
    alCerrar();
  };
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    ajustar.mutate();
  };
  const actual = ajustada ?? producto?.existencia;

  return (
    <Modal
      titulo={producto ? `${producto.codigo} · ${producto.descripcion}` : ''}
      abierto={Boolean(producto)}
      alCerrar={cerrar}
      ancho="max-w-3xl"
    >
      {producto && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              Existencia actual: <Existencia existencia={actual ?? '0'} minimo={producto.stockMinimo} unidad={producto.unidad} />
              {Number(producto.stockMinimo) > 0 && (
                <span className="text-slate-500">
                  · mínimo {cantidad(producto.stockMinimo)} {producto.unidad}
                </span>
              )}
            </div>
            {puede('GERENTE', 'ALMACEN') && !ajustando && (
              <Boton variante="secundario" onClick={() => setAjustando(true)}>
                Ajustar existencia
              </Boton>
            )}
          </div>

          {ajustando && (
            <form onSubmit={enviar} className="space-y-3 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
              <div className="grid gap-3 sm:grid-cols-2">
                <Selector
                  etiqueta="Tipo de ajuste"
                  value={form.tipo}
                  onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                >
                  <option value="ENTRADA">Entrada (suma)</option>
                  <option value="SALIDA">Salida (resta)</option>
                  <option value="MERMA">Merma: dañado, vencido o extraviado (resta)</option>
                </Selector>
                <Campo
                  etiqueta={`Cantidad (${producto.unidad})`}
                  inputMode="decimal"
                  required
                  autoFocus
                  value={form.cantidad}
                  onChange={(e) => setForm({ ...form, cantidad: e.target.value })}
                />
              </div>
              <AreaTexto
                etiqueta="Motivo"
                rows={2}
                required
                minLength={3}
                maxLength={200}
                placeholder="Ej.: mercancía encontrada en depósito"
                value={form.motivo}
                onChange={(e) => setForm({ ...form, motivo: e.target.value })}
              />
              <div className="flex justify-end gap-2">
                <Boton variante="fantasma" onClick={() => setAjustando(false)}>
                  Cancelar
                </Boton>
                <Boton type="submit" cargando={ajustar.isPending}>
                  Registrar ajuste
                </Boton>
              </div>
            </form>
          )}

          {movimientos.isLoading ? (
            <Cargando />
          ) : movimientos.error ? (
            <Aviso tipo="error">{movimientos.error.message}</Aviso>
          ) : movimientos.data?.total === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Este producto todavía no tiene movimientos de inventario.</p>
          ) : (
            <>
              <Tabla>
                <thead>
                  <tr>
                    <th className={th}>Fecha</th>
                    <th className={th}>Movimiento</th>
                    <th className={`${th} text-right`}>Cantidad</th>
                    <th className={`${th} text-right`}>Existencia</th>
                    {verCostos && <th className={`${th} text-right`}>Costo</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {movimientos.data?.datos.map((m) => {
                    const entra = Number(m.cantidad) > 0;
                    return (
                      <tr key={m.id}>
                        <td className={`${td} whitespace-nowrap text-slate-600`}>{fecha(m.creadoEn)}</td>
                        <td className={td}>
                          <div className="font-medium text-slate-800">{NOMBRE_MOVIMIENTO[m.tipo]}</div>
                          <div className="text-xs text-slate-500">
                            {[m.motivo, m.referencia, m.usuario].filter(Boolean).join(' · ')}
                          </div>
                        </td>
                        <td className={`${td} cifra text-right font-medium ${entra ? 'text-emerald-700' : 'text-red-700'}`}>
                          {entra ? '+' : '−'}
                          {cantidad(String(Math.abs(Number(m.cantidad))))}
                        </td>
                        <td className={`${td} cifra text-right`}>{cantidad(m.existenciaResultante)}</td>
                        {verCostos && <td className={`${td} cifra text-right text-slate-500`}>{usd(m.costoUsd)}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </Tabla>
              {movimientos.data && (
                <Paginador
                  pagina={movimientos.data.pagina}
                  porPagina={movimientos.data.porPagina}
                  total={movimientos.data.total}
                  alCambiar={setPagina}
                />
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
