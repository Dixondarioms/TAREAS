import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { useAvisos } from '../componentes/avisos';
import {
  Aviso,
  Boton,
  Campo,
  Cargando,
  Encabezado,
  Insignia,
  Modal,
  Paginador,
  Selector,
  Tabla,
  Tarjeta,
  td,
  th,
} from '../componentes/ui';
import { api } from '../lib/api';
import { aDecimalApi, bs, fecha, numero, sinCeros } from '../lib/formato';
import { useSesion } from '../lib/sesion';
import { Pagina } from '../lib/tipos';
import { Cliente, EstadoCuenta, LISTA_METODOS, MetodoPago, METODOS, PorCobrar, simboloMoneda } from '../lib/ventas';

export function Clientes() {
  const { puede } = useSesion();
  const [pestana, setPestana] = useState<'clientes' | 'porCobrar'>('clientes');
  const [ficha, setFicha] = useState<Cliente | 'nuevo' | null>(null);
  const [cuenta, setCuenta] = useState<number | null>(null);
  return (
    <>
      <Encabezado
        titulo="Clientes"
        descripcion="Datos para la factura, crédito y lo que deben."
        acciones={
          <Boton icono={<Plus className="size-4" />} onClick={() => setFicha('nuevo')}>
            Nuevo cliente
          </Boton>
        }
      />
      {puede('GERENTE') && (
        <div className="mb-4 flex w-fit gap-1 rounded-lg bg-slate-200/70 p-1" role="tablist">
          {(
            [
              ['clientes', 'Clientes'],
              ['porCobrar', 'Cuentas por cobrar'],
            ] as const
          ).map(([valor, texto]) => (
            <button
              key={valor}
              type="button"
              role="tab"
              aria-selected={pestana === valor}
              onClick={() => setPestana(valor)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${pestana === valor ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
            >
              {texto}
            </button>
          ))}
        </div>
      )}
      {pestana === 'clientes' ? (
        <Lista alEditar={setFicha} alVerCuenta={setCuenta} />
      ) : (
        <PorCobrarLista alVerCuenta={setCuenta} />
      )}
      <FichaCliente cliente={ficha} alCerrar={() => setFicha(null)} />
      <ModalEstadoCuenta clienteId={cuenta} alCerrar={() => setCuenta(null)} />
    </>
  );
}

function Lista({ alEditar, alVerCuenta }: { alEditar: (c: Cliente) => void; alVerCuenta: (id: number) => void }) {
  const [texto, setTexto] = useState('');
  const [q, setQ] = useState('');
  const [pagina, setPagina] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(texto);
      setPagina(1);
    }, 300);
    return () => clearTimeout(t);
  }, [texto]);
  const lista = useQuery({
    queryKey: ['clientes', 'lista', q, pagina],
    queryFn: () => api.get<Pagina<Cliente>>('/clientes', { q, pagina, porPagina: 50 }),
    placeholderData: keepPreviousData,
  });
  return (
    <Tarjeta>
      <div className="relative mb-3 max-w-md">
        <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-slate-400" />
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Nombre, cédula o RIF…"
          className="block w-full rounded-lg border-0 py-2 pr-3 pl-9 text-sm ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-marca-500"
          aria-label="Buscar clientes"
        />
      </div>
      {lista.isLoading ? (
        <Cargando />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th className={th}>Cliente</th>
              <th className={th}>Teléfono</th>
              <th className={`${th} text-right`}>Crédito</th>
              <th className={`${th} text-right`}>Debe</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lista.data?.datos.map((c) => (
              <tr key={c.id}>
                <td className={td}>
                  <div className="font-medium text-slate-900">{c.nombre}</div>
                  <div className="text-xs text-slate-500">{c.documento}</div>
                </td>
                <td className={td}>{c.telefono ?? '—'}</td>
                <td className={`${td} cifra text-right`}>
                  {Number(c.limiteCreditoUsd) > 0 ? `$ ${numero(c.limiteCreditoUsd, 2)} · ${c.diasCredito} días` : '—'}
                </td>
                <td className={`${td} cifra text-right font-medium`}>
                  {Number(c.saldoUsd ?? 0) > 0 ? `$ ${numero(c.saldoUsd!, 2)}` : '—'}
                </td>
                <td className={`${td} text-right whitespace-nowrap`}>
                  <Boton variante="fantasma" onClick={() => alEditar(c)}>
                    Editar
                  </Boton>
                  <Boton variante="fantasma" onClick={() => alVerCuenta(c.id)}>
                    Estado de cuenta
                  </Boton>
                </td>
              </tr>
            ))}
            {lista.data?.datos.length === 0 && (
              <tr>
                <td colSpan={5} className={`${td} py-8 text-center text-slate-500`}>
                  No se encontraron clientes.
                </td>
              </tr>
            )}
          </tbody>
        </Tabla>
      )}
      {lista.data && (
        <Paginador pagina={pagina} porPagina={lista.data.porPagina} total={lista.data.total} alCambiar={setPagina} />
      )}
    </Tarjeta>
  );
}

function PorCobrarLista({ alVerCuenta }: { alVerCuenta: (id: number) => void }) {
  const r = useQuery({ queryKey: ['clientes', 'por-cobrar'], queryFn: () => api.get<PorCobrar>('/clientes/por-cobrar') });
  if (r.isLoading) return <Cargando />;
  if (r.error) return <Aviso tipo="error">{r.error.message}</Aviso>;
  const d = r.data!;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">Por cobrar</div>
          <div className="cifra mt-1 text-2xl font-semibold text-slate-900">$ {numero(d.totalUsd, 2)}</div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">Vencido</div>
          <div className={`cifra mt-1 text-2xl font-semibold ${Number(d.vencidoUsd) > 0 ? 'text-red-700' : 'text-slate-900'}`}>
            $ {numero(d.vencidoUsd, 2)}
          </div>
        </div>
      </div>
      <Tarjeta>
        <Tabla>
          <thead>
            <tr>
              <th className={th}>Cliente</th>
              <th className={th}>Teléfono</th>
              <th className={`${th} text-right`}>Debe</th>
              <th className={`${th} text-right`}>Vencido</th>
              <th className={th}>Más atrasada</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {d.clientes.map((c) => (
              <tr key={c.cliente.id} className="cursor-pointer hover:bg-marca-50/60" onClick={() => alVerCuenta(c.cliente.id)}>
                <td className={td}>
                  <div className="font-medium text-slate-900">{c.cliente.nombre}</div>
                  <div className="text-xs text-slate-500">{c.cliente.documento}</div>
                </td>
                <td className={td}>{c.cliente.telefono ?? '—'}</td>
                <td className={`${td} cifra text-right font-medium`}>$ {numero(c.saldoUsd, 2)}</td>
                <td className={`${td} cifra text-right ${Number(c.vencidoUsd) > 0 ? 'text-red-700' : 'text-slate-400'}`}>
                  $ {numero(c.vencidoUsd, 2)}
                </td>
                <td className={td}>
                  <Atraso dias={c.diasVencida} />
                </td>
              </tr>
            ))}
            {d.clientes.length === 0 && (
              <tr>
                <td colSpan={5} className={`${td} py-8 text-center text-slate-500`}>
                  Ningún cliente debe.
                </td>
              </tr>
            )}
          </tbody>
        </Tabla>
      </Tarjeta>
    </div>
  );
}

function Atraso({ dias }: { dias: number }) {
  if (dias > 0) return <Insignia color="rojo">Vencida hace {dias} d</Insignia>;
  if (dias === 0) return <Insignia color="ambar">Vence hoy</Insignia>;
  return <span className="text-xs text-slate-500">vence en {-dias} d</span>;
}

const VACIO = { documento: '', nombre: '', direccion: '', telefono: '', limiteCreditoUsd: '0', diasCredito: '30' };

function FichaCliente({ cliente, alCerrar }: { cliente: Cliente | 'nuevo' | null; alCerrar: () => void }) {
  const { puede } = useSesion();
  const avisos = useAvisos();
  const consultas = useQueryClient();
  const [form, setForm] = useState(VACIO);
  useEffect(() => {
    if (cliente === 'nuevo') setForm(VACIO);
    else if (cliente) {
      setForm({
        documento: cliente.documento,
        nombre: cliente.nombre,
        direccion: cliente.direccion ?? '',
        telefono: cliente.telefono ?? '',
        limiteCreditoUsd: sinCeros(cliente.limiteCreditoUsd),
        diasCredito: String(cliente.diasCredito),
      });
    }
  }, [cliente]);
  const guardar = useMutation({
    mutationFn: () => {
      const cuerpo = {
        documento: form.documento,
        nombre: form.nombre,
        direccion: form.direccion || null,
        telefono: form.telefono || null,
        ...(puede('GERENTE')
          ? { limiteCreditoUsd: aDecimalApi(form.limiteCreditoUsd || '0'), diasCredito: Number(form.diasCredito || 0) }
          : {}),
      };
      return cliente === 'nuevo' ? api.post('/clientes', cuerpo) : api.put(`/clientes/${(cliente as Cliente).id}`, cuerpo);
    },
    onSuccess: () => {
      avisos.exito('Cliente guardado');
      void consultas.invalidateQueries({ queryKey: ['clientes'] });
      alCerrar();
    },
    onError: avisos.error,
  });
  const campo = (k: keyof typeof VACIO) => ({
    value: form[k],
    onChange: (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value }),
  });
  return (
    <Modal titulo={cliente === 'nuevo' ? 'Nuevo cliente' : 'Editar cliente'} abierto={cliente !== null} alCerrar={alCerrar}>
      <form
        className="space-y-3"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          guardar.mutate();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Cédula o RIF" required {...campo('documento')} />
          <Campo etiqueta="Teléfono" {...campo('telefono')} />
        </div>
        <Campo etiqueta="Nombre o razón social" required minLength={2} {...campo('nombre')} />
        <Campo etiqueta="Dirección fiscal" {...campo('direccion')} />
        {puede('GERENTE') ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo
              etiqueta="Límite de crédito (USD)"
              inputMode="decimal"
              ayuda="0 = no compra a crédito"
              {...campo('limiteCreditoUsd')}
            />
            <Campo etiqueta="Días para pagar" inputMode="numeric" {...campo('diasCredito')} />
          </div>
        ) : (
          <p className="text-xs text-slate-500">El crédito lo asigna gerencia.</p>
        )}
        <div className="flex justify-end gap-2">
          <Boton variante="fantasma" onClick={alCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" cargando={guardar.isPending}>
            Guardar
          </Boton>
        </div>
      </form>
    </Modal>
  );
}

export function ModalEstadoCuenta({ clienteId, alCerrar }: { clienteId: number | null; alCerrar: () => void }) {
  const avisos = useAvisos();
  const consultas = useQueryClient();
  const [abono, setAbono] = useState<{ metodo: MetodoPago; monto: string; referencia: string }>({
    metodo: 'EFECTIVO_BS',
    monto: '',
    referencia: '',
  });
  const estado = useQuery({
    queryKey: ['clientes', 'estado', clienteId],
    queryFn: () => api.get<EstadoCuenta>(`/clientes/${clienteId}/estado-cuenta`),
    enabled: clienteId !== null,
  });
  const abonar = useMutation({
    mutationFn: () =>
      api.post<EstadoCuenta>(`/clientes/${clienteId}/abonos`, {
        metodo: abono.metodo,
        monto: aDecimalApi(abono.monto),
        referencia: abono.referencia || undefined,
      }),
    onSuccess: (e) => {
      avisos.exito(`Abono registrado. Ahora debe $ ${numero(e.saldoUsd, 2)}`);
      setAbono({ ...abono, monto: '', referencia: '' });
      void consultas.invalidateQueries({ queryKey: ['clientes'] });
      void consultas.invalidateQueries({ queryKey: ['caja'] });
    },
    onError: avisos.error,
  });
  const e = estado.data;
  return (
    <Modal
      titulo={e ? `Estado de cuenta · ${e.cliente.nombre}` : 'Estado de cuenta'}
      abierto={clienteId !== null}
      alCerrar={alCerrar}
      ancho="max-w-3xl"
    >
      {!e ? (
        <Cargando />
      ) : (
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Dato titulo="Debe" valor={`$ ${numero(e.saldoUsd, 2)}`} />
            <Dato titulo="Vencido" valor={`$ ${numero(e.vencidoUsd, 2)}`} rojo={Number(e.vencidoUsd) > 0} />
            <Dato
              titulo="Límite"
              valor={Number(e.cliente.limiteCreditoUsd) > 0 ? `$ ${numero(e.cliente.limiteCreditoUsd, 2)}` : 'Sin crédito'}
            />
            <Dato titulo="Disponible" valor={`$ ${numero(e.disponibleUsd, 2)}`} />
          </div>

          {Number(e.saldoUsd) > 0 && (
            <form
              className="grid gap-2 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200 sm:grid-cols-[11rem_1fr_1fr_auto] sm:items-end"
              onSubmit={(ev) => {
                ev.preventDefault();
                abonar.mutate();
              }}
            >
              <Selector
                etiqueta="Paga con"
                value={abono.metodo}
                onChange={(ev) => setAbono({ ...abono, metodo: ev.target.value as MetodoPago })}
              >
                {LISTA_METODOS.map((m) => (
                  <option key={m} value={m}>
                    {METODOS[m].nombre}
                  </option>
                ))}
              </Selector>
              <Campo
                etiqueta={`Monto (${simboloMoneda(abono.metodo)})`}
                inputMode="decimal"
                required
                value={abono.monto}
                onChange={(ev) => setAbono({ ...abono, monto: ev.target.value })}
              />
              <Campo
                etiqueta="Referencia"
                required={METODOS[abono.metodo].referencia}
                value={abono.referencia}
                onChange={(ev) => setAbono({ ...abono, referencia: ev.target.value })}
              />
              <Boton type="submit" cargando={abonar.isPending}>
                Registrar abono
              </Boton>
              <p className="text-xs text-slate-500 sm:col-span-4">
                El dinero entra a su caja abierta. Los bolívares se convierten a la tasa BCV de hoy; se paga primero lo que vence
                antes.
              </p>
            </form>
          )}

          <Tabla>
            <thead>
              <tr>
                <th className={th}>Factura</th>
                <th className={th}>Fecha</th>
                <th className={th}>Vence</th>
                <th className={`${th} text-right`}>Monto</th>
                <th className={`${th} text-right`}>Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {e.cuentas.map((c) => (
                <tr key={c.id} className={Number(c.saldoUsd) === 0 ? 'text-slate-400' : undefined}>
                  <td className={`${td} cifra`}>{c.factura}</td>
                  <td className={td}>{fecha(c.fecha)}</td>
                  <td className={td}>
                    {fecha(c.vencimiento)} {Number(c.saldoUsd) > 0 && <Atraso dias={c.diasVencida} />}
                  </td>
                  <td className={`${td} cifra text-right`}>$ {numero(c.montoUsd, 2)}</td>
                  <td className={`${td} cifra text-right font-medium`}>
                    {Number(c.saldoUsd) > 0 ? `$ ${numero(c.saldoUsd, 2)}` : <Insignia color="verde">Pagada</Insignia>}
                  </td>
                </tr>
              ))}
              {e.cuentas.length === 0 && (
                <tr>
                  <td colSpan={5} className={`${td} py-6 text-center text-slate-500`}>
                    No tiene compras a crédito.
                  </td>
                </tr>
              )}
            </tbody>
          </Tabla>

          {e.abonos.length > 0 && (
            <div>
              <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">Abonos</div>
              <ul className="divide-y divide-slate-100">
                {e.abonos.map((a) => (
                  <li key={a.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                    <span>
                      {fecha(a.creadoEn)} ·{' '}
                      {a.metodo === 'NOTA_CREDITO' ? 'Nota de crédito' : (METODOS[a.metodo as MetodoPago]?.nombre ?? a.metodo)}
                      {a.referencia && ` · ref. ${a.referencia}`}
                      {a.usuario && ` · ${a.usuario.nombre}`}
                    </span>
                    <span className="cifra">
                      $ {numero(a.montoUsd, 2)} <span className="text-slate-500">({bs(a.montoBs)})</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function Dato({ titulo, valor, rojo = false }: { titulo: string; valor: string; rojo?: boolean }) {
  return (
    <div>
      <div className="text-xs text-slate-500 uppercase">{titulo}</div>
      <div className={`cifra text-lg font-semibold ${rojo ? 'text-red-700' : 'text-slate-900'}`}>{valor}</div>
    </div>
  );
}
