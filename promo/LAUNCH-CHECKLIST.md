# Launch-Vorbereitung — RAChecker

Alles, was du brauchst, um das Projekt hochzuladen und zu teilen. In Ruhe abarbeiten.
Die Social-Posts liegen daneben: `reddit.md`, `discord-und-forum.md`, `x-twitter.md`.

> **Name: RAChecker** (entschieden, überall vereinheitlicht — kein Bindestrich mehr).
> Repo: https://github.com/x3kim/RAChecker

---

## 1. Vor dem Upload — Sicherheit prüfen (wichtig)

Es darf **kein API-Key** und **keine persönliche Sammlung** ins öffentliche Repo.

- [ ] `server/config.local.json` (enthält deinen RA-Key) ist in `.gitignore` — **ist sie** ✅
- [ ] `data/` (DB, Bilder, Backups) ist ignoriert — **ist es** ✅
- [ ] `bin/*.exe` (RAHasher), `release/`, `web/dist/` ignoriert — **sind sie** ✅
- [ ] Nach `git init` einmal prüfen, dass nichts Geheimes drin ist:

```bash
git init
git add -A
git status                     # config.local.json / data/ dürfen NICHT auftauchen
git grep -iE "api.?key|x3kim|OPENMEDIAVAULT"   # sollte nur Platzhalter/Doku finden, keinen echten Key/Pfad
```

Findet der letzte Befehl deinen echten Key oder NAS-Pfad → vor dem ersten Commit entfernen.

---

## 2. Name — erledigt ✅

Anzeige-Name überall „RAChecker" (Bindestrich raus), Launcher heißt `Start-RAChecker.bat`,
`electron-builder.yml productName` = `RAChecker`, exe-Namen `RAChecker Setup 0.9.4.exe` /
`RAChecker-0.9.4-portable.exe`. Interne Daten-Dateinamen (`data/ra-checker.db`, Backups,
Offline-Paket) bleiben bewusst wie sie sind — sonst würden bestehende Installationen ihre
Daten verlieren. Rein technisch, für niemanden sichtbar.

---

## 3. GitHub-Repo anlegen & hochladen

Repo ist noch **nicht** git-initialisiert (bewusst). Vorhanden & bereit: `README.md` (DE) +
`README.en.md`, `LICENSE` (MIT), `CONTRIBUTING.md`, `.github/workflows/ci.yml`, `docs/`.

```bash
git init
git add -A
git commit -m "Initial public release (v0.9.4)"
git remote add origin https://github.com/x3kim/RAChecker.git
git branch -M main
git push -u origin main
```

- [ ] Repo-Beschreibung + Topics setzen: `retroachievements`, `roms`, `retro-gaming`, `emulation`, `hashing`, `electron`, `react`
- [x] `REPO_URL` in `web/src/lib/version.ts` → `github.com/x3kim/RAChecker` (erledigt)
- [x] Gleiche URL in `docs-site/index.html` (Topbar + Footer + git-clone) (erledigt)
- [x] GitHub-Link in den Social-Posts eingesetzt (erledigt)

---

## 4. Release mit der .exe

Die `.exe`-Dateien gehören **nicht** ins Repo (`release/` ist ignoriert) — sie kommen an ein
**GitHub Release** als Anhang.

- [ ] Nach `npm run app:dist` liegen in `release/`:
  - `RAChecker Setup 0.9.5.exe` (Installer)
  - `RAChecker-0.9.5-portable.exe` (Portable)
- [ ] GitHub → Releases → „Draft a new release" → Tag `v0.9.5` → beide `.exe` anhängen.
- [ ] Als Release-Text den Changelog-Eintrag 0.9.4 nehmen (aus der App: Version unten links).
- [ ] **Hinweis in den Release-Text:** Der Installer ist unsigniert → Windows SmartScreen warnt
      beim ersten Start („Weitere Informationen" → „Trotzdem ausführen"). Das ist normal bei
      unsignierten Open-Source-Builds.

---

## 5. Doku-Seite hosten (optional, empfohlen)

`docs-site/index.html` ist eine einzelne, eigenständige Datei — ideal für GitHub Pages.

- [ ] Repo → Settings → Pages → Source: „Deploy from a branch" → `main` / Ordner `/docs-site`
  (oder `docs-site/` in einen `gh-pages`-Branch legen).
- [ ] Ergebnis-URL notieren, in die App verlinken (optional: „Mehr"-Menü → Dokumentation).

---

## 6. Dann erst: teilen

Reihenfolge, die sich bewährt:
1. **RetroAchievements-Community zuerst** (Discord/Forum) — deine Kern-Zielgruppe, ehrlichstes Feedback.
2. **Reddit** (r/RetroAchievements, dann r/retrogaming) — 1–2 Tage später, mit Screenshots.
3. **X** optional obendrauf — geringste organische Reichweite für einen neuen Account, aber gut für Sichtbarkeit + wenn die RA-Accounts teilen.

Vor jedem Post: **die Regeln des jeweiligen Ortes lesen** (die meisten mögen keine reine Eigenwerbung —
„Tool gebaut, suche Feedback" kommt anders an als „ladet mein Ding runter"). Antworte danach auf Kommentare,
das treibt Reichweite mehr als der Post selbst.

Ganz wichtig, überall: **„nicht mit RetroAchievements affiliiert", „liefert keine ROMs", „Open Source (MIT)".**
