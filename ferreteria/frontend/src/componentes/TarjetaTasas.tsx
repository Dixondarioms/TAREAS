import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import { useEstadoTasas } from '../lib/consultas';
import { fecha, numero } from '../lib/formato';
import { useSesion } from '../lib/sesion';
import { EstadoMoneda, TasaCambio } from '../lib/tipos';
import { useAvisos } from './avisos';
import { Aviso, Boton, Cargando, Insignia, Tarjeta } from './ui';

/** Muestra la tasa BCV vigente (USD y EUR) y permite actualizarla desde el BCV. */
export function TarjetaTasas() {
  const { puede } = useSesion();
  const estado = useEstadoTasas();
  const consultas = useQueryClient();
  const avisos = useAvisos();
  const actualizar = useMutation({
    mutationFn: () => api.post<{ fechaValor: string; registradas: TasaCambio[] }>('/tasas/actualizar-bcv'),
    onSuccess: (r) => {
      avisos.exito(
        r.registradas.length ? `Tasa BCV registrada (fecha valor ${fecha(r.fechaValor)})` : 'La tasa del BCV no ha cambiado',
      );
      void consultas.invalidateQueries({ queryKey: ['tasas'] });
      void consultas.invalidateQueries({ queryKey: ['productos'] });
    },
    onError: avisos.error,
  });

  return (
    <Tarjeta
      titulo="Tasa oficial BCV"
      acciones={
        puede('GERENTE') && (
          <Boton
            variante="secundario"
            onClick={() => actualizar.mutate()}
            cargando={actualizar.isPending}
            icono={<RefreshCw className="size-4" />}
          >
            Consultar BCV
          </Boton>
        )
      }
    >
      {estado.isLoading ? (
        <Cargando />
      ) : estado.error ? (
        <Aviso tipo="error">{estado.error.message}</Aviso>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Moneda simbolo="USD" nombre="Dólar" estado={estado.data!.USD} />
          <Moneda simbolo="EUR" nombre="Euro" estado={estado.data!.EUR} />
        </div>
      )}
    </Tarjeta>
  );
}

function Moneda({ simbolo, nombre, estado }: { simbolo: string; nombre: string; estado: EstadoMoneda }) {
  const v = estado.vigente;
  return (
    <div className="rounded-lg bg-slate-50 p-4 ring-1 ring-slate-200">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500">
          {nombre} ({simbolo})
        </span>
        {v && <Insignia color={v.fuente === 'BCV' ? 'verde' : 'azul'}>{v.fuente === 'BCV' ? 'BCV' : 'Manual'}</Insignia>}
      </div>
      {v ? (
        <>
          <div className="cifra mt-1 text-2xl font-semibold text-slate-900">Bs {numero(v.valor, 4)}</div>
          <div className="mt-1 text-xs text-slate-500">
            Fecha valor {fecha(v.fechaValor)}
            {(estado.diasDesdeFechaValor ?? 0) > 3 && (
              <span className="ml-1 font-medium text-amber-700">· hace {estado.diasDesdeFechaValor} días</span>
            )}
          </div>
          {estado.proxima && (
            <div className="mt-2 text-xs text-slate-600">
              Próxima: <strong className="cifra">Bs {numero(estado.proxima.valor, 4)}</strong> desde{' '}
              {fecha(estado.proxima.fechaValor)}
            </div>
          )}
        </>
      ) : (
        <div className="mt-2 text-sm text-red-700">No hay tasa registrada</div>
      )}
    </div>
  );
}
