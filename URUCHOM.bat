@echo off
rem ===========================================================================
rem  MAGAZYN PCM — uruchomienie aplikacji jednym kliknieciem.
rem
rem  Ten plik istnieje, bo serwery zyja tylko tak dlugo, jak okno, ktore je
rem  uruchomilo. Po restarcie komputera albo zamknieciu sesji link przestaje
rem  odpowiadac — wtedy wystarczy dwuklik na tym pliku.
rem
rem  Okno, ktore sie otworzy, MUSI ZOSTAC OTWARTE (mozna je zminimalizowac).
rem  Zamkniecie okna zatrzymuje aplikacje.
rem ===========================================================================
title Magazyn PCM - serwer
cd /d "%~dp0"

echo.
echo   Magazyn PCM - uruchamiam serwery...
echo   Nie zamykaj tego okna (mozesz je zminimalizowac).
echo.
echo   Aplikacja za chwile pod adresami:
echo     na tym komputerze:   http://127.0.0.1:5173
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4" ^| findstr /v "169.254"') do (
  for /f "tokens=* delims= " %%b in ("%%a") do echo     z telefonu w Wi-Fi:  http://%%b:5173
)
echo.

call npm run dev
pause
