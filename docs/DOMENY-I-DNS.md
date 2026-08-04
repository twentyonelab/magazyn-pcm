# Domeny, DNS i brama hasła

Stan na 2026-08-04. Zrzut tego, jak `entalvia.eu` jest podpięta pod aplikację
na Railway — po co każdy element i gdzie go szukać, gdy trzeba coś zmienić.

## Co pod jakim adresem stoi

| Adres | Co pokazuje | Skąd |
|---|---|---|
| `entalvia.eu` | strona o produkcie, bez pola hasła, przycisk **Aplikacja** w prawym górnym narożniku | Railway, domena własna |
| `www.entalvia.eu` | przekierowanie 301 na `entalvia.eu` | reguła w Cloudflare |
| `app.entalvia.eu` | brama: samo pole hasła, po zalogowaniu aplikacja | Railway, domena własna |
| `magazyn-pcmserver-production.up.railway.app` | to samo co `app` — adres surowy, do sprawdzania wdrożeń | Railway, domena wbudowana |

**To jest JEDNA aplikacja i jeden serwis Railway.** O tym, czy pokazać stronę
o produkcie, czy bramę, decyduje nazwa hosta — patrz `rolaAdresu()`
w `web/src/components/Logowanie.tsx`. Podgląd strony produktowej z dowolnego
adresu: dopisz `?produkt`.

## Podział obowiązków

- **home.pl** — tylko rejestracja domeny i wskazanie serwerów nazw. Strefa DNS
  w panelu home.pl jest od 2026-08-04 **nieużywana**: domena ma zewnętrzne
  serwery nazw, więc rekordy wpisane w home.pl nie działają.
- **Cloudflare** — cały DNS domeny `entalvia.eu` plus przekierowanie `www`.
  Serwery nazw: `arturo.ns.cloudflare.com`, `kate.ns.cloudflare.com`.
  Konto na `K.bogomaz@gmail.com`, plan Free.
- **Railway** — hosting aplikacji, domeny własne i certyfikaty HTTPS
  (usługa `@magazyn-pcm/server`, projekt `zesty-comfort`).

## Rekordy w Cloudflare

| Typ | Nazwa | Treść | Proxy |
|---|---|---|---|
| CNAME | `entalvia.eu` | `0qot8b99.up.railway.app` | **Proxied** |
| CNAME | `app` | `d4k61y62.up.railway.app` | DNS only |
| CNAME | `www` | `entalvia.eu` | Proxied |
| TXT | `_railway-verify` | `railway-verify=cb17eb4c…` | — |
| TXT | `_railway-verify.app` | `railway-verify=db5120db…` | — |

Plus reguła w **Rules → Page Rules**: `www.entalvia.eu/*` → Forwarding URL 301
→ `https://entalvia.eu/$1`.

Tryb szyfrowania w **SSL/TLS → Overview** musi zostać **Full**.

## Dlaczego tak, a nie prościej

**Wierzchołek domeny wymagał Cloudflare.** Railway podaje cel jako NAZWĘ
(`0qot8b99.up.railway.app`), a nie adres IP. Nazwę wpisuje się rekordem CNAME
i tu jest kłopot: panel home.pl wymaga podania hosta, czyli nie pozwala na
CNAME na samym wierzchołku (`entalvia.eu` bez przedrostka) — a DNS i tak tego
nie dopuszcza. Cloudflare obchodzi to „spłaszczaniem": trzyma CNAME, a na
zapytanie odpowiada adresami IP. Bez Cloudflare pod `entalvia.eu` nie dałoby
się nic postawić przy tym hostingu.

**Wierzchołek jest „Proxied", a `app` nie.** Railway sprawdza domenę, szukając
w DNS swojego CNAME. Na wierzchołku widzi adresy IP (efekt spłaszczania), więc
przy `entalvia.eu` zostaje ostrzeżenie „Waiting for DNS update" i nie wystawia
certyfikatu. Ruch idzie wtedy przez Cloudflare, który sam kończy HTTPS swoim
certyfikatem — dlatego ten jeden rekord musi być proxowany, a tryb Full
sprawia, że Cloudflare łączy się z Railway po HTTPS. `app.entalvia.eu` jest
zwykłą poddomeną, Railway widzi tam CNAME, wystawia własny certyfikat i nie
potrzebuje pośrednika.

**`www` nie jest domeną w Railway.** Plan Railway przyjmuje **dwie** domeny
własne i te dwie są zajęte przez `entalvia.eu` i `app.entalvia.eu`. Gdy `www`
kierowało wprost na Railway, dostawało 404, bo Railway nie znał tej nazwy.
Reguła w Cloudflare rozwiązuje to bez zajmowania trzeciego miejsca.

## Brama hasła

Ekran hasła pokazuje się, gdy serwer zgłasza `AUTH_ENABLED=true`. Zmienne
siedzą w Railway → Variables:

```
AUTH_ENABLED=true
AUTH_PASSWORD_HASH=scrypt$…
AUTH_COOKIE_SECURE=true
```

Nowy hash: `npm run haslo` (wypisuje gotową linię do wklejenia). Samo hasło
nie jest nigdzie w repozytorium.

Lokalnie brama zostaje wyłączona (`AUTH_ENABLED=false` w `.env`) — w sieci
laboratorium dodatkowy ekran przed pracą przy stanowisku tylko przeszkadza,
a dane są tam dostępne wyłącznie z LAN.

## Gdy trzeba coś zmienić

- **Nowy rekord DNS (np. poczta)** → Cloudflare → DNS → Records. Panel home.pl
  jest w tej sprawie martwy.
- **Kolejna domena własna w Railway** → wymaga wyższego planu (limit dwóch).
- **Zmiana hasła** → `npm run haslo`, potem podmiana `AUTH_PASSWORD_HASH`
  w Railway → Variables. Wdrożenie startuje samo.
- **Sprawdzenie z zewnątrz** → `nslookup app.entalvia.eu 8.8.8.8` (powinna
  odpowiedzieć nazwa `*.up.railway.app`) i `curl -I https://entalvia.eu`.
  Uwaga na własny komputer: po zmianach DNS trzyma stare wpisy w pamięci
  i pokazuje błąd „nie można rozwiązać nazwy", gdy adres już działa —
  `curl --resolve entalvia.eu:443:188.114.96.3` pomija lokalną pamięć.
