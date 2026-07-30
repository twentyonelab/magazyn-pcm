@echo off
rem ---------------------------------------------------------------------------
rem AUTOSTART ZBIERANIA PO ZALOGOWANIU
rem
rem Wersja bez uprawnien administratora: wklada skrot do folderu Autostart,
rem wiec zbieranie wstaje samo po kazdym zalogowaniu uzytkownika.
rem
rem OGRANICZENIE, ktore trzeba znac: po restarcie komputera (na przyklad po
rem aktualizacji Windows) zbieranie ruszy dopiero PO ZALOGOWANIU. Jesli test
rem ma przezyc restart bez obecnosci czlowieka, potrzebne jest zadanie
rem systemowe — patrz README, rozdzial "Zbieranie danych bez przerw".
rem ---------------------------------------------------------------------------

chcp 65001 >nul
set ZRODLO=%~dp0zbieranie.cmd
set AUTOSTART=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set SKROT=%AUTOSTART%\Magazyn PCM - zbieranie.lnk

echo Tworze skrot w folderze Autostart...
echo   cel:   %ZRODLO%
echo   skrot: %SKROT%
echo.

powershell -NoProfile -Command ^
  "$s = (New-Object -ComObject WScript.Shell).CreateShortcut('%SKROT%');" ^
  "$s.TargetPath = '%ZRODLO%';" ^
  "$s.WorkingDirectory = '%~dp0..';" ^
  "$s.Description = 'Zbieranie danych z magazynu PCM';" ^
  "$s.Save()"

if exist "%SKROT%" (
  echo.
  echo GOTOWE. Zbieranie bedzie startowac po kazdym zalogowaniu.
  echo Wylaczenie: uruchom autostart-wylacz.cmd
) else (
  echo.
  echo NIE UDALO SIE utworzyc skrotu.
)

echo.
pause
