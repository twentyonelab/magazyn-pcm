/**
 * GDZIE STOI SERWER APLIKACJI.
 *
 * Domyślnie nigdzie — czyli pod tym samym adresem co strona. Tak jest przy
 * pracy w laboratorium i w studiu: Vite w trybie dev przepuszcza `/api/*`
 * na `127.0.0.1:4000`, a przy wdrożeniu na jednej maszynie serwer sam podaje
 * zbudowany frontend. W obu przypadkach ścieżka względna wystarcza i adres
 * serwera nie pojawia się w kodzie przeglądarki.
 *
 * Zmienna `VITE_API_BASE` jest dla JEDNEGO przypadku: gdy strona leży gdzie
 * indziej niż serwer. Tak jest na GitHub Pages, który serwuje wyłącznie pliki
 * i nie ma jak uruchomić procesu Node — dane muszą wtedy przyjść z osobnego
 * adresu, np. z tunelu do maszyny stojącej w laboratorium.
 *
 * CZEGO TA ZMIENNA NIE ZAŁATWIA. Przeglądarka nie sięgnie prosto do
 * Miniservera, choćby adres był poprawny:
 *   - hasło do Loxone musiałoby wtedy trafić do paczki JavaScriptu,
 *   - Miniserver nie wysyła nagłówków CORS, więc odpowiedź i tak byłaby
 *     odrzucona,
 *   - strona po HTTPS nie może pobierać treści po HTTP.
 * Po drugiej stronie tego adresu MUSI stać nasz serwer — on jeden zna hasło
 * i on jeden rozmawia z Loxone.
 *
 * Serwer pod obcym adresem wymaga jeszcze dwóch rzeczy po swojej stronie:
 * nagłówków CORS dla adresu strony i ciasteczka sesji z SameSite=None.
 * Bez tego przeglądarka odrzuci odpowiedzi mimo poprawnego adresu.
 */

/** Adres serwera bez ukośnika na końcu, albo pusty łańcuch. */
export const ADRES_API: string = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '');

/** Czy dane przychodzą spod innego adresu niż sama strona. */
export const API_ZDALNE = ADRES_API !== '';

/**
 * Buduje adres punktu API.
 *
 * Wszystkie wywołania w aplikacji przechodzą przez tę funkcję — dzięki temu
 * przeniesienie serwera to jedna zmienna, a nie przeszukiwanie kodu.
 */
export function adresApi(sciezka: string): string {
  return `${ADRES_API}${sciezka}`;
}

/**
 * Opcje `fetch` wspólne dla całej aplikacji.
 *
 * Przy zdalnym serwerze ciasteczko sesji nie poleci samo — przeglądarka
 * dokłada je do żądań międzydomenowych tylko na wyraźne życzenie. Przy
 * serwerze pod tym samym adresem `credentials` nie jest potrzebne, ale nie
 * przeszkadza, więc nie rozdzielamy tych dwóch ścieżek.
 */
export const OPCJE_API: RequestInit = API_ZDALNE ? { credentials: 'include' } : {};
