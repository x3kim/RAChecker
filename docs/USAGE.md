# Bedienung — Schritt für Schritt

## 0. Start
- **Windows:** `Start-RAChecker.bat` doppelklicken → Browser öffnet <http://localhost:8088>.
- **Linux/macOS:** `./start.sh` ausführen.
- **Terminal (alle Plattformen):** `npm run serve` (baut + startet) oder `npm run dev` (Entwicklung).
- **Beim allerersten Start** führt dich ein Onboarding-Assistent durch ROM-Ordner, RA-Login und Hash-Sync.

## 1. Hash-Datenbank synchronisieren (einmalig)
Tab **Hash-DB** → **Synchronisieren** (oder **Komplett neu** für ein vollständiges Spiegeln).
- Holt pro System einmalig alle Spiele + Hashes von RetroAchievements.
- Dauert beim ersten Mal einige Minuten (Rate-Limiter, viele Systeme). Fortschritt wird live angezeigt.
- Danach im Cache; automatischer Re-Sync erst nach **90 Tagen**. Grüne Häkchen = aktuell, gelber Punkt = veraltet/fehlt.

## 2. (Optional) RAHasher installieren
Nur nötig für Disc-Systeme (PS1/PS2/PSP/Saturn/Dreamcast/…) und `.chd`.
Tab **Einstellungen** → **RAHasher herunterladen.** Cartridge-Systeme funktionieren ohne.

Komprimierte Container, die RAHasher nicht öffnet — `.cso`/`.zso` sowie Dolphins `.rvz`/`.wia`
und `.gcz` — packt RAChecker zum Hashen kurz in eine echte `.iso` aus und räumt sie danach
wieder weg; alle Kompressionsverfahren von WIA/RVZ werden gelesen. `.wbfs` geht noch nicht.

## 3. Bibliothek scannen
Tab **Scannen**:
1. **ROM-Oberordner** wählen (beim allerersten Start füllt der Onboarding-Assistent ihn, sonst leer) —
   **Durchsuchen** öffnet einen Datei-Browser, der auch Netzwerkpfade (`\\SERVER\Freigabe\...`) und Laufwerke kennt.
2. **Scan starten.** Unterordner werden automatisch rekursiv durchsucht. Große Dateien können vor dem
   Hashen optional lokal zwischenkopiert werden (Einstellungen, Schwelle einstellbar) — hilft gegen
   Timeouts bei großen Disc-Images auf langsamen Netzlaufwerken.
3. Live-Ergebnisse:
   - Fortschrittsbalken + Zähler (SPIELBAR / KEIN MATCH / RAHASHER / …).
   - Pro System eine Kachel mit Trefferquote.
   - Tabelle mit jedem ROM: Status, erkanntes Spiel + Box-Art, Erfolge, Hash, Größe.
4. **Filtern:** Auf einen Zähler oder eine System-Kachel klicken; im Suchfeld nach Datei/Spiel suchen.
5. **Klick auf eine grüne Zeile** → Details (Erfolge, Punkte, exakter Referenz-ROM-Name, voller Hash, „Spiel-Details").
6. **CSV** exportiert das komplette Ergebnis.

> Unter **Einstellungen** lässt sich festlegen, welche Systeme Sync/Scan überhaupt berücksichtigen
> (Systemauswahl) — nicht interessierende Systeme werden dann komplett übersprungen.

### Ordnernamen sind optional
Erkannt wird am **Inhalt**: Lässt sich das System an der Endung nicht ablesen
(`.bin`, `.iso`, `.cue` nutzen viele Systeme), probiert RAChecker alle in Frage kommenden
Systeme durch und nimmt das Ergebnis, das die Hash-Datenbank kennt. Ein korrekt gedumptes
ROM trifft also unabhängig davon, wie du sortierst — auch alles in einem einzigen Ordner.

Ordner mit System-Namen (`SNES`, `PlayStation`, `PSX`, `Mega Drive`, `Saturn`, `Dreamcast`,
`Arcade`/`MAME` …) sind trotzdem nützlich: sie werden erkannt und **zuerst** probiert,
was den Scan bei mehrdeutigen Disc-Images etwas beschleunigt.

## 3b. Sammlung & Spiele
- **Sammlung** — alle je gescannten ROMs, dauerhaft gespeichert. Nach Status/System filtern, suchen.
  Unveränderte Dateien werden bei späteren Scans nicht neu gehasht. Mehrfachauswahl (Karten-Ansicht)
  erlaubt, ausgewählte Dateien zu löschen oder ihre Pfade zu kopieren; Export als CSV oder
  RetroArch-Playlist (`.lpl`).
- **Sammlung-Diff** — nach jedem Scan zeigt eine eigene Ansicht, was neu ist, seitdem Erfolge hat,
  verloren gegangen oder ganz verschwunden ist (Vergleich zum Stand vor dem Scan).
- **Spiele** — pro (synchronisiertem) System alle Spiele mit Erfolgen durchstöbern; ein Spiel öffnen
  zeigt Box-Art, alle **Erfolge mit Badges**, Punkte und die kompatiblen ROM-Versionen.
- **Mastery** — dein RA-Fortschritt: Avatar, Punkte, gemeisterte Sets, Completion % pro Spiel
  (eigene Daten via API). Klick auf das Profil oben rechts führt auch hierher.
- **Design** — über das Paletten-Symbol oben rechts (oder Einstellungen) zwischen 6 Themes wechseln
  (CRT Cyan, Amber, Synthwave, Matrix, Game Boy, Light) plus 2 geheime Freischaltungen; dazu Schriftart
  und ein optionaler Aurora-Hintergrund unter Einstellungen → Darstellung. Wird lokal gespeichert.

### Weitere Funktionen
- **Erst-Start-Assistent:** erscheint automatisch beim allerersten Start und führt durch ROM-Ordner,
  RA-Login und Hash-Sync.
- **Befehlspalette:** `Strg+K` öffnet eine Suche über Spiele, Aktionen und Navigation.
- **Tastatur-Shortcuts:** `g` dann `d/s/g/h/p` springt zu Dashboard/Scan/Spiele/Hash-DB/Mastery,
  `/` fokussiert die Suche, `?` zeigt alle Shortcuts, `Esc` schließt Dialoge.
- **Geführte Tour:** über das Kompass-Symbol oben rechts, erklärt die Oberfläche Schritt für Schritt.
- **Job-Anzeige:** ein laufender Scan/Sync/Bild-Vorab-Cache bleibt als Status sichtbar, auch beim
  Tab-Wechsel.
- **Drag & Drop:** ROM-Dateien oder Ordner irgendwo ins Fenster ziehen → Upload-Schnelltest (für eine
  Handvoll ROMs; die ganze Sammlung weiter über den Scan/Ordner-Picker). Der Browser übermittelt dabei
  nur den Dateiinhalt, keinen echten Pfad — auch in der Desktop-App.
- **Scan auf ein System beschränken:** im Scan-Tab das Dropdown neben „Durchsuchen" nutzen; unter
  Einstellungen lässt sich zusätzlich global festlegen, welche Systeme Sync/Scan überhaupt beachten.
- **Richtige Version finden:** bei einer 🔴 KEIN-MATCH-Zeile aufklappen → „Richtige Version" → es sucht das
  Spiel und zeigt die akzeptierten ROM-Versionen + ggf. den Patch.
- **Im Explorer anzeigen:** Treffer-Zeile aufklappen → „Im Explorer" springt zur Datei.
- **Duplikate:** in der Sammlung der Button „Duplikate" listet Spiele, die du mehrfach hast, und
  erlaubt, Extra-Kopien direkt zu löschen (echtes 1G1R-Aufräumen). Behalten wird die ★-markierte
  Kopie — ohne Wunsch-Region die erste, sonst die, die deiner Reihenfolge am nächsten kommt.
- **Wunsch-Region & Sprache:** Einstellungen → Allgemein → „Wunsch-Region & Sprache". Regionen (JP,
  US, EU …) und Sprachen (ja, en, de …) in eine Reihenfolge bringen, z. B. „Japanisch → Japan →
  Europa". Danach sortiert die Sammlung über „Wunsch-Region zuerst", die Duplikat-Liste markiert die
  Kopie zum Behalten, und die Spiel-Details stellen die passende ROM-Version nach oben und zeigen,
  welche Regionen RetroAchievements für das Spiel überhaupt kennt.
- **Woher die Region kommt:** bei einer Datei, die trifft, von RetroAchievements selbst — der Hash
  identifiziert genau diesen Dump, der Dateiname ist dafür egal. Diese Namen holt RAChecker nach
  jedem Scan automatisch für die Spiele deiner Sammlung; für die ganze Datenbank gibt es in den
  Einstellungen einen Knopf (dauert länger, abbrechbar, setzt fort). Nur Dateien, die
  RetroAchievements **nicht** kennt, werden am Dateinamen gelesen — „Zelda (Europe) (En,Fr,De).gba",
  „Chrono Trigger (U) [!].smc", „Elite (1984)(GB).tap". Bestätigte Angaben haben einen durchgezogenen
  Rahmen, geratene einen gestrichelten; Dateien ganz ohne Angabe landen unter „Ohne Angabe" und
  werden nie versteckt.
- **Ordner-Watch:** Einstellungen → Überwachung starten; wählbar zwischen Dauer-Watch und
  Intervall-Modus (alle N Minuten kurz prüfen), standardmäßig aus. Neue ROMs werden automatisch geprüft.
- **Geplanter Scan:** Einstellungen → einmal täglich zu einer festen Uhrzeit automatisch scannen (an/aus).
- **Geheim:** Probier mal ↑↑↓↓←→←→ B A. 🎮

> Scan und Sync laufen im Hintergrund weiter, auch wenn du den Tab wechselst.

## 3c. Entdecken, Hardcore & Spielzeit

- **Entdecken** (Tab in der Hauptnavigation, Shortcut `g` dann `e`):
  - *Gratis-Spiele* — die von RetroAchievements kuratierte Liste legal kostenloser Homebrew- und
    Freeware-Titel. Jede Zeile zeigt, ob RA dafür ein Achievement-Set hat und ob die Datei schon in
    deiner Sammlung liegt. Der Download-Link führt immer zur Original-Quelle der Entwickler
    (itch.io, GitHub, AtariAge …) — RAChecker liefert keine ROMs mit. Nach dem Herunterladen die
    Datei in den ROM-Ordner legen und neu scannen; erst dann weißt du sicher, ob der Hash passt.
  - *Set-Radar* — welche Achievement-Sets gerade gebaut werden. Oben stehen Claims für Spiele, die du
    **besitzt** (da kommen also neue oder überarbeitete Erfolge für eine ROM, die du schon hast),
    darunter Claims, die laut Dateiname wahrscheinlich eine deiner nicht gematchten ROMs betreffen.
    Dazu deine eigenen Set-Anfragen (inkl. Kontingent) und deine „Will ich spielen"-Liste, jeweils mit
    Besitz-Markierung, plus Links zur RA-Anfrageliste und zur Entwickler-Doku.
  - *Community* — Achievement der Woche und frisch gemeisterte Spiele der Community, markiert mit dem,
    was du besitzt.
- **Hardcore** (im Profil-Hub neben Mastery/Sammlung/Insights): Liste aller Spiele, in denen dein
  Hardcore-Fortschritt hinter dem Softcore-Fortschritt liegt — standardmäßig auf ROMs gefiltert, die du
  wirklich hast. Hardcore verbietet Savestates, Cheats und Rückspulen; nur so gibt es goldene Abzeichen,
  Ranglisten-Teilnahme und die volle Punktzahl. Jeder Softcore-Erfolg lässt sich dort erneut holen.
- **Ranglisten:** im Spiel-Fenster einklappbar — alle Leaderboards eines Spiels samt deinem Eintrag und
  Platz. Ranglisten zählen nur im Hardcore-Modus.
- **Spielzeit:** Einstellungen → Emulator & Start → *Rich Presence & Spielzeit* einschalten. Danach
  fragt RAChecker im gewählten Intervall ab, was du gerade spielst, und baut daraus eine lokale
  Session-Historie (Insights-Tab: „Spielzeit"). Standardmäßig aus, jederzeit löschbar.
- **Direkt starten:** Einstellungen → Emulator & Start → Pfad zu `retroarch.exe` und zum Core-Ordner
  eintragen. Danach starten der „Starten"-Button im Spiel-Fenster und in der Sammlung (Karten-Ansicht)
  die ROM direkt mit dem passenden Core. Welcher Core je System empfohlen wird — und ob er Achievements
  bzw. Hardcore unterstützt — steht im Spiel-Fenster.
- **Exporte:** in der Sammlung unter „Export": RetroArch-Playlist (`.lpl`), ES-DE/EmulationStation,
  Playnite (CSV), LaunchBox (XML) und CSV der aktuellen Ansicht. Der ES-DE-Export lädt ein ZIP
  herunter mit **einer `gamelist.xml` pro System** und Pfaden relativ zum jeweiligen ROM-Ordner —
  so erwartet ES-DE das. Eine `README.txt` im ZIP nennt pro System den verwendeten Basis-Ordner und
  wohin die Dateien gehören (`<ROMs>/<system>/gamelist.xml` oder `%userprofile%\ES-DE\gamelists\`).
  Playnite und LaunchBox bekommen die offiziellen Plattform-Namen des jeweiligen Launchers.
- **Offline-Paket:** Einstellungen → Daten/Backups → Offline-Paket. Zeigt an, ob alles Nötige lokal
  vorliegt (Hash-DB, Spieldetails, Bilder, RAHasher), und exportiert Datenbank + Bildcache als `.7z`
  für einen zweiten Rechner. Der Import ersetzt die Datenbank beim nächsten Start (vorher wird
  automatisch gesichert).
- **RA-Weltabdeckung:** Insights-Tab — wie viel Prozent aller RA-Spiele, -Achievements und -Punkte
  deine Sammlung abdeckt, pro System aufgeschlüsselt.

## 4. Einzelne Datei prüfen
Einen eigenen „Einzeltest"-Tab gibt es nicht mehr — stattdessen die ROM- oder Archivdatei einfach
irgendwo ins Fenster ziehen (Drag & Drop, siehe oben). Funktioniert auch mit Archiven (zeigt jede
ROM darin) und zeigt das Ergebnis sofort, ohne den kompletten Ordner zu scannen.

## 5. Ergebnisse deuten
| Status | Heißt |
|---|---|
| 🟢 **SPIELBAR** | Erfolge holbar — exakt diese ROM-Version ist bei RA registriert |
| 🔴 **KEIN MATCH** | RA kennt diesen Hash nicht → andere/abweichende Version, keine Erfolge |
| 🟡 **RAHASHER** | Disc-System/`.chd` — RAHasher installieren, dann erneut scannen |
| ⚪ **N/A / ÜBERSPRUNGEN** | kein Hash-Ziel (z. B. Disc-Track `.bin` neben `.cue`) |

> „UNKLAR" gibt es seit 0.12 nicht mehr: mehrdeutige Disc-Images werden am Inhalt erkannt.
> Ältere Sammlungs-Einträge können den Status noch tragen — ein erneuter Scan löst sie auf.

## Troubleshooting
- **Alles „KEIN MATCH"** → Hash-DB noch nicht synchronisiert (Schritt 1).
- **Disc-Spiele „RAHASHER"** → RAHasher installieren (Schritt 2).
- **Netzwerkpfad nicht lesbar** → in Windows verbunden/gemountet? Im Picker den vollen UNC-Pfad eintippen.
- **Port 8088 belegt** → in `server/config.local.json` `"port"` ändern.
- **Scan langsam** → Disc-Images (RAHasher) und große Archive brauchen länger; Datei-Cache macht Re-Scans schnell.

## Android-App

Es gibt auch eine eigenständige **Android-App** (APK auf der
[Releases-Seite](https://github.com/x3kim/RAChecker/releases), Tags `android-vX.Y.Z`).
Sie hasht **Cartridge-ROMs und Disc-Images** (CHD, ISO, CSO/ZSO, PBP) direkt auf dem Gerät,
entpackt **ZIP- und 7z-Archive** selbst, synchronisiert die RetroAchievements-Hash-Liste
on-device und gleicht offline ab — mit DE/EN, Profil (Sammlung & Insights),
Spiele-Browser nach Systemen und Entdecken.

**Nur am Desktop:** RAR-Archive, die übrigen Disc-Container (GameCube/Wii, RVZ, GCZ,
GDI, geteilte CUE/BIN, M3U), DAT-Abgleich und das Starten von Emulatoren.

> Damit Disc-Images treffen können, müssen im Tab **Hash-DB** auch die Disc-Systeme
> ausgewählt und synchronisiert sein.

Details: Abschnitt „Android app" der [Doku-Seite](https://x3kim.github.io/RAChecker/).
