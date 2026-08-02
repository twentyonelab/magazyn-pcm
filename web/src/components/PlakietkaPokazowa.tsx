/**
 * Plakietka „dane pokazowe".
 *
 * Widoczna zawsze, gdy aplikacja pracuje na modelu zamiast na Miniserverze,
 * i BEZ MOŻLIWOŚCI ZAMKNIĘCIA. To nie jest powiadomienie, tylko etykieta
 * całego ekranu: wszystkie liczby pod nią są wyliczone, nie zmierzone.
 *
 * Stanowisko należy do Politechniki Śląskiej i strona pokazowa jest publiczna
 * — wykres wzięty za wynik badania byłby gorszy od pustego ekranu. Dlatego
 * plakietka siedzi przy nazwie aplikacji, a nie w rogu, i mówi to wprost.
 */

export function PlakietkaPokazowa() {
  return (
    <span className="plakietka-pokaz" title="Wartości wylicza model, nie pochodzą z pomiaru">
      <span className="plakietka-pokaz__kropka" aria-hidden="true" />
      dane pokazowe
    </span>
  );
}
