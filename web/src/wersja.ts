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
 *   v0.5  Grafiki WYCINANE z makiety projektanta (narzedzia/makieta-v03.png):
 *         cienkie rury, kule złączek, walec zbiornika i karty urządzeń to
 *         wycinki z renderów. Topologia: dwie ciągłe linie nad zbiornikiem,
 *         CZTERY piony z dekla (skrajne do górnej, para do dolnej), piony
 *         skrajne przecinają dolną linię bez złączki. Dane bez zmian.
 *   v0.6  Schemat to wektorowy plik projektanta z Illustratora
 *         (schemat_instalacji_wektor.svg) z dopisanym kontraktem danych.
 *         Szkło (mrożone tafle) na elementach interfejsu, ciepła pulsująca
 *         poświata w tle, logo Tauron Ciepło w prawym górnym rogu,
 *         21 zmysłów nad stopką, copyright na stopce.
 *   v0.7  Nowe wydanie schematu od projektanta
 *         (schemat_instalacji_wektor3.svg): sekcja uzdatniania wody ukryta,
 *         dolny rząd trzech urządzeń po lewej, zbiornik podpisany
 *         „PCM UNIT1", rury jako rastry osadzone w pliku. Kontrakt danych
 *         wpinany skryptem narzedzia/wepnij-kontrakt.mjs, żeby kolejna
 *         wersja z Illustratora nie kasowała powiązań.
 *   v0.8  Czwarte wydanie schematu: rury wróciły z rastrów na wektory, więc
 *         warstwa przepływu leży na dokładnych współrzędnych rysunku, a nie
 *         na przybliżeniu. Linie instalacji przyciemnione (#e0e0e0 gubiło się
 *         na kremowym tle). Dolny rząd trzech kart to ciąg uzdatniania wody —
 *         dwa brakujące urządzenia dostały ikony i podpisy przeniesione
 *         z ukrytej sekcji tego samego pliku.
 */

export const WERSJA = 'v0.8';
