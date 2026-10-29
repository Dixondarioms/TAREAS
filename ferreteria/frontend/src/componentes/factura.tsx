import { useConfiguracion } from '../lib/consultas';
import { bs, fecha, numero } from '../lib/formato';
import { RAZON_SOCIAL } from '../lib/marca';
import { METODOS, numeroFactura, simboloMoneda, Venta } from '../lib/ventas';
import { cantidad } from './inventario';
import { Insignia } from './ui';

/**
 * Datos de la factura tal como deben copiarse al talonario. Se imprime con
 * Ctrl+P: la barra lateral y la superior se ocultan al imprimir.
 */
export function ResumenFactura({ venta }: { venta: Venta }) {
  const config = useConfiguracion();
  const empresa = config.data?.empresa;
  const filaTotal = (texto: string, valor: string, fuerte = false) => (
    <div className={`flex justify-between gap-4 ${fuerte ? 'text-base font-semibold text-slate-900' : ''}`}>
      <span>{texto}</span>
      <span className="cifra">{bs(valor)}</span>
    </div>
  );
  return (
    <div className="space-y-4 text-sm text-slate-700">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <div className="font-semibold text-slate-900">{empresa?.razonSocial || RAZON_SOCIAL}</div>
          {empresa?.rif && <div>RIF {empresa.rif}</div>}
          {empresa?.direccion && <div className="text-xs text-slate-500">{empresa.direccion}</div>}
        </div>
        <div className="text-right">
          <div className="text-base font-semibold text-slate-900">
            Factura N° <span className="cifra">{numeroFactura(venta)}</span>
          </div>
          <div>
            N° de control <span className="cifra">{venta.numeroControl}</span>
          </div>
          <div className="text-xs text-slate-500">{fecha(venta.creadoEn)}</div>
          {venta.estado === 'ANULADA' && (
            <div className="mt-1">
              <Insignia color="rojo">ANULADA</Insignia>
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">Cliente</div>
        <div className="font-medium text-slate-900">{venta.clienteNombre}</div>
        {venta.clienteDocumento && <div>{venta.clienteDocumento}</div>}
        {venta.clienteDireccion && <div className="text-xs text-slate-500">{venta.clienteDireccion}</div>}
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs text-slate-500 uppercase">
            <th className="py-1.5 pr-2 font-semibold">Cant.</th>
            <th className="py-1.5 pr-2 font-semibold">Descripción</th>
            <th className="py-1.5 pr-2 text-right font-semibold">Precio Bs</th>
            <th className="py-1.5 text-right font-semibold">Total Bs</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {venta.lineas?.map((l) => (
            <tr key={l.id}>
              <td className="cifra py-1.5 pr-2 whitespace-nowrap">
                {cantidad(l.cantidad)} {l.unidad}
              </td>
              <td className="py-1.5 pr-2">
                {l.descripcion}
                {l.alicuotaIva === 'EXENTO' && <span className="text-slate-500"> (E)</span>}
                {l.alicuotaIva === 'REDUCIDA' && <span className="text-slate-500"> (R)</span>}
                <div className="font-mono text-xs text-slate-400">{l.codigo}</div>
              </td>
              <td className="cifra py-1.5 pr-2 text-right">{numero(l.precioBs, 2)}</td>
              <td className="cifra py-1.5 text-right">{numero(l.subtotalBs, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ml-auto max-w-xs space-y-1">
        {Number(venta.baseExentaBs) > 0 && filaTotal('Exento', venta.baseExentaBs)}
        {Number(venta.baseGeneralBs) > 0 &&
          filaTotal(`Base imponible ${numero(venta.porcentajeGeneral, 0)} %`, venta.baseGeneralBs)}
        {Number(venta.baseGeneralBs) > 0 && filaTotal(`IVA ${numero(venta.porcentajeGeneral, 0)} %`, venta.ivaGeneralBs)}
        {Number(venta.baseReducidaBs) > 0 &&
          filaTotal(`Base imponible ${numero(venta.porcentajeReducida, 0)} %`, venta.baseReducidaBs)}
        {Number(venta.baseReducidaBs) > 0 && filaTotal(`IVA ${numero(venta.porcentajeReducida, 0)} %`, venta.ivaReducidaBs)}
        <div className="border-t border-slate-200 pt-1">{filaTotal('Total factura', venta.totalBs, true)}</div>
        {Number(venta.igtfBs) > 0 && (
          <>
            {filaTotal(`IGTF 3 % (sobre ${bs(venta.baseIgtfBs)} en divisas)`, venta.igtfBs)}
            {filaTotal('Total a pagar', venta.totalPagarBs, true)}
          </>
        )}
        <div className="cifra text-right text-xs text-slate-500">
          Equivale a $ {numero(venta.totalPagarUsd, 2)} a la tasa BCV de Bs {numero(venta.tasa, 4)}
        </div>
      </div>

      {venta.pagos && venta.pagos.length > 0 && (
        <div className="border-t border-slate-200 pt-3">
          <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">Pagos</div>
          <ul className="mt-1 space-y-0.5">
            {venta.pagos.map((p) => (
              <li key={p.id} className="flex justify-between gap-4">
                <span>
                  {METODOS[p.metodo].nombre}
                  {p.referencia && <span className="text-slate-500"> · ref. {p.referencia}</span>}
                </span>
                <span className="cifra">
                  {simboloMoneda(p.metodo)} {numero(p.monto, 2)}
                  {METODOS[p.metodo].moneda === 'USD' && <span className="text-slate-500"> ({bs(p.montoBs)})</span>}
                </span>
              </li>
            ))}
            {venta.vueltoMetodo && (
              <li className="flex justify-between gap-4 font-medium text-slate-900">
                <span>Vuelto ({METODOS[venta.vueltoMetodo].nombre})</span>
                <span className="cifra">
                  {simboloMoneda(venta.vueltoMetodo)} {numero(venta.vueltoMonto, 2)}
                </span>
              </li>
            )}
          </ul>
        </div>
      )}

      {venta.estado === 'ANULADA' && (
        <p className="text-xs text-red-700">
          Anulada {fecha(venta.anuladaEn)}
          {venta.anuladaPor && ` por ${venta.anuladaPor.nombre}`}: {venta.motivoAnulacion}
        </p>
      )}
    </div>
  );
}
