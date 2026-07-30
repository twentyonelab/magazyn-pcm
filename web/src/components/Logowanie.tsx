/**
 * Ekran logowania.
 *
 * Pokazuje sie tylko wtedy, gdy serwer zglasza, ze brama jest wlaczona
 * (AUTH_ENABLED=true). W sieci laboratorium nie pojawia sie wcale — i to jest
 * celowe: dodatkowy ekran przed danymi, ktore i tak sa dostepne tylko z LAN,
 * bylby przeszkoda bez zysku.
 */

import { useState } from 'react';
import { login } from '../api.js';

export function Logowanie({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (password === '' || busy) return;

    setBusy(true);
    setError(null);
    try {
      await login(password);
      setPassword('');
      onSuccess();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gate">
      <form className="gate__card" onSubmit={(event) => void submit(event)}>
        <p className="eyebrow">21 zmysłów · stanowisko badawcze</p>
        <h1 className="gate__title">
          Magazyn PCM
          <span className="brand__dot">.</span>
        </h1>

        <label className="field">
          <span>hasło dostępu</span>
          <input
            type="password"
            value={password}
            autoFocus
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        {error ? <p className="gate__error">{error}</p> : null}

        <button type="submit" className="button-primary" disabled={busy || password === ''}>
          {busy ? 'Sprawdzam…' : 'Wejdź'}
        </button>

        <p className="gate__note">
          Zbieranie danych działa niezależnie od tego ekranu — serwer odpytuje Miniserver
          i zapisuje pomiary także wtedy, gdy nikt nie jest zalogowany.
        </p>
      </form>
    </div>
  );
}
