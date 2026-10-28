import { useQueryClient } from '@tanstack/react-query';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, registrarExpiracionSesion, token } from './api';
import { Rol, UsuarioSesion } from './tipos';

interface ContextoSesion {
  usuario: UsuarioSesion | null;
  cargando: boolean;
  iniciar: (usuario: string, clave: string) => Promise<void>;
  cerrar: () => void;
  /** ADMIN siempre puede. */
  puede: (...roles: Rol[]) => boolean;
}

const Contexto = createContext<ContextoSesion | null>(null);

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(null);
  const [cargando, setCargando] = useState(Boolean(token.leer()));
  const consultas = useQueryClient();

  const cerrar = useCallback(() => {
    token.guardar(null);
    setUsuario(null);
    consultas.clear();
  }, [consultas]);

  useEffect(() => {
    registrarExpiracionSesion(() => setUsuario(null));
    if (!token.leer()) return;
    api
      .get<UsuarioSesion>('/auth/yo')
      .then(setUsuario)
      .catch(() => token.guardar(null))
      .finally(() => setCargando(false));
  }, []);

  const iniciar = useCallback(async (nombre: string, clave: string) => {
    const r = await api.post<{ token: string; usuario: UsuarioSesion }>('/auth/login', { usuario: nombre, clave });
    token.guardar(r.token);
    setUsuario(r.usuario);
  }, []);

  const valor = useMemo<ContextoSesion>(
    () => ({
      usuario,
      cargando,
      iniciar,
      cerrar,
      puede: (...roles) => Boolean(usuario && (usuario.rol === 'ADMIN' || roles.includes(usuario.rol))),
    }),
    [usuario, cargando, iniciar, cerrar],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSesion() {
  const c = useContext(Contexto);
  if (!c) throw new Error('useSesion debe usarse dentro de ProveedorSesion');
  return c;
}
