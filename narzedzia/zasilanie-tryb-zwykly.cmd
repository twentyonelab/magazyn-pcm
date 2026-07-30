@echo off
rem ---------------------------------------------------------------------------
rem PRZYWROCENIE ZWYKLYCH USTAWIEN ZASILANIA
rem
rem Cofa zmiany z zasilanie-tryb-pomiarowy.cmd: laptop znowu bedzie sie
rem usypial na zasilaczu i reagowal na zamkniecie pokrywy.
rem
rem URUCHOM TO PO ZAKONCZENIU TESTU. Laptop, ktory nigdy nie zasypia, zuzywa
rem prad i grzeje sie bez potrzeby.
rem ---------------------------------------------------------------------------

chcp 65001 >nul

echo.
echo Przywracam zwykle ustawienia zasilania na zasilaczu:
echo   - uspienie po 30 minutach
echo   - zamkniecie pokrywy -^> uspij
echo.
set /p ZGODA="Wpisz TAK i nacisnij Enter: "

if /i not "%ZGODA%"=="TAK" (
  echo Anulowano.
  pause
  exit /b 0
)

powercfg /change standby-timeout-ac 30
powercfg /change monitor-timeout-ac 10

rem Zamkniecie pokrywy -> uspij (1).
powercfg /setacvalueindex SCHEME_CURRENT 4f971e89-eebd-4455-a8de-9e59040e7347 5ca83367-6e45-459f-a27b-476b1d01c936 1
powercfg /setactive SCHEME_CURRENT

echo.
echo GOTOWE. Pamietaj, ze od teraz zbieranie danych bedzie sie przerywac
echo przy uspieniu laptopa.
echo.
pause
