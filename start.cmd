@echo off
rem ---------------------------------------------------------------------------
rem Uruchomienie serwera magazynu PCM dwuklikiem.
rem
rem chcp 65001 ustawia kodowanie UTF-8, zeby polskie znaki i symbol stopnia
rem wyswietlaly sie poprawnie, a nie jako krzaki.
rem ---------------------------------------------------------------------------

chcp 65001 >nul
cd /d "%~dp0"

if not exist node_modules (
  echo.
  echo Pierwsze uruchomienie - instaluje zaleznosci. To potrwa kilka minut.
  echo.
  call npm install
)

if not exist .env (
  echo.
  echo Nie znalazlem pliku .env - tworze go z .env.example.
  echo Otworz .env i uzupelnij dane logowania do Miniservera.
  echo.
  copy .env.example .env >nul
)

call npm run dev

echo.
echo Serwer zostal zatrzymany. Nacisnij dowolny klawisz, zeby zamknac okno.
pause >nul
