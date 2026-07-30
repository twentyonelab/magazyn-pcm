@echo off
rem ---------------------------------------------------------------------------
rem KOPIA ZAPASOWA DANYCH POMIAROWYCH
rem
rem Baza pomiarow i plik sesji leza na jednym dysku lokalnym i celowo NIE sa
rem w repozytorium (dane, nie kod). Dla wielotygodniowego testu to jedyny
rem egzemplarz — a jedyny egzemplarz to zaden egzemplarz.
rem
rem Uzycie:
rem   kopia-danych.cmd                        -> do katalogu kopie\ w projekcie
rem   kopia-danych.cmd "G:\Moj dysk\kopie"    -> do wskazanego katalogu
rem
rem Baze kopiujemy poleceniem SQLite (.backup), a nie zwyklym copy: w trybie
rem WAL czesc swiezych zapisow siedzi w pliku -wal, wiec skopiowanie samego
rem .db moglo by dac baze bez ostatnich pomiarow.
rem ---------------------------------------------------------------------------

chcp 65001 >nul
cd /d "%~dp0.."

set CEL=%~1
if "%CEL%"=="" set CEL=%CD%\kopie

for /f "tokens=1-3 delims=/.- " %%a in ("%DATE%") do set DZIEN=%%c-%%b-%%a
set GODZ=%TIME::=-%
set GODZ=%GODZ: =0%
set STEMPEL=%DZIEN%_%GODZ:~0,5%

if not exist "%CEL%" mkdir "%CEL%"

echo Kopiuje dane do: %CEL%
echo.

node -e "const D=require('better-sqlite3');const p=require('path');const cel=process.argv[1];const st=process.argv[2];const zrodlo=p.join('data','pomiary.db');const fs=require('fs');if(!fs.existsSync(zrodlo)){console.log('Nie ma jeszcze bazy pomiarow - pomijam.');process.exit(0);}const db=new D(zrodlo,{readonly:true});const out=p.join(cel,'pomiary-'+st+'.db');db.backup(out).then(()=>{db.close();const kb=(fs.statSync(out).size/1024).toFixed(0);console.log('Baza pomiarow  -> '+out+'  ('+kb+' kB)');}).catch(e=>{console.error('BLAD kopii bazy:',e.message);process.exitCode=1;});" "%CEL%" "%STEMPEL%"

if exist "data\sesje.json" (
  copy "data\sesje.json" "%CEL%\sesje-%STEMPEL%.json" >nul
  echo Sesje badawcze -^> %CEL%\sesje-%STEMPEL%.json
) else (
  echo Nie ma jeszcze pliku sesji - pomijam.
)

echo.
echo GOTOWE.
echo.
pause
