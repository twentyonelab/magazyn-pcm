/**
 * Generator hasha hasla dostepu do aplikacji.
 *
 * Uruchomienie:
 *   npm run haslo -- "moje tajne haslo"
 *
 * Wypisuje linie do wklejenia w .env. HASLA NIE ZAPISUJEMY nigdzie —
 * ani w pliku, ani w historii projektu. W .env trafia wylacznie hash scrypt,
 * z ktorego hasla nie da sie odtworzyc.
 */

import { hashPassword } from '../auth.js';

const line = '─'.repeat(72);

function out(text = ''): void {
  process.stdout.write(`${text}\n`);
}

// Haslo bierzemy z argumentu, a nie pytaniem interaktywnym, bo `npm run`
// nie przekazuje wejscia w sposob, na ktory da sie polegac na Windows.
const password = process.argv.slice(2).join(' ').trim();

if (!password) {
  out();
  out('Podaj hasło jako argument, w cudzysłowach:');
  out('    npm run haslo -- "moje tajne haslo"');
  out();
  out('UWAGA: hasło pojawi się w historii poleceń terminala. Jeśli to problem,');
  out('wyczyść historię albo użyj hasła jednorazowo i zmień je później.');
  out();
  process.exit(1);
}

if (password.length < 8) {
  out();
  out(`Hasło ma ${password.length} znaków — to za krótko dla dostępu z internetu.`);
  out('Użyj co najmniej 8 znaków, najlepiej kilku słów.');
  out();
  process.exit(1);
}

const hash = hashPassword(password);

out();
out(line);
out('  HASH HASŁA — wklej te dwie linie do pliku .env');
out(line);
out();
out('AUTH_ENABLED=true');
out(`AUTH_PASSWORD_HASH=${hash}`);
out();
out(line);
out('  Co jeszcze warto wiedzieć');
out(line);
out('  • Hasła nie da się odczytać z tego hasha — zapisz je w menedżerze haseł.');
out('  • Zgubione hasło = wygeneruj nowy hash tym skryptem i podmień w .env.');
out('  • Zmiana hasha wylogowuje wszystkich dopiero po usunięciu pliku');
out('    data/auth-secret; sam hash nie unieważnia wydanych sesji.');
out('  • Przy dostępie po HTTPS dodaj w .env: AUTH_COOKIE_SECURE=true');
out('  • Logowanie chroni dane badawcze. Sterowania i tak nie ma —');
out('    aplikacja fizycznie nie potrafi wysłać komendy do Loxone.');
out();
