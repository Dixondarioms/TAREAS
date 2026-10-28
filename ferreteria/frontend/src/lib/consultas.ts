import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { Categoria, Configuracion, EstadoTasas, ListaPrecio, Marca, Unidad } from './tipos';

const CINCO_MINUTOS = 5 * 60 * 1000;

export const useUnidades = () =>
  useQuery({ queryKey: ['unidades'], queryFn: () => api.get<Unidad[]>('/unidades'), staleTime: CINCO_MINUTOS });
export const useCategorias = () =>
  useQuery({ queryKey: ['categorias'], queryFn: () => api.get<Categoria[]>('/categorias'), staleTime: CINCO_MINUTOS });
export const useMarcas = () =>
  useQuery({ queryKey: ['marcas'], queryFn: () => api.get<Marca[]>('/marcas'), staleTime: CINCO_MINUTOS });
export const useListas = () =>
  useQuery({ queryKey: ['listas-precio'], queryFn: () => api.get<ListaPrecio[]>('/listas-precio'), staleTime: CINCO_MINUTOS });
export const useConfiguracion = () =>
  useQuery({ queryKey: ['configuracion'], queryFn: () => api.get<Configuracion>('/configuracion'), staleTime: CINCO_MINUTOS });

/** Se refresca cada 10 minutos para notar la tasa nueva del día sin recargar. */
export const useEstadoTasas = () =>
  useQuery({
    queryKey: ['tasas', 'estado'],
    queryFn: () => api.get<EstadoTasas>('/tasas/estado'),
    refetchInterval: 10 * 60 * 1000,
  });
