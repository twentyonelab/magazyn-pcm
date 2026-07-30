@echo off
rem Usuwa autostart zbierania z folderu Autostart.

chcp 65001 >nul
set SKROT=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Magazyn PCM - zbieranie.lnk

if exist "%SKROT%" (
  del "%SKROT%"
  echo Autostart wylaczony.
) else (
  echo Autostart nie byl wlaczony - nic do zrobienia.
)

echo.
echo Uwaga: to nie zatrzymuje serwera, ktory dziala teraz.
echo Jesli zbiera dane, zamknij jego okno osobno.
echo.
pause
