@echo off
rem ---------------------------------------------------------------------------
rem ZBIERANIE DANYCH W TRYBIE CIAGLYM
rem
rem To NIE jest tryb pracy nad aplikacja (do tego sluzy `npm run dev`).
rem Ten skrypt uruchamia sam serwer odczytu, bez przeladowywania po zmianie
rem plikow, i PODNOSI GO PONOWNIE, jesli padnie. Do wielodniowego testu.
rem
rem Zatrzymanie: zamknij to okno albo Ctrl+C.
rem ---------------------------------------------------------------------------

chcp 65001 >nul
cd /d "%~dp0.."

if not exist node_modules (
  echo Brakuje zaleznosci - instaluje.
  call npm install
)

if not exist .env (
  echo Brak pliku .env - tworze z .env.example.
  copy .env.example .env >nul
  echo UWAGA: uzupelnij dane logowania do Miniservera w pliku .env.
)

set LICZNIK=0

:petla
set /a LICZNIK+=1
echo.
echo ============================================================
echo  Start serwera zbierania - proba %LICZNIK% - %DATE% %TIME%
echo ============================================================
echo.

call npm run start

rem Dotarcie tutaj znaczy, ze serwer sie zakonczyl. Przy Ctrl+C okno i tak
rem zostanie zamkniete, wiec petla dotyczy tylko awarii.
echo.
echo Serwer zakonczyl prace (%DATE% %TIME%). Ponawiam za 15 sekund...
timeout /t 15 /nobreak >nul
goto petla
