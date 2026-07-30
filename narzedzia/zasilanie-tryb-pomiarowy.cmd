@echo off
rem ---------------------------------------------------------------------------
rem TRYB POMIAROWY ZASILANIA
rem
rem UWAGA: ten skrypt ZMIENIA USTAWIENIA SYSTEMU WINDOWS. Nic nie robi,
rem dopoki nie potwierdzisz. Zmiany dotycza tylko pracy na zasilaczu —
rem na baterii laptop dalej bedzie sie usypial, zeby jej nie wyczerpac.
rem
rem Co zmienia i dlaczego:
rem   1. Uspienie na zasilaczu -> nigdy.
rem      Uspiony komputer nie odpytuje Miniservera. Kazde uspienie to dziura
rem      w danych badawczych.
rem   2. Hibernacja na zasilaczu -> nigdy. Ten sam powod.
rem   3. Zamkniecie pokrywy na zasilaczu -> nie rob nic.
rem      Zeby dalo sie zamknac laptopa i zostawic go zbierajacego dane.
rem   4. Wygaszanie ekranu po 10 minutach ZOSTAJE wlaczone — gasniecie ekranu
rem      nie przerywa pracy, a oszczedza panel.
rem
rem Przywrocenie ustawien domyslnych: zasilanie-tryb-zwykly.cmd
rem ---------------------------------------------------------------------------

chcp 65001 >nul

echo.
echo ============================================================
echo  TRYB POMIAROWY ZASILANIA - zmiana ustawien Windows
echo ============================================================
echo.
echo Na ZASILACZU zostanie ustawione:
echo   - uspienie:            nigdy
echo   - hibernacja:          nigdy
echo   - zamkniecie pokrywy:  nie rob nic
echo   - wygaszenie ekranu:   po 10 minutach (bez zmian w pracy)
echo.
echo Na baterii nic sie nie zmienia.
echo.
set /p ZGODA="Wpisz TAK i nacisnij Enter, zeby zastosowac: "

if /i not "%ZGODA%"=="TAK" (
  echo.
  echo Anulowano. Nic nie zostalo zmienione.
  echo.
  pause
  exit /b 0
)

echo.
echo Stosuje ustawienia...

rem Uspienie i hibernacja na zasilaczu: 0 = nigdy.
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0

rem Ekran moze gasnac - to nie wplywa na zbieranie danych.
powercfg /change monitor-timeout-ac 10

rem Zamkniecie pokrywy na zasilaczu -> nie rob nic.
rem GUID-y: SUB_BUTTONS / LIDACTION. 0 = nic nie rob.
powercfg /setacvalueindex SCHEME_CURRENT 4f971e89-eebd-4455-a8de-9e59040e7347 5ca83367-6e45-459f-a27b-476b1d01c936 0
powercfg /setactive SCHEME_CURRENT

if errorlevel 1 (
  echo.
  echo Czesc ustawien mogla sie nie zastosowac.
  echo Uruchom ten plik ponownie jako administrator:
  echo prawy przycisk myszy -^> "Uruchom jako administrator".
) else (
  echo.
  echo GOTOWE. Laptop na zasilaczu nie zasnie i przezyje zamkniecie pokrywy.
)

echo.
echo Sprawdz jeszcze dwie rzeczy, ktorych ten skrypt NIE zmienia:
echo   1. Wi-Fi: karta sieciowa moze byc usypiana osobno. Menedzer urzadzen
echo      -^> karta sieciowa -^> Wlasciwosci -^> Zarzadzanie energia
echo      -^> odznacz "Zezwalaj komputerowi na wylaczanie tego urzadzenia".
echo      Najpewniejsze rozwiazanie w laboratorium to kabel Ethernet.
echo   2. Autostart zbierania: narzedzia\autostart-wlacz.cmd
echo.
echo Po dobie testu sprawdz, czy nie bylo przerw:  npm run przerwy
echo.
pause
