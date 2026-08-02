import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Frontend rozmawia z serwerem wylacznie przez /api/*.
 * Proxy w trybie dev sprawia, ze adres serwera nie pojawia sie w kodzie
 * przegladarki — i ze nie ma problemu z CORS.
 */
export default defineConfig({
  /**
   * Podkatalog, w ktorym stoi aplikacja.
   *
   * Domyslnie korzen — tak jest przy pracy lokalnej i przy wdrozeniu, gdzie
   * serwer sam podaje zbudowany frontend. GitHub Pages serwuje projekt
   * z podkatalogu o nazwie repozytorium, wiec tam budujemy z
   * `VITE_BASE=/magazyn-pcm/`. Bez tego przegladarka szukalaby paczek
   * w korzeniu domeny i strona zostalaby biala.
   */
  base: process.env.VITE_BASE ?? '/',

  /**
   * Zmienne srodowiskowe czytamy z KORZENIA repozytorium, nie z web/.
   * Caly projekt ma jeden plik .env (i jeden .gitignore go pilnujacy) —
   * drugi, osobny plik dla frontendu byloby latwo przeoczyc przy wdrozeniu.
   * Do przegladarki i tak trafiaja wylacznie zmienne z prefiksem VITE_.
   */
  envDir: '..',

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
    /**
     * Nasluch na WSZYSTKICH interfejsach.
     *
     * Wczesniej bylo tu jawne `127.0.0.1`, zeby ten adres w ogole odpowiadal
     * (domyslnie Vite bierze tylko [::1]). Skutek uboczny: serwer byl widoczny
     * WYLACZNIE z tego jednego komputera. Adres 127.0.0.1 znaczy „ta maszyna",
     * wiec z telefonu, tabletu czy drugiego laptopa nie da sie go otworzyc
     * nigdy — i nie ma to nic wspolnego z tym, czy serwer dziala.
     *
     * `true` odpowiada na 127.0.0.1, [::1] i na adres tego komputera w sieci
     * lokalnej, wiec kazdy z tych zapisow dziala.
     *
     * UWAGA NA WIDOCZNOSC: to otwiera podglad dla calej sieci lokalnej.
     * W laboratorium (router z SIM) i w studiu to sensowne. Jesli aplikacja
     * ma kiedys stanac w sieci, ktorej nie kontrolujesz, wlacz haslo —
     * AUTH_ENABLED w pliku .env, hash generuje `npm run haslo`.
     */
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
    },
  },
});
