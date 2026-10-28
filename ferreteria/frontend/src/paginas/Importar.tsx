import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, FileSpreadsheet } from 'lucide-react';
import { useRef, useState } from 'react';
import { useAvisos } from '../componentes/avisos';
import { Aviso, Boton, Encabezado, Tabla, Tarjeta, td, th } from '../componentes/ui';
import { api, descargar } from '../lib/api';
import { ResultadoImportacion } from '../lib/tipos';

export function Importar() {
  const avisos = useAvisos();
  const consultas = useQueryClient();
  const entrada = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);

  const enviar = useMutation({
    mutationFn: (simular: boolean) => {
      const datos = new FormData();
      datos.append('archivo', archivo!);
      return api.post<ResultadoImportacion>('/productos/importacion', datos, { simular });
    },
    onSuccess: (r) => {
      setResultado(r);
      if (!r.simulado) {
        avisos.exito(`Importación completada: ${r.creados} nuevos, ${r.actualizados} actualizados`);
        void consultas.invalidateQueries();
      }
    },
    onError: avisos.error,
  });

  return (
    <>
      <Encabezado
        titulo="Importar catálogo"
        descripcion="Cargue o actualice productos en lote desde Excel (.xlsx) o CSV. Los productos se identifican por su código."
        acciones={
          <Boton
            variante="secundario"
            icono={<Download className="size-4" />}
            onClick={() => descargar('/productos/importacion/plantilla', 'plantilla-productos.xlsx').catch(avisos.error)}
          >
            Descargar plantilla
          </Boton>
        }
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <Tarjeta titulo="Archivo">
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => entrada.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 p-6 text-sm text-slate-600 hover:border-marca-500 hover:bg-marca-50"
            >
              <FileSpreadsheet className="size-8 text-slate-400" />
              {archivo ? <strong className="break-all">{archivo.name}</strong> : 'Seleccionar archivo .xlsx o .csv'}
            </button>
            <input
              ref={entrada}
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              onChange={(e) => {
                setArchivo(e.target.files?.[0] ?? null);
                setResultado(null);
              }}
            />
            <Boton
              variante="secundario"
              className="w-full"
              disabled={!archivo}
              cargando={enviar.isPending && enviar.variables}
              onClick={() => enviar.mutate(true)}
            >
              1. Revisar (sin guardar)
            </Boton>
            <Boton
              className="w-full"
              disabled={!archivo || !resultado?.simulado}
              cargando={enviar.isPending && !enviar.variables}
              onClick={() => enviar.mutate(false)}
            >
              2. Importar
            </Boton>
            <p className="text-xs text-slate-500">
              Primero revise el archivo; las filas con errores se omiten y el resto se importa.
            </p>
          </div>
        </Tarjeta>
        <div className="lg:col-span-2">
          {resultado ? (
            <Tarjeta titulo={resultado.simulado ? 'Resultado de la revisión' : 'Importación terminada'}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Cifra texto="Filas leídas" valor={resultado.filasLeidas} />
                <Cifra texto="Nuevos" valor={resultado.creados} />
                <Cifra texto="Actualizados" valor={resultado.actualizados} />
                <Cifra texto="Con errores" valor={resultado.errores.length} alerta={resultado.errores.length > 0} />
              </div>
              {(resultado.categoriasCreadas > 0 || resultado.marcasCreadas > 0) && (
                <p className="mt-3 text-sm text-slate-600">
                  Se {resultado.simulado ? 'crearán' : 'crearon'} {resultado.categoriasCreadas} categorías y{' '}
                  {resultado.marcasCreadas} marcas nuevas.
                </p>
              )}
              {resultado.errores.length > 0 && (
                <div className="mt-4">
                  <Tabla>
                    <thead>
                      <tr>
                        <th className={th}>Fila</th>
                        <th className={th}>Código</th>
                        <th className={th}>Problema</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {resultado.errores.map((e) => (
                        <tr key={e.fila}>
                          <td className={td}>{e.fila}</td>
                          <td className={`${td} font-mono text-xs`}>{e.codigo ?? '—'}</td>
                          <td className={`${td} text-red-700`}>{e.mensaje}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Tabla>
                </div>
              )}
              {resultado.simulado && (
                <div className="mt-4">
                  <Aviso tipo="info">Nada se ha guardado todavía. Si está conforme, pulse «Importar».</Aviso>
                </div>
              )}
            </Tarjeta>
          ) : (
            <Tarjeta titulo="Formato esperado">
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
                <li>
                  Columnas obligatorias: <code>codigo</code> y, para productos nuevos, <code>descripcion</code>.
                </li>
                <li>
                  Opcionales: <code>categoria</code> (use «Padre &gt; Hija»), <code>marca</code>, <code>unidad</code>,{' '}
                  <code>costo_usd</code>, <code>iva</code>, <code>codigo_barras</code> (varios separados por «|»),{' '}
                  <code>stock_minimo</code>, <code>ubicacion</code>, <code>proveedor_rif</code>, <code>codigo_proveedor</code>.
                </li>
                <li>
                  Existencia inicial: <code>existencia</code> (cantidad contada). Si difiere de la del sistema, la diferencia
                  queda como ajuste de conteo en el kardex del producto.
                </li>
                <li>
                  Precios por lista: <code>margen_publico</code> o <code>precio_publico</code> (y igual para las demás listas).
                </li>
                <li>Los números pueden escribirse como 1.234,56 o 1234.56.</li>
                <li>En productos existentes solo se actualizan las columnas que tienen valor.</li>
              </ul>
            </Tarjeta>
          )}
        </div>
      </div>
    </>
  );
}

function Cifra({ texto, valor, alerta }: { texto: string; valor: number; alerta?: boolean }) {
  return (
    <div className={`rounded-lg p-3 ring-1 ${alerta ? 'bg-red-50 ring-red-200' : 'bg-slate-50 ring-slate-200'}`}>
      <div className="cifra text-2xl font-semibold">{valor.toLocaleString('es-VE')}</div>
      <div className="text-xs text-slate-500">{texto}</div>
    </div>
  );
}
