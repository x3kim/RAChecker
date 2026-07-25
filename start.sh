#!/usr/bin/env bash
# RAChecker launcher for Linux/macOS.
# Cartridge systems work everywhere; disc systems need a RAHasher binary in
# ./bin or on PATH (build it from RetroAchievements/RALibretro on non-Windows).
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "[FEHLER] Node.js nicht gefunden — bitte Node.js 22+ installieren: https://nodejs.org" >&2
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "[Setup] Installiere Abhängigkeiten (einmalig)…"
  npm install
fi

echo "[Build] Baue die Oberfläche…"
npm run build

echo "[Start] http://localhost:8088 (Fenster offen lassen, Beenden mit Strg+C)"
if command -v xdg-open >/dev/null 2>&1; then xdg-open http://localhost:8088 || true
elif command -v open >/dev/null 2>&1; then open http://localhost:8088 || true; fi
exec node --no-warnings server/src/index.js
