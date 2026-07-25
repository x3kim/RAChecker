# Mitmachen / Contributing

Danke für dein Interesse! / Thanks for your interest — English is fine in issues and PRs.

## Setup

```bash
npm install
npm run dev        # Backend (watch) + Vite-Devserver auf http://localhost:5173
npm test           # Hash-Korrektheits-Tests (node:test)
```

Voraussetzung: Node.js ≥ 22.5 (`node:sqlite`). Keine nativen Abhängigkeiten.

## Projekt-Layout

- `server/src` — Fastify-Backend, SQLite (`node:sqlite`), Hashing (rcheevos-Regeln in JS, RAHasher für Discs)
- `web/src` — React 19 + Vite + Tailwind v4
- `electron/` — Desktop-Wrapper (`npm run app:dev`, `npm run app:dist`)
- `docs/` — Architektur, Hashing-Regeln, Bedienung

## Regeln

1. **Tests müssen grün bleiben:** `npm test` vor jedem PR.
2. **Frontend-Änderungen** brauchen `npm run build`, bevor sie im Produktionsmodus sichtbar sind (`npm run dev` hat HMR).
3. **Keine Secrets committen** — Zugangsdaten gehören in `server/config.local.json` (git-ignoriert) oder in die Einstellungen der App.
4. **i18n:** Neue UI-Strings immer über `t()` (`web/src/lib/i18n.ts`) mit DE- und EN-Eintrag.
5. **Hash-Regeln** (`server/src/hashing/file-hash.js`) nur mit Beleg aus dem [rcheevos-Quellcode](https://github.com/RetroAchievements/rcheevos) ändern und mit Tests absichern.

## Bugs melden

Bitte angeben: Betriebssystem, Node-Version, betroffenes System/Dateiendung, und die Fehlermeldung aus der Sammlung (Spalte „Fehler") oder dem Server-Log.

Spieldaten, Hashes und Bilder stammen von [retroachievements.org](https://retroachievements.org) — dieses Projekt ist nicht mit RetroAchievements affiliiert.
