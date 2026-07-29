import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Frontend rozmawia z serwerem wylacznie przez /api/*.
 * Proxy w trybie dev sprawia, ze adres serwera nie pojawia sie w kodzie
 * przegladarki — i ze nie ma problemu z CORS.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
    },
  },
});
