import { FormEvent, useState } from 'react';
import { Aviso, Boton, Campo } from '../componentes/ui';
import { NOMBRE_COMERCIAL, RAZON_SOCIAL } from '../lib/marca';
import { useSesion } from '../lib/sesion';

export function Login() {
  const { iniciar } = useSesion();
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await iniciar(usuario, clave);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-fondo-marca p-4">
      <form
        onSubmit={enviar}
        className="w-full max-w-sm space-y-4 overflow-hidden rounded-2xl bg-white p-6 shadow-xl ring-1 ring-acento/40"
      >
        <img src="/logo.jpg" alt={NOMBRE_COMERCIAL} className="-mx-6 -mt-6 mb-2 w-[calc(100%+3rem)] max-w-none" />
        <div className="text-center">
          <h1 className="text-lg font-semibold text-slate-900">{RAZON_SOCIAL}</h1>
          <p className="text-sm text-slate-500">Sistema de gestión · ingrese con su usuario</p>
        </div>
        <Campo
          etiqueta="Usuario"
          autoComplete="username"
          autoFocus
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
          required
        />
        <Campo
          etiqueta="Clave"
          type="password"
          autoComplete="current-password"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          required
        />
        {error && <Aviso tipo="error">{error}</Aviso>}
        <Boton type="submit" cargando={enviando} className="w-full">
          Entrar
        </Boton>
      </form>
    </div>
  );
}
