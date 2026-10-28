import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { useAvisos } from '../componentes/avisos';
import { Aviso, Boton, Campo, Encabezado, Selector, Tabla, Tarjeta, td, th } from '../componentes/ui';
import { api } from '../lib/api';
import { useCategorias, useListas, useMarcas } from '../lib/consultas';
import { aDecimalApi, usd } from '../lib/formato';
import { Pagina, Proveedor, ResultadoAjuste } from '../lib/tipos';

export function AjustePrecios() {
  const avisos = useAvisos();
  const consultas = useQueryClient();
  const categorias = useCategorias();
  const marcas = useMarcas();
  const listas = useListas();
  const proveedores = useQuery({
    queryKey: ['proveedores', 'todos'],
    queryFn: () => api.get<Pagina<Proveedor>>('/proveedores', { porPagina: 200 }),
  });

  const [proveedorId, setProveedorId] = useState('');
  const [marcaId, setMarcaId] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [objetivo, setObjetivo] = useState<'COSTO' | 'PRECIO'>('COSTO');
  const [listaId, setListaId] = useState('');
  const [pct, setPct] = useState('');
  const [motivo, setMotivo] = useState('');
  const [vista, setVista] = useState<ResultadoAjuste | null>(null);

  const cuerpo = (simular: boolean) => ({
    filtro: {
      proveedorId: proveedorId ? Number(proveedorId) : undefined,
      marcaId: marcaId ? Number(marcaId) : undefined,
      categoriaId: categoriaId ? Number(categoriaId) : undefined,
    },
    objetivo,
    porcentaje: aDecimalApi(pct),
    listaId: objetivo === 'PRECIO' && listaId ? Number(listaId) : undefined,
    motivo: motivo || undefined,
    simular,
  });

  const simular = useMutation({
    mutationFn: () => api.post<ResultadoAjuste>('/precios/ajuste-masivo', cuerpo(true)),
    onSuccess: setVista,
    onError: avisos.error,
  });
  const aplicar = useMutation({
    mutationFn: () => api.post<ResultadoAjuste>('/precios/ajuste-masivo', cuerpo(false)),
    onSuccess: (r) => {
      avisos.exito(`Ajuste aplicado a ${r.productosAfectados} productos`);
      setVista(null);
      void consultas.invalidateQueries({ queryKey: ['productos'] });
    },
    onError: avisos.error,
  });

  const sinFiltro = !proveedorId && !marcaId && !categoriaId;
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    simular.mutate();
  };
  // Cualquier cambio en el formulario invalida la vista previa.
  const conReinicio =
    <T,>(fn: (v: T) => void) =>
    (v: T) => {
      fn(v);
      setVista(null);
    };

  return (
    <>
      <Encabezado
        titulo="Ajuste masivo de precios"
        descripcion="Útil cuando un proveedor actualiza su lista: suba o baje costos o precios por porcentaje."
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <Tarjeta titulo="1. ¿Qué productos?">
          <form id="ajuste" onSubmit={enviar} className="space-y-3">
            <Selector etiqueta="Proveedor" value={proveedorId} onChange={(e) => conReinicio(setProveedorId)(e.target.value)}>
              <option value="">— Cualquiera —</option>
              {proveedores.data?.datos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.razonSocial}
                </option>
              ))}
            </Selector>
            <Selector etiqueta="Marca" value={marcaId} onChange={(e) => conReinicio(setMarcaId)(e.target.value)}>
              <option value="">— Cualquiera —</option>
              {marcas.data?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </Selector>
            <Selector
              etiqueta="Categoría (incluye subcategorías)"
              value={categoriaId}
              onChange={(e) => conReinicio(setCategoriaId)(e.target.value)}
            >
              <option value="">— Cualquiera —</option>
              {categorias.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.ruta}
                </option>
              ))}
            </Selector>
            {sinFiltro && <Aviso tipo="info">Elija al menos un filtro.</Aviso>}
          </form>
        </Tarjeta>

        <Tarjeta titulo="2. ¿Qué ajuste?">
          <div className="space-y-3">
            <Selector
              etiqueta="Ajustar"
              value={objetivo}
              onChange={(e) => conReinicio(setObjetivo)(e.target.value as 'COSTO' | 'PRECIO')}
              form="ajuste"
            >
              <option value="COSTO">Costo</option>
              <option value="PRECIO">Precio de venta</option>
            </Selector>
            <p className="-mt-1 text-xs text-slate-500">
              {objetivo === 'COSTO'
                ? 'Cambia el costo; los precios por margen se recalculan y los fijos se mantienen.'
                : 'Cambia directamente el precio de venta de la lista elegida.'}
            </p>
            {objetivo === 'PRECIO' && (
              <Selector etiqueta="Lista de precios" value={listaId} onChange={(e) => conReinicio(setListaId)(e.target.value)}>
                <option value="">Todas las listas</option>
                {listas.data?.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nombre}
                  </option>
                ))}
              </Selector>
            )}
            <Campo
              etiqueta="Porcentaje"
              inputMode="decimal"
              placeholder="Ej. 8 para subir, -5 para bajar"
              value={pct}
              onChange={(e) => conReinicio(setPct)(e.target.value)}
              required
              form="ajuste"
            />
            <Campo
              etiqueta="Motivo (queda en el historial)"
              placeholder="Lista de precios proveedor octubre"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={200}
            />
          </div>
        </Tarjeta>

        <Tarjeta titulo="3. Revisar y aplicar">
          <div className="space-y-3">
            <Boton
              type="submit"
              form="ajuste"
              variante="secundario"
              className="w-full"
              disabled={sinFiltro || !pct}
              cargando={simular.isPending}
            >
              Ver vista previa
            </Boton>
            {vista && (
              <>
                <Aviso tipo={vista.productosAfectados ? 'advertencia' : 'info'}>
                  {vista.productosAfectados
                    ? `Se modificarán ${vista.productosAfectados} productos.`
                    : 'Ningún producto coincide con el filtro.'}
                </Aviso>
                <Boton
                  className="w-full"
                  disabled={!vista.productosAfectados}
                  cargando={aplicar.isPending}
                  onClick={() => confirm(`¿Aplicar ${pct}% a ${vista.productosAfectados} productos?`) && aplicar.mutate()}
                >
                  Aplicar ajuste
                </Boton>
              </>
            )}
          </div>
        </Tarjeta>
      </div>

      {vista && vista.muestra.length > 0 && (
        <Tarjeta
          titulo={`Vista previa${vista.productosAfectados > vista.muestra.length ? ` (primeros ${vista.muestra.length})` : ''}`}
          className="mt-5"
        >
          <Tabla>
            <thead>
              <tr>
                <th className={th}>Código</th>
                <th className={th}>Descripción</th>
                <th className={`${th} text-right`}>Costo actual</th>
                <th className={`${th} text-right`}>Costo nuevo</th>
                <th className={`${th} text-right`}>{vista.listaMuestra?.nombre}: actual</th>
                <th className={`${th} text-right`}>{vista.listaMuestra?.nombre}: nuevo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {vista.muestra.map((m) => (
                <tr key={m.productoId}>
                  <td className={`${td} font-mono text-xs`}>{m.codigo}</td>
                  <td className={td}>{m.descripcion}</td>
                  <td className={`${td} cifra text-right text-slate-500`}>{usd(m.costoAnterior)}</td>
                  <td className={`${td} cifra text-right font-medium`}>{usd(m.costoNuevo)}</td>
                  <td className={`${td} cifra text-right text-slate-500`}>{usd(m.precioAnterior)}</td>
                  <td className={`${td} cifra text-right font-medium`}>{usd(m.precioNuevo)}</td>
                </tr>
              ))}
            </tbody>
          </Tabla>
          <p className="mt-2 text-xs text-slate-500">Precios en USD sin IVA.</p>
        </Tarjeta>
      )}
    </>
  );
}
