import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { ProveedorAvisos } from './componentes/avisos';
import './index.css';
import { ErrorApi } from './lib/api';
import { ProveedorSesion } from './lib/sesion';

const consultas = new QueryClient({
  defaultOptions: {
    queries: {
      // No reintenta errores de permisos o validación; sí los de red.
      retry: (intentos, error) => intentos < 2 && (!(error instanceof ErrorApi) || error.estado === 0 || error.estado >= 500),
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={consultas}>
      <BrowserRouter>
        <ProveedorAvisos>
          <ProveedorSesion>
            <App />
          </ProveedorSesion>
        </ProveedorAvisos>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
