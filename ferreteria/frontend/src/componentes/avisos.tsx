import { CircleCheck, CircleX } from 'lucide-react';
import { createContext, ReactNode, useCallback, useContext, useState } from 'react';

interface Notificacion {
  id: number;
  tipo: 'exito' | 'error';
  texto: string;
}

const Contexto = createContext<(tipo: Notificacion['tipo'], texto: string) => void>(() => {});

let siguienteId = 1;

/** Notificaciones breves en la esquina ("Producto guardado"). */
export function ProveedorAvisos({ children }: { children: ReactNode }) {
  const [lista, setLista] = useState<Notificacion[]>([]);
  const notificar = useCallback((tipo: Notificacion['tipo'], texto: string) => {
    const id = siguienteId++;
    setLista((l) => [...l, { id, tipo, texto }]);
    setTimeout(() => setLista((l) => l.filter((n) => n.id !== id)), tipo === 'error' ? 7000 : 3500);
  }, []);
  return (
    <Contexto.Provider value={notificar}>
      {children}
      <div
        className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
        aria-live="polite"
      >
        {lista.map((n) => (
          <div
            key={n.id}
            className="pointer-events-auto flex items-start gap-2 rounded-lg bg-white p-3 text-sm shadow-lg ring-1 ring-slate-200"
          >
            {n.tipo === 'exito' ? (
              <CircleCheck className="size-5 shrink-0 text-emerald-600" />
            ) : (
              <CircleX className="size-5 shrink-0 text-red-600" />
            )}
            <span>{n.texto}</span>
          </div>
        ))}
      </div>
    </Contexto.Provider>
  );
}

export function useAvisos() {
  const notificar = useContext(Contexto);
  return {
    exito: (texto: string) => notificar('exito', texto),
    error: (e: unknown) => notificar('error', e instanceof Error ? e.message : String(e)),
  };
}
