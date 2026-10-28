import { Wrench } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Aviso, Boton, Campo } from '../componentes/ui';
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
    <div className="grid min-h-screen place-items-center bg-slate-900 p-4">
      <form onSubmit={enviar} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-marca-600 text-white">
            <Wrench className="size-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Gestión de ferretería</h1>
            <p className="text-sm text-slate-500">Ingrese con su usuario</p>
          </div>
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
