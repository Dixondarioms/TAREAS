import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // En desarrollo, /api se reenvía a la API local.
    proxy: { '/api': process.env.API_URL ?? 'http://localhost:3000' },
  },
});
