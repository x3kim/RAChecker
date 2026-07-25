@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title RAChecker

echo(
echo  ============================================
echo    RACHECKER  -  RetroAchievements ROM Scanner
echo  ============================================
echo(

where node >nul 2>nul
if errorlevel 1 (
  echo  [FEHLER] Node.js wurde nicht gefunden.
  echo  Bitte Node.js 22+ von https://nodejs.org installieren und neu starten.
  echo(
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo  [Setup] Installiere Abhaengigkeiten ^(einmalig^)...
  call npm install
  if errorlevel 1 ( echo  [FEHLER] npm install fehlgeschlagen. & pause & exit /b 1 )
)

echo  [Build] Baue die Oberflaeche auf den aktuellen Stand ^(~5 Sek^)...
call npm run build
if errorlevel 1 ( echo  [FEHLER] Build fehlgeschlagen. & pause & exit /b 1 )

echo  [Start] Server laeuft auf http://localhost:8088
echo  ^(Dieses Fenster offen lassen. Zum Beenden: Strg+C^)
echo(
start "" http://localhost:8088
node --no-warnings server\src\index.js

pause
