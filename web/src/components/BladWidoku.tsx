/**
 * Bariera bledow wokol widokow.
 *
 * Bez niej wyjatek w jednym widoku wygasza CALA aplikacje do bialego ekranu
 * — razem z paskiem stanu i danymi, ktore wciaz plyna. Podczas tygodniowego
 * testu to roznica miedzy "jeden ekran nie dziala" a "wyglada, jakby padlo
 * wszystko". Bariera zatrzymuje awarie na granicy widoku i mowi po polsku,
 * co zrobic.
 */

import { Component, type ReactNode } from 'react';

interface Props {
  /** Zmiana klucza (np. przejscie na inny widok) zeruje stan awarii. */
  resetKey: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
  resetKey: string;
}

export class BladWidoku extends Component<Props, State> {
  override state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    // Przejscie na inny widok daje mu czysta szanse.
    if (props.resetKey !== state.resetKey) {
      return { error: null, resetKey: props.resetKey };
    }
    return null;
  }

  override componentDidCatch(error: Error): void {
    // eslint-disable-next-line no-console
    console.error('Widok zgłosił wyjątek:', error);
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="note is-bad">
          <strong>Ten widok napotkał błąd i został zatrzymany.</strong> Pozostałe widoki działają
          dalej, a serwer nieprzerwanie zbiera dane.
          <br />
          <span className="mono" style={{ fontSize: '0.8rem' }}>
            {this.state.error.message}
          </span>
          <br />
          <button
            type="button"
            className="chip"
            style={{ marginTop: '0.6rem' }}
            onClick={() => this.setState({ error: null })}
          >
            spróbuj ponownie
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
