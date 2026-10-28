import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
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
import { fecha, NOMBRE_ROL } from '../lib/formato';
import { Rol, Usuario } from '../lib/tipos';

const DESCRIPCION_ROL: Record<Rol, string> = {
  ADMIN: 'Acceso total, incluidos usuarios y configuración.',
  GERENTE: 'Costos, precios, tasas, proveedores e importaciones.',
  ALMACEN: 'Productos y proveedores; ve costos pero no los modifica.',
  CAJERO: 'Consulta de productos y precios; no ve costos.',
};

export function Usuarios() {
  const consultas = useQueryClient();
  const avisos = useAvisos();
  const usuarios = useQuery({ queryKey: ['usuarios'], queryFn: () => api.get<Usuario[]>('/usuarios') });
  const [editando, setEditando] = useState<Usuario | 'nuevo' | null>(null);
  const [form, setForm] = useState({ usuario: '', nombre: '', clave: '', rol: 'CAJERO' as Rol, activo: true });

  const abrir = (u: Usuario | 'nuevo') => {
    setEditando(u);
    setForm(
      u === 'nuevo'
        ? { usuario: '', nombre: '', clave: '', rol: 'CAJERO', activo: true }
        : { usuario: u.usuario, nombre: u.nombre, clave: '', rol: u.rol, activo: u.activo },
    );
  };
  const guardar = useMutation({
    mutationFn: () =>
      editando === 'nuevo'
        ? api.post('/usuarios', { usuario: form.usuario, nombre: form.nombre, clave: form.clave, rol: form.rol })
        : api.put(`/usuarios/${(editando as Usuario).id}`, {
            nombre: form.nombre,
            rol: form.rol,
            activo: form.activo,
            ...(form.clave ? { clave: form.clave } : {}),
          }),
    onSuccess: () => {
      avisos.exito('Usuario guardado');
      setEditando(null);
      void consultas.invalidateQueries({ queryKey: ['usuarios'] });
    },
    onError: avisos.error,
  });
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    guardar.mutate();
  };

  return (
    <>
      <Encabezado
        titulo="Usuarios"
        acciones={
          <Boton icono={<Plus className="size-4" />} onClick={() => abrir('nuevo')}>
            Nuevo usuario
          </Boton>
        }
      />
      <Tarjeta>
        {usuarios.isLoading ? (
          <Cargando />
        ) : (
          <Tabla>
            <thead>
              <tr>
                <th className={th}>Usuario</th>
                <th className={th}>Nombre</th>
                <th className={th}>Rol</th>
                <th className={th}>Último acceso</th>
                <th className={th}>Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {usuarios.data?.map((u) => (
                <tr key={u.id} className="cursor-pointer hover:bg-marca-50/60" onClick={() => abrir(u)}>
                  <td className={`${td} font-mono`}>{u.usuario}</td>
                  <td className={td}>{u.nombre}</td>
                  <td className={td}>{NOMBRE_ROL[u.rol]}</td>
                  <td className={`${td} text-slate-500`}>{fecha(u.ultimoAcceso)}</td>
                  <td className={td}>
                    {u.activo ? <Insignia color="verde">Activo</Insignia> : <Insignia color="rojo">Inactivo</Insignia>}
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Tarjeta>
      <Modal
        titulo={editando === 'nuevo' ? 'Nuevo usuario' : 'Editar usuario'}
        abierto={editando !== null}
        alCerrar={() => setEditando(null)}
        ancho="max-w-md"
      >
        <form onSubmit={enviar} className="space-y-3">
          <Campo
            etiqueta="Usuario"
            value={form.usuario}
            onChange={(e) => setForm({ ...form, usuario: e.target.value.toLowerCase() })}
            required
            disabled={editando !== 'nuevo'}
            pattern="[a-z0-9._\-]{3,40}"
            autoComplete="off"
          />
          <Campo
            etiqueta="Nombre"
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            required
            maxLength={100}
          />
          <Selector
            etiqueta="Rol"
            value={form.rol}
            onChange={(e) => setForm({ ...form, rol: e.target.value as Rol })}
            ayuda={DESCRIPCION_ROL[form.rol]}
          >
            {(Object.keys(NOMBRE_ROL) as Rol[]).map((r) => (
              <option key={r} value={r}>
                {NOMBRE_ROL[r]}
              </option>
            ))}
          </Selector>
          <Campo
            etiqueta={editando === 'nuevo' ? 'Clave' : 'Nueva clave (opcional)'}
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={form.clave}
            onChange={(e) => setForm({ ...form, clave: e.target.value })}
            required={editando === 'nuevo'}
            ayuda="Mínimo 8 caracteres"
          />
          {editando !== 'nuevo' && (
            <Casilla etiqueta="Activo" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} />
          )}
          <div className="flex justify-end">
            <Boton type="submit" cargando={guardar.isPending}>
              Guardar
            </Boton>
          </div>
        </form>
      </Modal>
    </>
  );
}
