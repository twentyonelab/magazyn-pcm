/**
 * WERSJA APLIKACJI — jedno miejsce.
 *
 * Pokazywana pod nazwą w lewym górnym rogu. Numer podnosimy ŚWIADOMIE, przy
 * zamykaniu etapu pracy, a nie przy każdym commicie — ma odpowiadać na pytanie
 * „którą wersję widzę na ekranie", zadawane przy pokazie albo w rozmowie
 * o wynikach.
 *
 * HISTORIA
 *   v0.1  Pierwsza działająca całość: prawdziwe dane z Miniservera, siedem
 *         widoków, historia w SQLite, mapa Śląska, belka stanu naładowania,
 *         ciepłomierz AXIOMA na Modbusie.
 *   v0.2  Schemat instalacji przerysowany według rysunku technicznego
 *         stanowiska (obieg odbioru wody użytkowej po lewej, źródło ciepła
 *         po prawej), znaczniki mapy jako zbiorniki z poziomem naładowania,
 *         ikony pogodowe, tryb pokazowy przepływu.
 *   v0.3  Nowy język graficzny według zatwierdzonej makiety: rury jako
 *         metaliczne tuby, urządzenia jako białe karty z ikonami liniowymi,
 *         zbiornik PCM jako metaliczny walec z kropkami sond, karta pogodowa
 *         w układzie etykieta–wartość, aktywna zakładka na ciemno, znaczniki
 *         mapy na kartach. Dane, źródła i interakcje bez zmian.
 *   v0.4  Rastry zamiast wektorów: rury, złączki i płaszcz zbiornika to PNG
 *         liczone programowo (web/public/schemat). Topologia połączeń
 *         poprawiona według ponownej analizy makiety: ślepa odnoga zaworka
 *         po lewej, jedna linia do podgrzewacza, rozdzielacz z trzema
 *         zejściami po prawej. Dane i interakcje bez zmian.
 */

export const WERSJA = 'v0.4';
