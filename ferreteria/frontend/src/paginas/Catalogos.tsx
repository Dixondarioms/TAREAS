import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { useAvisos } from '../componentes/avisos';
import {
  Boton,
  Campo,
  Cargando,
  Casilla,
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
import { useCategorias, useListas, useMarcas, useUnidades } from '../lib/consultas';
import { aDecimalApi, porcentaje } from '../lib/formato';
import { useSesion } from '../lib/sesion';
import { Categoria, ListaPrecio, Marca, Unidad } from '../lib/tipos';

type Pestana = 'categorias' | 'marcas' | 'unidades' | 'listas';

export function Catalogos() {
  const { puede } = useSesion();
  const [pestana, setPestana] = useState<Pestana>('categorias');
  const pestanas: { id: Pestana; texto: string; visible: boolean }[] = [
    { id: 'categorias', texto: 'Categorías', visible: true },
    { id: 'marcas', texto: 'Marcas', visible: true },
    { id: 'unidades', texto: 'Unidades de medida', visible: true },
    { id: 'listas', texto: 'Listas de precio', visible: puede('GERENTE') },
  ];
  return (
    <>
      <Encabezado titulo="Categorías, marcas y unidades" />
      <div className="mb-4 flex flex-wrap gap-1 rounded-lg bg-slate-200/70 p-1 text-sm">
        {pestanas
          .filter((p) => p.visible)
          .map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPestana(p.id)}
              className={`rounded-md px-3 py-1.5 font-medium ${pestana === p.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              {p.texto}
            </button>
          ))}
      </div>
      {pestana === 'categorias' && <Categorias />}
      {pestana === 'marcas' && <Marcas />}
      {pestana === 'unidades' && <Unidades />}
      {pestana === 'listas' && <Listas />}
    </>
  );
}

/** Lógica común de crear/editar en un modal. */
function useEdicion<T extends { id: number }>(ruta: string, claveConsulta: string, mensaje: string) {
  const consultas = useQueryClient();
  const avisos = useAvisos();
  const [editando, setEditando] = useState<T | 'nuevo' | null>(null);
  const guardar = useMutation({
    mutationFn: (cuerpo: object) =>
      editando === 'nuevo' ? api.post(ruta, cuerpo) : api.put(`${ruta}/${(editando as T).id}`, cuerpo),
    onSuccess: () => {
      avisos.exito(mensaje);
      setEditando(null);
      void consultas.invalidateQueries({ queryKey: [claveConsulta] });
    },
    onError: avisos.error,
  });
  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`${ruta}/${id}`),
    onSuccess: () => {
      avisos.exito('Eliminado');
      void consultas.invalidateQueries({ queryKey: [claveConsulta] });
    },
    onError: avisos.error,
  });
  return { editando, setEditando, guardar, eliminar };
}

function Categorias() {
  const { puede } = useSesion();
  const categorias = useCategorias();
  const { editando, setEditando, guardar, eliminar } = useEdicion<Categoria>('/categorias', 'categorias', 'Categoría guardada');
  const [nombre, setNombre] = useState('');
  const [padreId, setPadreId] = useState('');
  const abrir = (c: Categoria | 'nuevo') => {
    setEditando(c);
    setNombre(c === 'nuevo' ? '' : c.nombre);
    setPadreId(c === 'nuevo' || !c.padreId ? '' : String(c.padreId));
  };
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    guardar.mutate({ nombre, padreId: padreId ? Number(padreId) : null });
  };
  return (
    <Tarjeta
      titulo="Categorías"
      acciones={
        <Boton icono={<Plus className="size-4" />} onClick={() => abrir('nuevo')}>
          Nueva categoría
        </Boton>
      }
    >
      {categorias.isLoading ? (
        <Cargando />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th className={th}>Categoría</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {categorias.data?.map((c) => (
              <tr key={c.id}>
                <td className={td} style={{ paddingLeft: `${1 + (c.ruta.split(' > ').length - 1) * 1.5}rem` }}>
                  {c.nombre}
                </td>
                <td className={`${td} text-right whitespace-nowrap`}>
                  <Boton variante="fantasma" aria-label="Editar" onClick={() => abrir(c)} icono={<Pencil className="size-4" />} />
                  {puede('GERENTE') && (
                    <Boton
                      variante="fantasma"
                      aria-label="Eliminar"
                      onClick={() => confirm(`¿Eliminar la categoría "${c.nombre}"?`) && eliminar.mutate(c.id)}
                      icono={<Trash2 className="size-4 text-red-600" />}
                    />
                  )}
                </td>
              </tr>
            ))}
            {categorias.data?.length === 0 && (
              <tr>
                <td className={`${td} text-slate-500`}>Aún no hay categorías.</td>
              </tr>
            )}
          </tbody>
        </Tabla>
      )}
      <Modal
        titulo={editando === 'nuevo' ? 'Nueva categoría' : 'Editar categoría'}
        abierto={editando !== null}
        alCerrar={() => setEditando(null)}
        ancho="max-w-md"
      >
        <form onSubmit={enviar} className="space-y-3">
          <Campo
            etiqueta="Nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
            maxLength={100}
            autoFocus
          />
          <Selector etiqueta="Dentro de" value={padreId} onChange={(e) => setPadreId(e.target.value)}>
            <option value="">— Categoría principal —</option>
            {categorias.data
              ?.filter((c) => editando === 'nuevo' || c.id !== editando?.id)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.ruta}
                </option>
              ))}
          </Selector>
          <div className="flex justify-end">
            <Boton type="submit" cargando={guardar.isPending}>
              Guardar
            </Boton>
          </div>
        </form>
      </Modal>
    </Tarjeta>
  );
}

function Marcas() {
  const { puede } = useSesion();
  const marcas = useMarcas();
  const { editando, setEditando, guardar, eliminar } = useEdicion<Marca>('/marcas', 'marcas', 'Marca guardada');
  const [nombre, setNombre] = useState('');
  const abrir = (m: Marca | 'nuevo') => {
    setEditando(m);
    setNombre(m === 'nuevo' ? '' : m.nombre);
  };
  return (
    <Tarjeta
      titulo="Marcas"
      acciones={
        <Boton icono={<Plus className="size-4" />} onClick={() => abrir('nuevo')}>
          Nueva marca
        </Boton>
      }
    >
      {marcas.isLoading ? (
        <Cargando />
      ) : (
        <div className="flex flex-wrap gap-2">
          {marcas.data?.map((m) => (
            <span
              key={m.id}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-50 py-1 pr-1 pl-3 text-sm ring-1 ring-slate-200"
            >
              {m.nombre}
              <Boton
                variante="fantasma"
                className="px-1.5 py-1"
                aria-label={`Editar ${m.nombre}`}
                onClick={() => abrir(m)}
                icono={<Pencil className="size-3.5" />}
              />
              {puede('GERENTE') && (
                <Boton
                  variante="fantasma"
                  className="px-1.5 py-1"
                  aria-label={`Eliminar ${m.nombre}`}
                  onClick={() => confirm(`¿Eliminar la marca "${m.nombre}"?`) && eliminar.mutate(m.id)}
                  icono={<Trash2 className="size-3.5 text-red-600" />}
                />
              )}
            </span>
          ))}
          {marcas.data?.length === 0 && <p className="text-sm text-slate-500">Aún no hay marcas.</p>}
        </div>
      )}
      <Modal
        titulo={editando === 'nuevo' ? 'Nueva marca' : 'Editar marca'}
        abierto={editando !== null}
        alCerrar={() => setEditando(null)}
        ancho="max-w-sm"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            guardar.mutate({ nombre });
          }}
          className="space-y-3"
        >
          <Campo
            etiqueta="Nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
            maxLength={100}
            autoFocus
          />
          <div className="flex justify-end">
            <Boton type="submit" cargando={guardar.isPending}>
              Guardar
            </Boton>
          </div>
        </form>
      </Modal>
    </Tarjeta>
  );
}

function Unidades() {
  const { puede } = useSesion();
  const unidades = useUnidades();
  const { editando, setEditando, guardar } = useEdicion<Unidad>('/unidades', 'unidades', 'Unidad guardada');
  const [form, setForm] = useState({ codigo: '', nombre: '', permiteDecimales: false });
  const abrir = (u: Unidad | 'nuevo') => {
    setEditando(u);
    setForm(
      u === 'nuevo'
        ? { codigo: '', nombre: '', permiteDecimales: false }
        : { codigo: u.codigo, nombre: u.nombre, permiteDecimales: u.permiteDecimales },
    );
  };
  return (
    <Tarjeta
      titulo="Unidades de medida"
      acciones={
        puede('GERENTE') && (
          <Boton icono={<Plus className="size-4" />} onClick={() => abrir('nuevo')}>
            Nueva unidad
          </Boton>
        )
      }
    >
      <Tabla>
        <thead>
          <tr>
            <th className={th}>Código</th>
            <th className={th}>Nombre</th>
            <th className={th}>Venta fraccionada</th>
            <th className={th} />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {unidades.data?.map((u) => (
            <tr key={u.id}>
              <td className={`${td} font-mono`}>{u.codigo}</td>
              <td className={td}>{u.nombre}</td>
              <td className={td}>
                {u.permiteDecimales ? <Insignia color="verde">Sí (1,5 / 0,250…)</Insignia> : <Insignia>No</Insignia>}
              </td>
              <td className={`${td} text-right`}>
                {puede('GERENTE') && (
                  <Boton variante="fantasma" aria-label="Editar" onClick={() => abrir(u)} icono={<Pencil className="size-4" />} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </Tabla>
      <Modal
        titulo={editando === 'nuevo' ? 'Nueva unidad' : 'Editar unidad'}
        abierto={editando !== null}
        alCerrar={() => setEditando(null)}
        ancho="max-w-sm"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            guardar.mutate(form);
          }}
          className="space-y-3"
        >
          <Campo
            etiqueta="Código"
            value={form.codigo}
            onChange={(e) => setForm({ ...form, codigo: e.target.value.toUpperCase() })}
            required
            maxLength={10}
            pattern="[A-Za-z0-9]+"
          />
          <Campo
            etiqueta="Nombre"
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            required
            maxLength={50}
          />
          <Casilla
            etiqueta="Permite vender fracciones"
            checked={form.permiteDecimales}
            onChange={(e) => setForm({ ...form, permiteDecimales: e.target.checked })}
          />
          <div className="flex justify-end">
            <Boton type="submit" cargando={guardar.isPending}>
              Guardar
            </Boton>
          </div>
        </form>
      </Modal>
    </Tarjeta>
  );
}

function Listas() {
  const listas = useListas();
  const { editando, setEditando, guardar } = useEdicion<ListaPrecio>('/listas-precio', 'listas-precio', 'Lista guardada');
  const [form, setForm] = useState({ codigo: '', nombre: '', margenPorDefecto: '', orden: '0', activa: true });
  const abrir = (l: ListaPrecio | 'nuevo') => {
    setEditando(l);
    setForm(
      l === 'nuevo'
        ? { codigo: '', nombre: '', margenPorDefecto: '30', orden: String((listas.data?.length ?? 0) + 1), activa: true }
        : { codigo: l.codigo, nombre: l.nombre, margenPorDefecto: l.margenPorDefecto, orden: String(l.orden), activa: l.activa },
    );
  };
  return (
    <Tarjeta
      titulo="Listas de precio"
      acciones={
        <Boton icono={<Plus className="size-4" />} onClick={() => abrir('nuevo')}>
          Nueva lista
        </Boton>
      }
    >
      <p className="mb-3 text-sm text-slate-500">
        El margen por defecto se aplica a los productos nuevos. La primera lista activa es la que se muestra por defecto.
      </p>
      <Tabla>
        <thead>
          <tr>
            <th className={th}>Orden</th>
            <th className={th}>Código</th>
            <th className={th}>Nombre</th>
            <th className={`${th} text-right`}>Margen por defecto</th>
            <th className={th}>Estado</th>
            <th className={th} />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {listas.data?.map((l) => (
            <tr key={l.id}>
              <td className={td}>{l.orden}</td>
              <td className={`${td} font-mono`}>{l.codigo}</td>
              <td className={td}>{l.nombre}</td>
              <td className={`${td} cifra text-right`}>{porcentaje(l.margenPorDefecto)}</td>
              <td className={td}>{l.activa ? <Insignia color="verde">Activa</Insignia> : <Insignia>Inactiva</Insignia>}</td>
              <td className={`${td} text-right`}>
                <Boton variante="fantasma" aria-label="Editar" onClick={() => abrir(l)} icono={<Pencil className="size-4" />} />
              </td>
            </tr>
          ))}
        </tbody>
      </Tabla>
      <Modal
        titulo={editando === 'nuevo' ? 'Nueva lista de precio' : 'Editar lista'}
        abierto={editando !== null}
        alCerrar={() => setEditando(null)}
        ancho="max-w-md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            guardar.mutate({ ...form, margenPorDefecto: aDecimalApi(form.margenPorDefecto), orden: Number(form.orden) });
          }}
          className="grid grid-cols-2 gap-3"
        >
          <Campo
            etiqueta="Código"
            value={form.codigo}
            onChange={(e) => setForm({ ...form, codigo: e.target.value.toUpperCase() })}
            required
            maxLength={20}
            pattern="[A-Za-z0-9_]+"
          />
          <Campo
            etiqueta="Orden"
            type="number"
            min={0}
            value={form.orden}
            onChange={(e) => setForm({ ...form, orden: e.target.value })}
          />
          <Campo
            contenedor="col-span-2"
            etiqueta="Nombre"
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            required
            maxLength={60}
          />
          <Campo
            etiqueta="Margen por defecto %"
            inputMode="decimal"
            value={form.margenPorDefecto}
            onChange={(e) => setForm({ ...form, margenPorDefecto: e.target.value })}
            required
          />
          <div className="flex items-end pb-2">
            <Casilla etiqueta="Activa" checked={form.activa} onChange={(e) => setForm({ ...form, activa: e.target.checked })} />
          </div>
          {editando === 'nuevo' && (
            <p className="col-span-2 text-xs text-slate-500">
              Todos los productos recibirán un precio en esta lista con el margen indicado.
            </p>
          )}
          <div className="col-span-2 flex justify-end">
            <Boton type="submit" cargando={guardar.isPending}>
              Guardar
            </Boton>
          </div>
        </form>
      </Modal>
    </Tarjeta>
  );
}
