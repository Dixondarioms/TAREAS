import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { FormEvent, useState } from 'react';
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
import { api } from '../lib/api';
import { fecha } from '../lib/formato';
import { useSesion } from '../lib/sesion';
import { EstadoFacturacion, FacturaAnulada, Talonario, TipoDocumento } from '../lib/ventas';

const rellenar = (n: number, digitos: number) => String(n).padStart(digitos, '0');
const VACIO = {
  tipo: 'FACTURA' as TipoDocumento,
  serie: '',
  numeroDesde: '',
  numeroHasta: '',
  controlPrefijo: '00-',
  controlDesde: '',
  digitos: '6',
};

export function Facturacion() {
  const { puede } = useSesion();
  const avisos = useAvisos();
  const consultas = useQueryClient();
  const [creando, setCreando] = useState(false);
  const [anulando, setAnulando] = useState(false);
  const [form, setForm] = useState(VACIO);
  const [motivo, setMotivo] = useState('');

  const estado = useQuery({
    queryKey: ['talonarios', 'estado'],
    queryFn: () => api.get<EstadoFacturacion>('/talonarios/estado'),
  });
  const estadoNotas = useQuery({
    queryKey: ['talonarios', 'estado', 'NOTA_CREDITO'],
    queryFn: () => api.get<EstadoFacturacion>('/talonarios/estado', { tipo: 'NOTA_CREDITO' }),
  });
  const talonarios = useQuery({ queryKey: ['talonarios', 'lista'], queryFn: () => api.get<Talonario[]>('/talonarios') });
  const anuladas = useQuery({
    queryKey: ['talonarios', 'anuladas'],
    queryFn: () => api.get<FacturaAnulada[]>('/talonarios/anuladas'),
    enabled: puede('GERENTE'),
  });
  const refrescar = () => void consultas.invalidateQueries({ queryKey: ['talonarios'] });

  const crear = useMutation({
    mutationFn: () =>
      api.post('/talonarios', {
        tipo: form.tipo,
        serie: form.serie || undefined,
        numeroDesde: Number(form.numeroDesde),
        numeroHasta: Number(form.numeroHasta),
        controlPrefijo: form.controlPrefijo,
        controlDesde: Number(form.controlDesde),
        digitos: Number(form.digitos),
      }),
    onSuccess: () => {
      avisos.exito('Talonario registrado');
      setCreando(false);
      setForm(VACIO);
      refrescar();
    },
    onError: avisos.error,
  });
  const anular = useMutation({
    mutationFn: () => api.post<FacturaAnulada>('/talonarios/anular-siguiente', { motivo }),
    onSuccess: (f) => {
      avisos.exito(`Factura N° ${f.numero} anulada`);
      setAnulando(false);
      setMotivo('');
      refrescar();
    },
    onError: avisos.error,
  });
  const desactivar = useMutation({
    mutationFn: (id: number) => api.post(`/talonarios/${id}/desactivar`),
    onSuccess: refrescar,
    onError: avisos.error,
  });

  const proxima = estado.data?.proxima;
  const campo = (k: keyof typeof VACIO) => ({
    value: form[k],
    onChange: (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value }),
  });
  const vistaPrevia =
    Number(form.numeroDesde) > 0 && Number(form.controlDesde) > 0
      ? `Primera factura: N° ${form.serie ? `${form.serie.toUpperCase()}-` : ''}${rellenar(Number(form.numeroDesde), Number(form.digitos) || 6)}, control ${form.controlPrefijo}${rellenar(Number(form.controlDesde), Number(form.digitos) || 6)}`
      : null;

  return (
    <>
      <Encabezado
        titulo="Facturación"
        descripcion="Talonarios de facturas de la imprenta autorizada. El sistema asigna cada número en orden, sin saltos."
        acciones={
          puede('GERENTE') && (
            <Boton icono={<Plus className="size-4" />} onClick={() => setCreando(true)}>
              Registrar talonario
            </Boton>
          )
        }
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <Tarjeta titulo="Próxima factura">
          {estado.isLoading ? (
            <Cargando />
          ) : proxima ? (
            <>
              <div className="cifra text-3xl font-semibold text-slate-900">
                {proxima.serie ? `${proxima.serie}-` : ''}
                {proxima.numero}
              </div>
              <div className="cifra text-sm text-slate-500">Control {proxima.numeroControl}</div>
              <div className="mt-2 text-sm text-slate-600">Quedan {estado.data?.restantes} facturas.</div>
              {estado.data?.pocas && (
                <div className="mt-2">
                  <Aviso tipo="advertencia">Quedan pocas facturas: pida el próximo talonario a la imprenta.</Aviso>
                </div>
              )}
              <Boton variante="secundario" className="mt-4" onClick={() => setAnulando(true)}>
                Anular esta hoja
              </Boton>
            </>
          ) : (
            <Aviso tipo="error">No hay facturas disponibles. Registre un talonario para poder vender.</Aviso>
          )}
          <div className="mt-4 border-t border-slate-100 pt-3 text-sm">
            <div className="font-medium text-slate-700">Próxima nota de crédito</div>
            {estadoNotas.data?.proxima ? (
              <div className="cifra text-slate-600">
                N° {estadoNotas.data.proxima.serie ? `${estadoNotas.data.proxima.serie}-` : ''}
                {estadoNotas.data.proxima.numero} · control {estadoNotas.data.proxima.numeroControl} · quedan{' '}
                {estadoNotas.data.restantes}
              </div>
            ) : (
              <div className="text-slate-500">Sin talonario de notas de crédito: regístrelo para poder hacer devoluciones.</div>
            )}
          </div>
        </Tarjeta>

        <Tarjeta titulo="Talonarios" className="lg:col-span-2">
          {talonarios.isLoading ? (
            <Cargando />
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <th className={th}>Tipo</th>
                  <th className={th}>Serie</th>
                  <th className={th}>Números</th>
                  <th className={th}>Control desde</th>
                  <th className={`${th} text-right`}>Quedan</th>
                  <th className={th}>Estado</th>
                  {puede('GERENTE') && <th className={th} />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {talonarios.data?.map((t) => (
                  <tr key={t.id}>
                    <td className={td}>
                      {{ FACTURA: 'Factura', NOTA_CREDITO: 'Nota de crédito', NOTA_DEBITO: 'Nota de débito' }[t.tipo]}
                    </td>
                    <td className={td}>{t.serie || '—'}</td>
                    <td className={`${td} cifra`}>
                      {rellenar(t.numeroDesde, t.digitos)} – {rellenar(t.numeroHasta, t.digitos)}
                    </td>
                    <td className={`${td} cifra`}>
                      {t.controlPrefijo}
                      {rellenar(t.controlDesde, t.digitos)}
                    </td>
                    <td className={`${td} cifra text-right`}>{t.restantes}</td>
                    <td className={td}>
                      {!t.activo ? (
                        <Insignia>Retirado</Insignia>
                      ) : t.restantes === 0 ? (
                        <Insignia>Agotado</Insignia>
                      ) : (
                        <Insignia color="verde">En uso</Insignia>
                      )}
                    </td>
                    {puede('GERENTE') && (
                      <td className={`${td} text-right`}>
                        {t.activo && t.restantes > 0 && (
                          <Boton
                            variante="fantasma"
                            onClick={() => {
                              if (window.confirm('¿Retirar este talonario? Sus facturas sin usar ya no se asignarán.')) {
                                desactivar.mutate(t.id);
                              }
                            }}
                          >
                            Retirar
                          </Boton>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {talonarios.data?.length === 0 && (
                  <tr>
                    <td colSpan={7} className={`${td} py-8 text-center text-slate-500`}>
                      Todavía no hay talonarios registrados.
                    </td>
                  </tr>
                )}
              </tbody>
            </Tabla>
          )}
        </Tarjeta>

        {puede('GERENTE') && (
          <Tarjeta titulo="Hojas anuladas sin venta" className="lg:col-span-3">
            {anuladas.data?.length ? (
              <ul className="divide-y divide-slate-100 text-sm">
                {anuladas.data.map((f) => (
                  <li key={f.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span>
                      <span className="cifra font-medium">N° {f.numero}</span> · control {f.numeroControl} · {f.motivo}
                    </span>
                    <span className="text-slate-500">
                      {fecha(f.creadoEn)}
                      {f.usuario && ` · ${f.usuario.nombre}`}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No se han anulado hojas del talonario.</p>
            )}
          </Tarjeta>
        )}
      </div>

      <Modal titulo="Registrar talonario" abierto={creando} alCerrar={() => setCreando(false)}>
        <form
          className="space-y-3"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            crear.mutate();
          }}
        >
          <p className="text-sm text-slate-600">Copie los datos impresos en la primera y la última hoja del talonario.</p>
          <Selector
            etiqueta="Tipo de documento"
            value={form.tipo}
            onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoDocumento })}
          >
            <option value="FACTURA">Facturas</option>
            <option value="NOTA_CREDITO">Notas de crédito</option>
            <option value="NOTA_DEBITO">Notas de débito</option>
          </Selector>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Desde el N°" inputMode="numeric" required {...campo('numeroDesde')} autoFocus />
            <Campo etiqueta="Hasta el N°" inputMode="numeric" required {...campo('numeroHasta')} />
            <Campo etiqueta="N° de control de la primera" inputMode="numeric" required {...campo('controlDesde')} />
            <Campo etiqueta="Prefijo del control" {...campo('controlPrefijo')} ayuda="Lo que va antes del número, p. ej. 00-" />
            <Campo etiqueta="Serie (si tiene)" maxLength={10} {...campo('serie')} />
            <Campo etiqueta="Dígitos impresos" inputMode="numeric" {...campo('digitos')} ayuda="6 → 000123" />
          </div>
          {vistaPrevia && <Aviso tipo="info">{vistaPrevia}</Aviso>}
          <div className="flex justify-end gap-2">
            <Boton variante="fantasma" onClick={() => setCreando(false)}>
              Cancelar
            </Boton>
            <Boton type="submit" cargando={crear.isPending}>
              Registrar
            </Boton>
          </div>
        </form>
      </Modal>

      <Modal titulo="Anular hoja del talonario" abierto={anulando} alCerrar={() => setAnulando(false)}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            anular.mutate();
          }}
        >
          <p className="text-sm text-slate-700">
            La factura N° {proxima?.numero} (control {proxima?.numeroControl}) quedará anulada sin venta. Escriba ANULADA en la
            hoja y guárdela con el talonario.
          </p>
          <AreaTexto
            etiqueta="Motivo"
            required
            minLength={3}
            rows={2}
            placeholder="Ej.: se manchó, error al llenarla"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Boton variante="fantasma" onClick={() => setAnulando(false)}>
              Volver
            </Boton>
            <Boton type="submit" variante="peligro" cargando={anular.isPending}>
              Anular hoja
            </Boton>
          </div>
        </form>
      </Modal>
    </>
  );
}
