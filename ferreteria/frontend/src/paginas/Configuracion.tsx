import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useState } from 'react';
import { useAvisos } from '../componentes/avisos';
import { Boton, Campo, Cargando, Casilla, Encabezado, Selector, Tarjeta } from '../componentes/ui';
import { api } from '../lib/api';
import { useConfiguracion } from '../lib/consultas';
import { aDecimalApi } from '../lib/formato';
import { Configuracion as TipoConfiguracion } from '../lib/tipos';

export function Configuracion() {
  const config = useConfiguracion();
  const consultas = useQueryClient();
  const avisos = useAvisos();
  const [form, setForm] = useState<TipoConfiguracion | null>(null);

  useEffect(() => {
    if (config.data) setForm(structuredClone(config.data));
  }, [config.data]);

  const guardar = useMutation({
    mutationFn: () =>
      api.put('/configuracion', {
        ...form,
        redondeoBs: { ...form!.redondeoBs, multiplo: aDecimalApi(form!.redondeoBs.multiplo) },
        alicuotasIva: Object.fromEntries(Object.entries(form!.alicuotasIva).map(([k, v]) => [k, aDecimalApi(v)])),
      }),
    onSuccess: () => {
      avisos.exito('Configuración guardada');
      void consultas.invalidateQueries();
    },
    onError: avisos.error,
  });

  if (!form) return <Cargando />;
  const empresa = (cambios: Partial<TipoConfiguracion['empresa']>) =>
    setForm({ ...form, empresa: { ...form.empresa, ...cambios } });
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    guardar.mutate();
  };

  return (
    <form onSubmit={enviar}>
      <Encabezado
        titulo="Configuración"
        acciones={
          <Boton type="submit" cargando={guardar.isPending}>
            Guardar
          </Boton>
        }
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <Tarjeta titulo="Datos de la empresa">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo
              contenedor="sm:col-span-2"
              etiqueta="Razón social"
              value={form.empresa.razonSocial}
              onChange={(e) => empresa({ razonSocial: e.target.value })}
              required
            />
            <Campo
              etiqueta="RIF"
              placeholder="J-12345678-9"
              value={form.empresa.rif}
              onChange={(e) => empresa({ rif: e.target.value })}
            />
            <Campo etiqueta="Teléfono" value={form.empresa.telefono} onChange={(e) => empresa({ telefono: e.target.value })} />
            <Campo
              contenedor="sm:col-span-2"
              etiqueta="Dirección fiscal"
              value={form.empresa.direccion}
              onChange={(e) => empresa({ direccion: e.target.value })}
            />
            <div className="sm:col-span-2">
              <Casilla
                etiqueta="Contribuyente especial (agente de percepción de IGTF y de retención de IVA)"
                checked={form.empresa.contribuyenteEspecial}
                onChange={(e) => empresa({ contribuyenteEspecial: e.target.checked })}
              />
              <p className="mt-1 text-xs text-slate-500">Se usará en la facturación (fase 4). Confírmelo con su contador.</p>
            </div>
          </div>
        </Tarjeta>
        <div className="space-y-5">
          <Tarjeta titulo="Alícuotas de IVA (%)">
            <div className="grid grid-cols-3 gap-3">
              {(['GENERAL', 'REDUCIDA', 'EXENTO'] as const).map((k) => (
                <Campo
                  key={k}
                  etiqueta={k === 'GENERAL' ? 'General' : k === 'REDUCIDA' ? 'Reducida' : 'Exento'}
                  inputMode="decimal"
                  value={form.alicuotasIva[k]}
                  onChange={(e) => setForm({ ...form, alicuotasIva: { ...form.alicuotasIva, [k]: e.target.value } })}
                  disabled={k === 'EXENTO'}
                />
              ))}
            </div>
          </Tarjeta>
          <Tarjeta titulo="Redondeo de precios en bolívares">
            <div className="grid grid-cols-2 gap-3">
              <Selector
                etiqueta="Redondear a"
                value={
                  ['0.01', '0.1', '0.5', '1', '5', '10'].includes(form.redondeoBs.multiplo) ? form.redondeoBs.multiplo : '0.01'
                }
                onChange={(e) => setForm({ ...form, redondeoBs: { ...form.redondeoBs, multiplo: e.target.value } })}
              >
                <option value="0.01">Céntimo (0,01)</option>
                <option value="0.1">0,10 Bs</option>
                <option value="0.5">0,50 Bs</option>
                <option value="1">1 Bs</option>
                <option value="5">5 Bs</option>
                <option value="10">10 Bs</option>
              </Selector>
              <Selector
                etiqueta="Modo"
                value={form.redondeoBs.modo}
                onChange={(e) =>
                  setForm({ ...form, redondeoBs: { ...form.redondeoBs, modo: e.target.value as 'CERCANO' | 'ARRIBA' } })
                }
              >
                <option value="CERCANO">Al más cercano</option>
                <option value="ARRIBA">Siempre hacia arriba</option>
              </Selector>
            </div>
            <p className="mt-2 text-xs text-slate-500">Aplica al precio en Bs con IVA que se muestra en pantalla y etiquetas.</p>
          </Tarjeta>
        </div>
      </div>
    </form>
  );
}
