import { ChevronLeft, ChevronRight, LoaderCircle, X } from 'lucide-react';
import {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  useEffect,
  useId,
} from 'react';

const clases = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type Variante = 'primario' | 'secundario' | 'peligro' | 'fantasma';

const ESTILOS_BOTON: Record<Variante, string> = {
  primario: 'bg-marca-600 text-white hover:bg-marca-700 focus-visible:outline-marca-600',
  secundario: 'bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50',
  peligro: 'bg-red-600 text-white hover:bg-red-700',
  fantasma: 'text-slate-600 hover:bg-slate-200/60',
};

export function Boton({
  variante = 'primario',
  cargando,
  icono,
  children,
  className,
  disabled,
  ...resto
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; cargando?: boolean; icono?: ReactNode }) {
  return (
    <button
      type="button"
      {...resto}
      disabled={disabled || cargando}
      className={clases(
        'inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition',
        'focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        ESTILOS_BOTON[variante],
        className,
      )}
    >
      {cargando ? <LoaderCircle className="size-4 animate-spin" /> : icono}
      {children}
    </button>
  );
}

const ESTILO_CAMPO =
  'block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-300 ring-inset placeholder:text-slate-400 focus:ring-2 focus:ring-marca-500 disabled:bg-slate-100';

function Etiquetado({
  etiqueta,
  ayuda,
  error,
  id,
  children,
  className,
}: {
  etiqueta?: string;
  ayuda?: string;
  error?: string;
  id: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {etiqueta && (
        <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
          {etiqueta}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      ) : (
        ayuda && <p className="mt-1 text-xs text-slate-500">{ayuda}</p>
      )}
    </div>
  );
}

type PropsEtiqueta = { etiqueta?: string; ayuda?: string; error?: string; contenedor?: string };

export function Campo({
  etiqueta,
  ayuda,
  error,
  contenedor,
  className,
  ...resto
}: InputHTMLAttributes<HTMLInputElement> & PropsEtiqueta) {
  const id = useId();
  return (
    <Etiquetado etiqueta={etiqueta} ayuda={ayuda} error={error} id={id} className={contenedor}>
      <input id={id} {...resto} className={clases(ESTILO_CAMPO, error && 'ring-red-400', className)} />
    </Etiquetado>
  );
}

export function AreaTexto({
  etiqueta,
  ayuda,
  error,
  contenedor,
  className,
  ...resto
}: TextareaHTMLAttributes<HTMLTextAreaElement> & PropsEtiqueta) {
  const id = useId();
  return (
    <Etiquetado etiqueta={etiqueta} ayuda={ayuda} error={error} id={id} className={contenedor}>
      <textarea id={id} rows={3} {...resto} className={clases(ESTILO_CAMPO, className)} />
    </Etiquetado>
  );
}

export function Selector({
  etiqueta,
  ayuda,
  error,
  contenedor,
  className,
  children,
  ...resto
}: SelectHTMLAttributes<HTMLSelectElement> & PropsEtiqueta) {
  const id = useId();
  return (
    <Etiquetado etiqueta={etiqueta} ayuda={ayuda} error={error} id={id} className={contenedor}>
      <select id={id} {...resto} className={clases(ESTILO_CAMPO, 'pr-8', className)}>
        {children}
      </select>
    </Etiquetado>
  );
}

export function Casilla({ etiqueta, ...resto }: InputHTMLAttributes<HTMLInputElement> & { etiqueta: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" {...resto} className="size-4 rounded border-slate-300 text-marca-600 focus:ring-marca-500" />
      {etiqueta}
    </label>
  );
}

export function Tarjeta({
  titulo,
  acciones,
  children,
  className,
}: {
  titulo?: ReactNode;
  acciones?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={clases('rounded-xl bg-white shadow-sm ring-1 ring-slate-200', className)}>
      {(titulo || acciones) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-800">{titulo}</h2>
          <div className="flex flex-wrap gap-2">{acciones}</div>
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Encabezado({ titulo, descripcion, acciones }: { titulo: string; descripcion?: string; acciones?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{titulo}</h1>
        {descripcion && <p className="mt-0.5 text-sm text-slate-500">{descripcion}</p>}
      </div>
      {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
    </div>
  );
}

const ESTILOS_INSIGNIA = {
  gris: 'bg-slate-100 text-slate-700',
  verde: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  ambar: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  rojo: 'bg-red-50 text-red-700 ring-red-600/20',
  azul: 'bg-sky-50 text-sky-700 ring-sky-600/20',
};

export function Insignia({ color = 'gris', children }: { color?: keyof typeof ESTILOS_INSIGNIA; children: ReactNode }) {
  return (
    <span
      className={clases(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-slate-500/10',
        ESTILOS_INSIGNIA[color],
      )}
    >
      {children}
    </span>
  );
}

export function Aviso({ tipo = 'info', children }: { tipo?: 'info' | 'error' | 'advertencia' | 'exito'; children: ReactNode }) {
  const estilo = {
    info: 'bg-sky-50 text-sky-800 ring-sky-200',
    error: 'bg-red-50 text-red-800 ring-red-200',
    advertencia: 'bg-amber-50 text-amber-900 ring-amber-200',
    exito: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  }[tipo];
  return <div className={clases('rounded-lg px-3 py-2 text-sm ring-1', estilo)}>{children}</div>;
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
      <LoaderCircle className="size-4 animate-spin" /> {texto}
    </div>
  );
}

export function Modal({
  titulo,
  abierto,
  alCerrar,
  children,
  ancho = 'max-w-lg',
}: {
  titulo: string;
  abierto: boolean;
  alCerrar: () => void;
  children: ReactNode;
  ancho?: string;
}) {
  useEffect(() => {
    if (!abierto) return;
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && alCerrar();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [abierto, alCerrar]);
  if (!abierto) return null;
  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center"
      onMouseDown={alCerrar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={clases('w-full rounded-xl bg-white shadow-xl', ancho)}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold text-slate-800">{titulo}</h2>
          <button
            type="button"
            onClick={alCerrar}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Cerrar"
          >
            <X className="size-5" />
          </button>
        </header>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function Paginador({
  pagina,
  porPagina,
  total,
  alCambiar,
}: {
  pagina: number;
  porPagina: number;
  total: number;
  alCambiar: (p: number) => void;
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between gap-2 pt-3 text-sm text-slate-600">
      <span>
        {total.toLocaleString('es-VE')} resultado{total === 1 ? '' : 's'} · página {pagina} de {paginas}
      </span>
      <div className="flex gap-1">
        <Boton
          variante="secundario"
          disabled={pagina <= 1}
          onClick={() => alCambiar(pagina - 1)}
          aria-label="Página anterior"
          icono={<ChevronLeft className="size-4" />}
        />
        <Boton
          variante="secundario"
          disabled={pagina >= paginas}
          onClick={() => alCambiar(pagina + 1)}
          aria-label="Página siguiente"
          icono={<ChevronRight className="size-4" />}
        />
      </div>
    </div>
  );
}

/** Tabla con desplazamiento horizontal en pantallas pequeñas. */
export function Tabla({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">{children}</table>
    </div>
  );
}

export const th = 'px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap';
export const td = 'px-4 py-2 align-top';
