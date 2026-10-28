import { useMutation } from '@tanstack/react-query';
import {
  DollarSign,
  FolderTree,
  House,
  KeyRound,
  LogOut,
  Menu,
  Package,
  Percent,
  Settings,
  Truck,
  Upload,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { FormEvent, ReactNode, useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { api } from '../lib/api';
import { useEstadoTasas } from '../lib/consultas';
import { NOMBRE_ROL, numero } from '../lib/formato';
import { useSesion } from '../lib/sesion';
import { Rol } from '../lib/tipos';
import { useAvisos } from './avisos';
import { Aviso, Boton, Campo, Modal } from './ui';

interface Enlace {
  a: string;
  texto: string;
  icono: ReactNode;
  roles?: Rol[];
}

const ENLACES: Enlace[] = [
  { a: '/', texto: 'Inicio', icono: <House className="size-4" /> },
  { a: '/productos', texto: 'Productos', icono: <Package className="size-4" /> },
  { a: '/catalogos', texto: 'Categorías y marcas', icono: <FolderTree className="size-4" />, roles: ['GERENTE', 'ALMACEN'] },
  { a: '/proveedores', texto: 'Proveedores', icono: <Truck className="size-4" />, roles: ['GERENTE', 'ALMACEN'] },
  { a: '/tasas', texto: 'Tasa de cambio', icono: <DollarSign className="size-4" /> },
  { a: '/precios/ajuste', texto: 'Ajuste de precios', icono: <Percent className="size-4" />, roles: ['GERENTE'] },
  { a: '/importar', texto: 'Importar catálogo', icono: <Upload className="size-4" />, roles: ['GERENTE'] },
  { a: '/usuarios', texto: 'Usuarios', icono: <Users className="size-4" />, roles: ['ADMIN'] },
  { a: '/configuracion', texto: 'Configuración', icono: <Settings className="size-4" />, roles: ['ADMIN'] },
];

export function Marco() {
  const { usuario, cerrar, puede } = useSesion();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [cambiandoClave, setCambiandoClave] = useState(false);
  const tasas = useEstadoTasas();
  const usd = tasas.data?.USD;

  const navegacion = (
    <nav className="flex flex-col gap-0.5 p-3">
      {ENLACES.filter((e) => !e.roles || puede(...e.roles)).map((e) => (
        <NavLink
          key={e.a}
          to={e.a}
          end={e.a === '/'}
          onClick={() => setMenuAbierto(false)}
          className={({ isActive }) =>
            `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
              isActive ? 'bg-marca-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`
          }
        >
          {e.icono}
          {e.texto}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen lg:pl-60">
      {/* Barra lateral */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-60 transform bg-slate-900 transition lg:translate-x-0 ${menuAbierto ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex h-14 items-center justify-between gap-2 border-b border-slate-800 px-4">
          <div className="flex items-center gap-2 font-semibold text-white">
            <span className="grid size-8 place-items-center rounded-lg bg-marca-600">
              <Wrench className="size-4" />
            </span>
            Ferretería
          </div>
          <button className="text-slate-400 lg:hidden" onClick={() => setMenuAbierto(false)} aria-label="Cerrar menú">
            <X className="size-5" />
          </button>
        </div>
        {navegacion}
      </aside>
      {menuAbierto && <div className="fixed inset-0 z-20 bg-slate-900/40 lg:hidden" onClick={() => setMenuAbierto(false)} />}

      {/* Barra superior */}
      <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur">
        <button className="text-slate-600 lg:hidden" onClick={() => setMenuAbierto(true)} aria-label="Abrir menú">
          <Menu className="size-5" />
        </button>
        <NavLink
          to="/tasas"
          className={`flex items-center gap-2 rounded-full px-3 py-1 text-sm ring-1 ${
            !usd?.vigente
              ? 'bg-red-50 text-red-700 ring-red-200'
              : (usd.diasDesdeFechaValor ?? 0) > 3
                ? 'bg-amber-50 text-amber-800 ring-amber-200'
                : 'bg-emerald-50 text-emerald-800 ring-emerald-200'
          }`}
          title="Tasa oficial BCV vigente"
        >
          <DollarSign className="size-4" />
          {usd?.vigente ? (
            <span className="cifra">
              BCV <strong>Bs {numero(usd.vigente.valor, 4)}</strong>
            </span>
          ) : (
            <span>{tasas.isLoading ? 'Tasa…' : 'Sin tasa cargada'}</span>
          )}
        </NavLink>
        <div className="ml-auto flex items-center gap-1">
          <div className="hidden text-right text-sm leading-tight sm:block">
            <div className="font-medium text-slate-800">{usuario?.nombre}</div>
            <div className="text-xs text-slate-500">{usuario && NOMBRE_ROL[usuario.rol]}</div>
          </div>
          <Boton
            variante="fantasma"
            onClick={() => setCambiandoClave(true)}
            title="Cambiar clave"
            aria-label="Cambiar clave"
            icono={<KeyRound className="size-4" />}
          />
          <Boton
            variante="fantasma"
            onClick={cerrar}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
            icono={<LogOut className="size-4" />}
          />
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-4 sm:p-6">
        <Outlet />
      </main>
      <CambiarClave abierto={cambiandoClave} alCerrar={() => setCambiandoClave(false)} />
    </div>
  );
}

function CambiarClave({ abierto, alCerrar }: { abierto: boolean; alCerrar: () => void }) {
  const avisos = useAvisos();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const cambiar = useMutation({
    mutationFn: () => api.put('/auth/clave', { claveActual: actual, claveNueva: nueva }),
    onSuccess: () => {
      avisos.exito('Clave actualizada');
      setActual('');
      setNueva('');
      setRepetir('');
      alCerrar();
    },
  });
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (nueva === repetir) cambiar.mutate();
  };
  return (
    <Modal titulo="Cambiar mi clave" abierto={abierto} alCerrar={alCerrar} ancho="max-w-sm">
      <form onSubmit={enviar} className="space-y-3">
        <Campo
          etiqueta="Clave actual"
          type="password"
          autoComplete="current-password"
          value={actual}
          onChange={(e) => setActual(e.target.value)}
          required
        />
        <Campo
          etiqueta="Clave nueva"
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          required
          ayuda="Mínimo 8 caracteres"
        />
        <Campo
          etiqueta="Repita la clave nueva"
          type="password"
          autoComplete="new-password"
          value={repetir}
          onChange={(e) => setRepetir(e.target.value)}
          required
          error={repetir && nueva !== repetir ? 'Las claves no coinciden' : undefined}
        />
        {cambiar.error && <Aviso tipo="error">{cambiar.error.message}</Aviso>}
        <div className="flex justify-end gap-2 pt-1">
          <Boton variante="secundario" onClick={alCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" cargando={cambiar.isPending}>
            Guardar
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
