import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { useAvisos } from '../componentes/avisos';
import { TarjetaTasas } from '../componentes/TarjetaTasas';
import { Boton, Campo, Cargando, Encabezado, Insignia, Selector, Tabla, Tarjeta, td, th } from '../componentes/ui';
import { api } from '../lib/api';
import { aDecimalApi, fecha, numero } from '../lib/formato';
import { useSesion } from '../lib/sesion';
import { Moneda, TasaCambio } from '../lib/tipos';

const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());

export function Tasas() {
  const { puede } = useSesion();
  const [moneda, setMoneda] = useState<Moneda>('USD');
  const historial = useQuery({
    queryKey: ['tasas', 'historial', moneda],
    queryFn: () => api.get<TasaCambio[]>('/tasas', { moneda }),
  });

  return (
    <>
      <Encabezado
        titulo="Tasa de cambio"
        descripcion="Los precios en bolívares se calculan con la tasa oficial vigente. Si no hay internet, puede cargarla manualmente."
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <TarjetaTasas />
          <Tarjeta
            titulo="Historial"
            acciones={
              <Selector value={moneda} onChange={(e) => setMoneda(e.target.value as Moneda)} aria-label="Moneda">
                <option value="USD">Dólar</option>
                <option value="EUR">Euro</option>
              </Selector>
            }
          >
            {historial.isLoading ? (
              <Cargando />
            ) : (
              <Tabla>
                <thead>
                  <tr>
                    <th className={th}>Fecha valor</th>
                    <th className={`${th} text-right`}>Bs por {moneda}</th>
                    <th className={th}>Fuente</th>
                    <th className={th}>Registrada</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {historial.data?.map((t) => (
                    <tr key={t.id}>
                      <td className={td}>{fecha(t.fechaValor)}</td>
                      <td className={`${td} cifra text-right font-medium`}>{numero(t.valor, 8)}</td>
                      <td className={td}>
                        <Insignia color={t.fuente === 'BCV' ? 'verde' : 'azul'}>
                          {t.fuente === 'BCV' ? 'BCV' : `Manual${t.creadoPor ? ` · ${t.creadoPor.nombre}` : ''}`}
                        </Insignia>
                      </td>
                      <td className={`${td} text-slate-500`}>{fecha(t.creadoEn)}</td>
                    </tr>
                  ))}
                  {historial.data?.length === 0 && (
                    <tr>
                      <td className={`${td} text-slate-500`} colSpan={4}>
                        Sin registros
                      </td>
                    </tr>
                  )}
                </tbody>
              </Tabla>
            )}
          </Tarjeta>
        </div>
        {puede('GERENTE') && <CargaManual />}
      </div>
    </>
  );
}

function CargaManual() {
  const consultas = useQueryClient();
  const avisos = useAvisos();
  const [moneda, setMoneda] = useState<Moneda>('USD');
  const [valor, setValor] = useState('');
  const [fechaValor, setFechaValor] = useState(hoy());
  const guardar = useMutation({
    mutationFn: () => api.post('/tasas', { moneda, valor: aDecimalApi(valor), fechaValor }),
    onSuccess: () => {
      avisos.exito('Tasa registrada');
      setValor('');
      void consultas.invalidateQueries({ queryKey: ['tasas'] });
      void consultas.invalidateQueries({ queryKey: ['productos'] });
    },
    onError: avisos.error,
  });
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    guardar.mutate();
  };
  return (
    <Tarjeta titulo="Cargar tasa manualmente">
      <form onSubmit={enviar} className="space-y-3">
        <Selector etiqueta="Moneda" value={moneda} onChange={(e) => setMoneda(e.target.value as Moneda)}>
          <option value="USD">Dólar (USD)</option>
          <option value="EUR">Euro (EUR)</option>
        </Selector>
        <Campo
          etiqueta="Bolívares por unidad"
          inputMode="decimal"
          placeholder="Ej. 215,4729"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          required
        />
        <Campo
          etiqueta="Fecha valor"
          type="date"
          value={fechaValor}
          onChange={(e) => setFechaValor(e.target.value)}
          required
          ayuda="Fecha desde la cual rige la tasa."
        />
        <Boton type="submit" cargando={guardar.isPending} className="w-full">
          Registrar tasa
        </Boton>
        <p className="text-xs text-slate-500">
          Una tasa cargada para una fecha que ya tiene otra reemplaza a la anterior. El historial conserva ambas.
        </p>
      </form>
    </Tarjeta>
  );
}
