import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { useAvisos } from '../componentes/avisos';
import {
  AreaTexto,
  Boton,
  Campo,
  Cargando,
  Casilla,
  Encabezado,
  Insignia,
  Modal,
  Paginador,
  Tabla,
  Tarjeta,
  td,
  th,
} from '../componentes/ui';
import { api } from '../lib/api';
import { Pagina, Proveedor } from '../lib/tipos';

const VACIO = { rif: '', razonSocial: '', contacto: '', telefono: '', correo: '', direccion: '', notas: '', activo: true };

export function Proveedores() {
  const consultas = useQueryClient();
  const avisos = useAvisos();
  const [texto, setTexto] = useState('');
  const [q, setQ] = useState('');
  const [pagina, setPagina] = useState(1);
  const [editando, setEditando] = useState<Proveedor | 'nuevo' | null>(null);
  const [form, setForm] = useState(VACIO);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(texto);
      setPagina(1);
    }, 300);
    return () => clearTimeout(t);
  }, [texto]);

  const lista = useQuery({
    queryKey: ['proveedores', q, pagina],
    queryFn: () => api.get<Pagina<Proveedor>>('/proveedores', { q, pagina, porPagina: 50 }),
    placeholderData: keepPreviousData,
  });

  const guardar = useMutation({
    mutationFn: () => {
      const cuerpo = { ...form, correo: form.correo || null };
      return editando === 'nuevo'
        ? api.post('/proveedores', cuerpo)
        : api.put(`/proveedores/${(editando as Proveedor).id}`, cuerpo);
    },
    onSuccess: () => {
      avisos.exito('Proveedor guardado');
      setEditando(null);
      void consultas.invalidateQueries({ queryKey: ['proveedores'] });
    },
    onError: avisos.error,
  });

  const abrir = (p: Proveedor | 'nuevo') => {
    setEditando(p);
    setForm(
      p === 'nuevo'
        ? VACIO
        : {
            rif: p.rif,
            razonSocial: p.razonSocial,
            contacto: p.contacto ?? '',
            telefono: p.telefono ?? '',
            correo: p.correo ?? '',
            direccion: p.direccion ?? '',
            notas: p.notas ?? '',
            activo: p.activo,
          },
    );
  };
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    guardar.mutate();
  };
  const campo = (k: keyof typeof VACIO) => ({
    value: form[k] as string,
    onChange: (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value }),
  });

  return (
    <>
      <Encabezado
        titulo="Proveedores"
        acciones={
          <Boton icono={<Plus className="size-4" />} onClick={() => abrir('nuevo')}>
            Nuevo proveedor
          </Boton>
        }
      />
      <Tarjeta>
        <div className="relative mb-3 max-w-md">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-slate-400" />
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar por razón social o RIF…"
            className="block w-full rounded-lg border-0 py-2 pr-3 pl-9 text-sm ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-marca-500"
            aria-label="Buscar proveedores"
          />
        </div>
        {lista.isLoading ? (
          <Cargando />
        ) : (
          <Tabla>
            <thead>
              <tr>
                <th className={th}>RIF</th>
                <th className={th}>Razón social</th>
                <th className={th}>Contacto</th>
                <th className={th}>Teléfono</th>
                <th className={th}>Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lista.data?.datos.map((p) => (
                <tr key={p.id} className="cursor-pointer hover:bg-marca-50/60" onClick={() => abrir(p)}>
                  <td className={`${td} font-mono text-xs whitespace-nowrap`}>{p.rif}</td>
                  <td className={`${td} font-medium`}>{p.razonSocial}</td>
                  <td className={td}>{p.contacto ?? '—'}</td>
                  <td className={td}>{p.telefono ?? '—'}</td>
                  <td className={td}>{p.activo ? <Insignia color="verde">Activo</Insignia> : <Insignia>Inactivo</Insignia>}</td>
                </tr>
              ))}
              {lista.data?.datos.length === 0 && (
                <tr>
                  <td colSpan={5} className={`${td} py-6 text-center text-slate-500`}>
                    No hay proveedores.
                  </td>
                </tr>
              )}
            </tbody>
          </Tabla>
        )}
        {lista.data && (
          <Paginador pagina={lista.data.pagina} porPagina={lista.data.porPagina} total={lista.data.total} alCambiar={setPagina} />
        )}
      </Tarjeta>

      <Modal
        titulo={editando === 'nuevo' ? 'Nuevo proveedor' : 'Editar proveedor'}
        abierto={editando !== null}
        alCerrar={() => setEditando(null)}
      >
        <form onSubmit={enviar} className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="RIF" placeholder="J-12345678-9" required {...campo('rif')} ayuda="Se valida el dígito verificador." />
          <Campo etiqueta="Teléfono" {...campo('telefono')} maxLength={60} />
          <Campo contenedor="sm:col-span-2" etiqueta="Razón social" required maxLength={150} {...campo('razonSocial')} />
          <Campo etiqueta="Persona de contacto" maxLength={100} {...campo('contacto')} />
          <Campo etiqueta="Correo" type="email" maxLength={120} {...campo('correo')} />
          <AreaTexto contenedor="sm:col-span-2" etiqueta="Dirección" maxLength={500} {...campo('direccion')} />
          <AreaTexto contenedor="sm:col-span-2" etiqueta="Notas" maxLength={2000} {...campo('notas')} />
          <Casilla etiqueta="Activo" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} />
          <div className="flex justify-end sm:col-span-2">
            <Boton type="submit" cargando={guardar.isPending}>
              Guardar
            </Boton>
          </div>
        </form>
      </Modal>
    </>
  );
}
