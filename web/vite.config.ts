import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Frontend rozmawia z serwerem wylacznie przez /api/*.
 * Proxy w trybie dev sprawia, ze adres serwera nie pojawia sie w kodzie
 * przegladarki — i ze nie ma problemu z CORS.
 */
export default defineConfig({
  plugins: [react()],

  /**
   * Three.js przygotowywany PRZY STARCIE serwera, nie przy pierwszym wejsciu
   * w widok 3D.
   *
   * Widok 3D wczytuje sie leniwie, wiec Vite dowiadywal sie o three.js dopiero
   * w chwili klikniecia. Wtedy musial przemielic biblioteke i po skonczeniu
   * przeladowac cala strone — stad zawieszenie i mrugniecie przy pierwszym
   * wejsciu. Wypisanie zaleznosci tutaj przenosi te prace na start serwera.
   *
   * Wtyczki (`three/addons/...`) trzeba wymienic osobno: to oddzielne punkty
   * wejscia, ktorych Vite nie odgadnie z samego „three".
   */
  optimizeDeps: {
    include: [
      'three',
      'three/addons/controls/OrbitControls.js',
      'three/addons/renderers/CSS2DRenderer.js',
    ],
  },

  server: {
    // Jawnie IPv4. Domyslnie Vite nasluchuje tylko na [::1], wiec adres
    // http://127.0.0.1:5173 nie odpowiadal — a to on najczesciej trafia
    // do paska adresu. Przy tym ustawieniu dzialaja oba zapisy.
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
    },
  },
});
