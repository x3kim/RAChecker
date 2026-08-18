// Single source of truth for the app version + changelog. The footer version
// chip opens a modal rendering CHANGELOG; package.json is kept in sync manually.
export const APP_VERSION = '0.14.0';

// GitHub repository — linked from the header (GitHub icon in the "More" menu).
export const REPO_URL = 'https://github.com/x3kim/RAChecker';
// The companion Android app ships as an APK on the GitHub releases page
// (tags android-vX.Y.Z). Linked from the "More" menu + docs.
export const ANDROID_URL = 'https://github.com/x3kim/RAChecker/releases';

export type ChangeType = 'feature' | 'improve' | 'fix';

export interface Change { type: ChangeType; de: string; en: string }
export interface Release { version: string; date: string; title?: { de: string; en: string }; changes: Change[] }

// Newest first. Dates are ISO (YYYY-MM-DD).
export const CHANGELOG: Release[] = [
  {
    version: '0.14.1',
    date: '2026-08-18',
    title: { de: 'Scan-Fortschritt, DS-ROMs, Sicherheits-Updates', en: 'Scan progress, DS ROMs, security updates' },
    changes: [
      { type: 'fix', de: 'Nintendo-DS-ROMs (.nds) landen jetzt in der Sammlung. Lag die Datei nicht in einem nach dem System benannten Ordner, galt sie als unbekannte Endung und wurde stillschweigend übergangen — verschlüsselt wie entschlüsselt. Betroffen waren auch .dsi (DSi), .wad (Wii), .woz/.po/.do/.2mg (Apple II), .sna/.cpr/.cdt (Amstrad CPC) und .d88/.d98/.cmt (PC-8801). Wie bei Disc-Images wird das System jetzt am Inhalt erkannt.', en: 'Nintendo DS ROMs (.nds) end up in your collection now. When the file did not sit in a folder named after the system, it counted as an unknown extension and was passed over silently — encrypted and decrypted alike. The same affected .dsi (DSi), .wad (Wii), .woz/.po/.do/.2mg (Apple II), .sna/.cpr/.cdt (Amstrad CPC) and .d88/.d98/.cmt (PC-8801). As with disc images, the system is now identified by the file\'s content.' },
      { type: 'fix', de: 'Der Fortschrittsbalken erreicht 100 %. Gezählt wurden bisher nur Dateien mit einem Ergebnis, gemessen aber an allen gefundenen Dateien — jede BIOS-Datei, jeder Spielstand und jede Textdatei ließ also eine Lücke stehen. Bei einer Sammlung mit vielen Nicht-ROM-Dateien blieb der Balken deutlich vor dem Ende stehen und der Scan wirkte hängengeblieben, obwohl er längst fertig war.', en: 'The progress bar reaches 100%. It counted only files that produced a result but measured against every file found, so each BIOS blob, save file and readme left a permanent gap. In a collection with many non-ROM files the bar stopped well short of the end and the scan looked stuck although it had long finished.' },
      { type: 'fix', de: 'Ein Scan bleibt nach einem Verbindungsabbruch erreichbar. Der Scan läuft im Programm, nicht im Fenster — brach die Verbindung ab (Ruhezustand, neu geladene Seite), lief er unsichtbar weiter und jeder neue Versuch wurde mit „Es läuft bereits ein Scan" abgewiesen, bei großen Sammlungen sehr lange. Das Fenster verbindet sich jetzt von selbst wieder und holt Fortschritt und bisherige Treffer nach; nach einem Neuladen führt eine Schaltfläche zurück zum laufenden Scan.', en: 'A scan stays reachable after the connection drops. The scan runs in the program, not in the window — if the connection broke (sleep, a reloaded page) it kept going invisibly and every new attempt was refused with "a scan is already running", on large collections for a very long time. The window now reconnects by itself and catches up on progress and the matches so far; after a reload a button leads back to the running scan.' },
      { type: 'improve', de: 'Sicherheits-Updates: alle bekannten Schwachstellen in den mitgelieferten Abhängigkeiten sind behoben, darunter ein Pfad-Durchgriff im Auslieferer der Oberfläche. RAChecker prüft Abhängigkeiten ab jetzt automatisch.', en: 'Security updates: every known vulnerability in the bundled dependencies is fixed, among them a path traversal in the component serving the user interface. RAChecker now checks its dependencies automatically.' },
    ],
  },
  {
    version: '0.14.0',
    date: '2026-08-06',
    title: { de: 'CSO-Images, richtige Punkte, Erfolgs-Filter', en: 'CSO images, correct points, achievement filters' },
    changes: [
      { type: 'feature', de: 'Komprimierte Disc-Images (.cso/.zso, verbreitet bei PSP und PS2) werden jetzt gehasht. RAHasher kann sie nicht öffnen und meldete „Could not open track" — RAChecker packt sie dafür kurz in eine echte ISO aus und räumt sie danach wieder weg. Der Hash ist derselbe wie beim unkomprimierten Image (gegen die RetroAchievements-Hashliste geprüft).', en: 'Compressed disc images (.cso/.zso, common for PSP and PS2) are hashed now. RAHasher cannot open them and reported "Could not open track" — RAChecker expands them into a real ISO for the moment it takes to hash, then removes it again. The hash is the same one the uncompressed image produces (verified against the RetroAchievements hash list).' },
      { type: 'fix', de: 'Die Punkte eines Spiels stimmen. RetroAchievements liefert für ein Spiel gar keine Punktsumme, weshalb im Spiel-Fenster „0" stehen konnte, obwohl einzelne Erfolge Punkte zeigten. Der Wert wird jetzt aus dem Erfolgs-Satz gerechnet und zusammen mit deinem eigenen Stand angezeigt („3 von 514 Punkten").', en: 'A game\'s points are right. RetroAchievements returns no point total for a game at all, which is why the game window could read "0" while individual achievements showed points. The value is now summed from the achievement set and shown together with your own standing ("3 of 514 points").' },
      { type: 'feature', de: 'Die Erfolgsliste lässt sich filtern — wie auf der RetroAchievements-Seite: verpassbar, Fortschritt, Abschluss, erhalten, offen. Verpassbare Erfolge sind außerdem in der Liste markiert.', en: 'The achievement list can be filtered, the same way the RetroAchievements page does it: missable, progression, win condition, unlocked, remaining. Missable achievements are also marked in the list.' },
      { type: 'feature', de: 'Der Windows-Installer fragt jetzt, ob eine Desktop-Verknüpfung und ein Startmenü-Eintrag angelegt werden sollen.', en: 'The Windows installer now asks whether to create a desktop shortcut and a Start menu entry.' },
      { type: 'improve', de: '„lokal · N Hashes gecacht" ist aus der Fußzeile verschwunden — die Zahl steht ohnehin auf der Übersicht.', en: 'The footer no longer repeats "local · N hashes cached" — the number is on the dashboard anyway.' },
    ],
  },
  {
    version: '0.13.0',
    date: '2026-07-31',
    title: { de: 'Wunsch-Region & Sprache', en: 'Preferred region & language' },
    changes: [
      { type: 'feature', de: 'Region und Sprache stehen jetzt bei jeder Datei — Regionen groß (DE, EU, JP), Sprachen klein (de, en, ja). Bei einer Datei, die trifft, kommen sie direkt von RetroAchievements: der Hash identifiziert genau diesen Dump, egal wie die Datei heißt. Nur für Dateien, die RetroAchievements nicht kennt, wird der Dateiname gelesen (No-Intro, GoodTools, TOSEC, Übersetzungs-Tags) — solche Angaben sind gestrichelt umrandet, bestätigte durchgezogen.', en: 'Every file now states its region and languages — regions uppercase (DE, EU, JP), languages lowercase (de, en, ja). For a file that matches, they come straight from RetroAchievements: the hash identifies that exact dump, whatever the file is called. Only for files RetroAchievements does not know is the filename read (No-Intro, GoodTools, TOSEC, translation tags) — those values carry a dashed outline, confirmed ones a solid one.' },
      { type: 'feature', de: 'Die offiziellen ROM-Namen holt RAChecker nach jedem Scan automatisch für die Spiele deiner Sammlung (Sekunden). Unter Einstellungen → Allgemein lässt sich die ganze Datenbank nachladen, mit Fortschritt, abbrechbar und beim nächsten Mal genau dort fortsetzend. Einmal geholte Namen bleiben gespeichert und überleben auch einen Neu-Sync der Hash-Liste.', en: 'RAChecker fetches the official ROM names automatically after every scan, for the games in your collection (seconds). Settings → General can fetch the whole database, with progress, stoppable, and resuming exactly where it stopped. Fetched names are stored and survive a re-sync of the hash list.' },
      { type: 'feature', de: 'Neue Wunsch-Reihenfolge unter Einstellungen → Allgemein: Regionen und Sprachen frei sortierbar, z. B. „Japanisch → Japan → Europa". Sie sortiert die Sammlung („Wunsch-Region zuerst"), markiert bei Duplikaten die Kopie zum Behalten und stellt in den Spiel-Details die passende ROM-Version nach oben.', en: 'New preferred order under Settings → General: sort regions and languages freely, e.g. "Japanese → Japan → Europe". It sorts the collection ("Preferred region first"), marks the copy to keep among duplicates, and puts the matching ROM version first in the game details.' },
      { type: 'feature', de: 'Die Sammlung lässt sich nach Region oder Sprache filtern. Die Auswahl zeigt nur, was du wirklich besitzt, plus „Ohne Angabe" für Dateien ohne solche Kürzel im Namen.', en: 'The collection can be filtered by region or language. The chips only offer what you actually own, plus "Not stated" for files whose name carries no such tags.' },
      { type: 'feature', de: 'Die Spiel-Details zeigen jetzt, welche Regionen RetroAchievements für dieses Spiel unterstützt, und markieren die Fassungen, die du bereits hast — die Antwort auf „gibt es hier auch eine JP-Version?".', en: 'The game details now show which regions RetroAchievements supports for that game and mark the versions you already own — the answer to "is there a JP version of this too?".' },
      { type: 'improve', de: 'Bestehende Sammlungen brauchen keinen neuen Scan: die Angaben werden beim ersten Start aus den bereits gespeicherten Namen ergänzt.', en: 'Existing collections need no re-scan: the tags are filled in from the already stored names on first start.' },
    ],
  },
  {
    version: '0.12.0',
    date: '2026-07-29',
    title: { de: 'Disc-Images ohne System-Ordner erkennen', en: 'Disc images identified without system folders' },
    changes: [
      { type: 'feature', de: 'Disc-Images (.iso/.chd/.cue) brauchen keinen nach dem System benannten Ordner mehr. Ließ sich das System nicht an der Endung ablesen, galt die Datei bisher als „unklar" mit der Bitte, den Ordner umzubenennen. Jetzt werden alle in Frage kommenden Systeme durchprobiert und das Spiel wird am Inhalt erkannt — egal wie du deine Sammlung sortierst.', en: 'Disc images (.iso/.chd/.cue) no longer need a folder named after the system. When the extension alone could not say which system a file was, it used to be marked "unclear" with a request to rename the folder. Every possible system is now tried and the game is identified by its content — however you sort your collection.' },
      { type: 'fix', de: 'Atari-Lynx-Hashes korrigiert: die Header-Kennung wurde zu kurz geprüft, wodurch bei manchen Dateien ein 64-Byte-Header entfernt wurde, den RetroAchievements behält. Betroffene Lynx-ROMs treffen jetzt korrekt.', en: 'Fixed Atari Lynx hashes: the header signature was checked too loosely, so a 64-byte header was stripped from files that RetroAchievements keeps intact. Affected Lynx ROMs now match correctly.' },
      { type: 'improve', de: 'Die System-Filter greifen bei mehrdeutigen Disc-Images jetzt, sobald eines der möglichen Systeme ausgewählt ist.', en: 'For ambiguous disc images, the system filters now apply as soon as any of the possible systems is selected.' },
    ],
  },
  {
    version: '0.11.2',
    date: '2026-07-27',
    title: { de: 'Hotfix: Desktop-App startet wieder', en: 'Hotfix: desktop app starts again' },
    changes: [
      { type: 'fix', de: 'Die installierte/portable Desktop-App aus 0.11.1 stürzte beim Start ab (interne Hashing-Komponente war nicht mitgepackt). Sie wird jetzt korrekt gebündelt — die App startet wieder normal.', en: 'The installed/portable desktop app from 0.11.1 crashed on launch (an internal hashing component was not bundled). It is now packaged correctly — the app starts normally again.' },
    ],
  },
  {
    version: '0.11.1',
    date: '2026-07-27',
    title: { de: 'Android-App & neues Logo', en: 'Android app & new logo' },
    changes: [
      { type: 'feature', de: 'RAChecker gibt es jetzt auch als eigenständige Android-App (APK) — sie hasht Cartridge-ROMs direkt auf dem Handy und gleicht offline gegen RetroAchievements ab. Verlinkt im ⋯-Menü und in der Fußzeile; Download auf der Releases-Seite.', en: 'RAChecker now also has a standalone Android app (APK) — it hashes cartridge ROMs right on your phone and matches them offline against RetroAchievements. Linked from the ⋯ menu and the footer; download on the releases page.' },
      { type: 'improve', de: 'Neues Marken-Logo als App-Icon (Desktop) und Favicon.', en: 'New brand logo as the app icon (desktop) and the favicon.' },
    ],
  },
  {
    version: '0.11.0',
    date: '2026-07-26',
    title: { de: 'DAT-Abgleich v2, Portable-Update & „Neues überspringen"', en: 'DAT check v2, portable update & skip-collected' },
    changes: [
      { type: 'feature', de: 'DAT-Abgleich unterstützt jetzt 7z- und RAR-Archive: die Prüfsumme (CRC32) wird direkt aus dem Archiv gelesen (kein Entpacken) — vorher galten Inhalte solcher Archive fälschlich als „fehlt".', en: 'DAT check now supports 7z and RAR archives: the checksum (CRC32) is read straight from the archive (no extraction) — previously such archive contents were wrongly counted as "missing".' },
      { type: 'feature', de: 'DAT-Abgleich auch über md5/sha1: DATs, die nur sha1 tragen (Redump-CHD, MAME-Disk), werden jetzt korrekt gematcht (lose Dateien werden dafür einmalig für crc+md5+sha1 gelesen). Zusätzlich Name+Größe als letzter Fallback.', en: 'DAT check also via md5/sha1: DATs that only carry sha1 (Redump CHD, MAME disk) now match correctly (loose files are read once for crc+md5+sha1). Plus name+size as a last-resort fallback.' },
      { type: 'feature', de: 'Neue Ansicht „Extra / unbekannte Dumps": Sammlungs-Dateien, deren Hash in KEINER importierten DAT steckt (Bad Dumps, Hacks/Homebrew oder Systeme ohne DAT).', en: 'New "Extra / unknown dumps" view: collection files whose hash is in NO imported DAT (bad dumps, hacks/homebrew or systems without a DAT).' },
      { type: 'improve', de: 'DAT-Parser gehärtet: ROM-Namen mit Klammern (z. B. „(USA)", „(World)") werden in ClrMamePro-DATs jetzt korrekt gelesen (vorher fielen solche Einträge raus); System-Erkennung aus No-Intro/Redump-Kopfzeilen deutlich treffsicherer; MAME-„machine"/„disk"-DATs unterstützt.', en: 'DAT parser hardened: ROM names with parentheses (e.g. "(USA)", "(World)") are now read correctly in ClrMamePro DATs (such entries used to be dropped); system detection from No-Intro/Redump headers is far more accurate; MAME "machine"/"disk" DATs supported.' },
      { type: 'feature', de: 'Portable-Version: automatische Update-Prüfung. Da sich eine laufende portable .exe unter Windows nicht selbst ersetzen kann (technische Grenze, kein Installer), lädt sie die neue Version herunter und ersetzt sich per „Neustart & ersetzen" beim nächsten Start — oder du zeigst sie dir einfach im Ordner an. (Die Installer-Version aktualisiert weiterhin voll automatisch.)', en: 'Portable build: automatic update check. Since a running portable .exe can\'t replace itself on Windows (a technical limit, no installer), it downloads the new version and swaps it in on "restart & replace" at next launch — or you just reveal it in the folder. (The installer build still updates fully automatically.)' },
      { type: 'feature', de: 'Neue Scan-Option „Bereits gesammelte Dateien überspringen" (Einstellungen → Scannen): unveränderte Dateien werden beim erneuten Scan gar nicht mehr durchlaufen oder angezeigt — der Scan zeigt nur noch wirklich neue/geänderte Dateien, unveränderte Archive werden nicht einmal geöffnet.', en: 'New scan option "Skip files already in the collection" (Settings → Scanning): unchanged files are no longer walked or shown on a re-scan — the scan surfaces only genuinely new/changed files, and unchanged archives aren\'t even opened.' },
    ],
  },
  {
    version: '0.10.0',
    date: '2026-07-25',
    title: { de: 'DAT-Abgleich, Auto-Update & Sprachwahl', en: 'DAT check, auto-update & language picker' },
    changes: [
      { type: 'feature', de: 'Neuer Bereich „DAT": Importiere No-Intro/Redump/logiqx-Kataloge und sieh pro Katalog, welche Einträge du bereits hast und welche fehlen — abgeglichen über die echte Datei-Prüfsumme (CRC32) deiner Sammlung, unabhängig vom RetroAchievements-Hash. Die Liste der fehlenden Spiele lässt sich exportieren.', en: 'New "DAT" area: import No-Intro/Redump/logiqx catalogs and see, per catalog, which entries you already have and which are missing — matched by your collection\'s real file checksum (CRC32), independent of the RetroAchievements hash. The list of missing games can be exported.' },
      { type: 'feature', de: 'Automatische Updates (Desktop-App): RAChecker prüft beim Start auf eine neue Version, lädt sie im Hintergrund und bietet unten links „Neustart & installieren". Die Web-/Startskript-Version zeigt stattdessen einen Link zur neuen Version.', en: 'Automatic updates (desktop app): RAChecker checks for a new version on launch, downloads it in the background and offers "Restart & install" bottom-left. The web/launcher build instead shows a link to the new release.' },
      { type: 'feature', de: 'Sprachauswahl beim allerersten Start (mit Flaggen). Englisch ist jetzt die Standardsprache.', en: 'Language picker on the very first launch (with flags). English is now the default language.' },
      { type: 'feature', de: 'Einstellungen → Daten & Speicher: Bilder-Cache, Sammlung & Scan-Verlauf oder die Hash-Datenbank gezielt löschen (vorher nur „Temp leeren").', en: 'Settings → Data & storage: delete the image cache, the collection & scan history, or the hash database individually (previously only "clear temp").' },
      { type: 'improve', de: 'Parallele Scan-Dateien standardmäßig auf 1 (ruhiger, klarerer Fortschritt). Hinweis: ein Archiv mit mehreren ROMs zeigt nacheinander mehrere Dateinamen — das ist kein paralleles Scannen, sondern die einzelnen Einträge im Archiv.', en: 'Parallel scan files now default to 1 (calmer, clearer progress). Note: an archive containing several ROMs shows multiple filenames in sequence — that is not parallel scanning but the individual entries inside the archive.' },
      { type: 'fix', de: 'Offline-Check „Spieldetails gecacht" ist jetzt klar formuliert („33 (nötig ≥ 24)" statt des verwirrenden „33/24"). Der Wert zählt alle gecachten Details, die Zahl dahinter ist das Minimum für deine eigenen spielbaren Spiele.', en: 'Offline check "game details cached" is now worded clearly ("33 (need ≥ 24)" instead of the confusing "33/24"). The value counts all cached details; the number after it is the minimum for your own playable games.' },
    ],
  },
  {
    version: '0.9.5',
    date: '2026-07-25',
    title: { de: 'Emulator-Setup, Vollbild-Option & zweisprachige Doku', en: 'Emulator setup, fullscreen option & bilingual docs' },
    changes: [
      { type: 'feature', de: 'Emulator einrichten leicht gemacht: Button zum Auswählen der retroarch.exe (statt Pfad tippen), „Automatisch suchen" für RetroArch + Core-Ordner, und ein Erst-Start-Popup, das das optional gleich anbietet. Die beiden RAHasher-Einstellungen sind jetzt an einer Stelle zusammengefasst (inkl. Datei-Auswahl + Auto-Suche).', en: 'Setting up an emulator made easy: a button to pick retroarch.exe (instead of typing the path), "Auto-detect" for RetroArch + core folder, and a first-run popup that offers it optionally. The two RAHasher settings are now in one place (incl. file picker + auto-detect).' },
      { type: 'feature', de: 'Neue Option „Spiel-Fenster immer im Vollbild" (Einstellungen → Allgemein).', en: 'New option "Always open game window fullscreen" (Settings → General).' },
      { type: 'improve', de: '„/" öffnet jetzt die Befehlspalette (Live-Suche über Spiele, Systeme, Aktionen) statt nur ein Suchfeld zu fokussieren.', en: '"/" now opens the command palette (live search over games, systems, actions) instead of just focusing a search field.' },
      { type: 'improve', de: 'GitHub-Link zusätzlich unten links neben der Version; „Geführte Tour" heißt jetzt kurz „Tour".', en: 'GitHub link also bottom-left next to the version; "Guided tour" is now simply "Tour".' },
      { type: 'fix', de: 'Doku-Seite: Inhalt wurde nicht angezeigt (Layout-Bug) — behoben; die Seite ist jetzt zweisprachig (Deutsch/Englisch) mit Umschalter.', en: 'Docs site: content was not showing (layout bug) — fixed; the site is now bilingual (German/English) with a switcher.' },
      { type: 'improve', de: 'Rechtliches klargestellt: „nicht mit RetroAchievements affiliiert" jetzt prominent in App, README und Doku; Verhaltenskodex (Code of Conduct) und ein kurzer Datenschutz-Hinweis ergänzt.', en: 'Legal clarified: "not affiliated with RetroAchievements" now prominent in the app, README and docs; added a Code of Conduct and a short privacy note.' },
    ],
  },
  {
    version: '0.9.4',
    date: '2026-07-25',
    title: { de: 'Schlanke Kopfleiste, mobil & Doku-Seite', en: 'Slim header, mobile & docs site' },
    changes: [
      { type: 'improve', de: 'Aufgeräumte Kopfleiste: Sprache, geführte Tour, Tastatur-Shortcuts und GitHub liegen jetzt gebündelt im „Mehr“-Menü (⋯) oben rechts.', en: 'Tidier top bar: language, guided tour, keyboard shortcuts and GitHub now live together in the "More" menu (⋯) in the top-right.' },
      { type: 'improve', de: 'Übersicht: die vier Schnellzugriffe (Scannen · Sammlung · Spiele · Hash-DB) haben kürzere Beschriftungen und ordnen sich auf dem Handy sauber an.', en: 'Dashboard: the four quick actions (Scan · Collection · Games · Hash DB) have shorter labels and lay out cleanly on phones.' },
      { type: 'fix', de: 'Mobile Darstellung: kein horizontales Verrutschen mehr (Aurora-Hintergrund und Kopfzeile korrigiert). Kopfleiste, Übersicht, Spiele, Einstellungen und Fenster passen jetzt auf schmale Bildschirme.', en: 'Mobile layout: no more horizontal drift (aurora background and header fixed). Top bar, dashboard, games, settings and dialogs now fit narrow screens.' },
      { type: 'feature', de: 'Neue Dokumentations-Seite im modernen Docs-Look (docs-site/): Installation, erster Start, Funktionen, FAQ und Fehlerbehebung — z. B. über GitHub Pages hostbar.', en: 'New documentation site with a modern docs look (docs-site/): install, first run, features, FAQ and troubleshooting — hostable e.g. via GitHub Pages.' },
      { type: 'improve', de: 'Texte durchgesehen und korrigiert (u. a. „ROMs/Ordner hier ablegen“ statt „fallen lassen“, veralteter Tour-Hinweis).', en: 'Copy reviewed and corrected (e.g. clearer drop-zone wording and a stale tour hint).' },
    ],
  },
  {
    version: '0.9.3',
    date: '2026-07-25',
    title: { de: 'Download-Zielordner für Gratis-Spiele', en: 'Download folder for free games' },
    changes: [
      { type: 'feature', de: 'Neuer „Download-Zielordner" (Einstellungen → Allgemein): lege fest, wo heruntergeladene Gratis-Spiel-ROMs liegen, und öffne ihn mit einem Klick. Im Bereich Entdecken → Gratis-Spiele zeigt RAChecker den Ordner an (oder fordert dich auf, einen festzulegen).', en: 'New "Download folder" (Settings → General): set where downloaded free-game ROMs live and open it with one click. In Discover → Free games, RAChecker shows the folder (or prompts you to pick one).' },
      { type: 'improve', de: 'Klarstellung: Die „Download"-Buttons der Gratis-Spiele führen zu den externen Seiten der Entwickler (atariage, itch.io, GitHub …). Die Datei lädst du dort selbst herunter — RAChecker kann diese Seiten nicht automatisch abgreifen. Am besten legst du den Zielordner in deinen ROM-Oberordner, dann findet der Scan die Spiele sofort.', en: 'Clarified: the free-game "Download" buttons open the developers\' external pages (atariage, itch.io, GitHub …). You download the file there yourself — RAChecker cannot scrape those pages automatically. Put the target folder inside your ROM top folder so scans pick the games up right away.' },
    ],
  },
  {
    version: '0.9.2',
    date: '2026-07-25',
    title: { de: 'Spielzeit sichern & lebendiger Bildschirmschoner', en: 'Back up playtime & a livelier screensaver' },
    changes: [
      { type: 'feature', de: 'Spielzeit-Verlauf als JSON exportieren und wieder importieren (Profil → Insights → Spielzeit) — für einen zweiten Rechner oder als getrenntes Backup. Der Import überspringt bereits vorhandene Sessions, ist also beliebig oft wiederholbar. Import geht auch, ohne das Tracking einzuschalten.', en: 'Export the playtime history as JSON and import it again (Profile → Insights → Playtime) — for a second machine or a separate backup. The import skips sessions that already exist, so it is safe to repeat. Import works even without enabling tracking.' },
      { type: 'improve', de: 'Der Bildschirmschoner (nach 90 s Inaktivität) zeigt jetzt wechselnde Live-Zahlen — Hashes, Systeme, Sammlungsgröße, Treffer mit Erfolgen und das zuletzt gefundene Spiel — statt einer festen Zeile.', en: 'The screensaver (after 90 s idle) now cycles through live numbers — hashes, systems, collection size, matches with achievements and the last game found — instead of one fixed line.' },
    ],
  },
  {
    version: '0.9.1',
    date: '2026-07-25',
    title: { de: 'Feinschliff: Einstellungen, Sortierung & Klarheit', en: 'Polish: settings, sorting & clarity' },
    changes: [
      { type: 'improve', de: 'Einstellungen aufgeräumt: „Darstellung“ ist jetzt Teil von „Allgemein“, RA-Konto und ROM-Ordner nutzen die volle Breite, und „Erweitert“ ist nicht mehr eingeklappt.', en: 'Settings tidied: "Appearance" is now part of "General", RA account and ROM folder use the full width, and "Advanced" is no longer collapsed.' },
      { type: 'feature', de: 'Spiele sortierbar: Systeme nach Name oder Spielanzahl, die Spielliste nach Punkten, Erfolgen oder Name.', en: 'Games are sortable: systems by name or game count, the game list by points, achievements or name.' },
      { type: 'improve', de: 'Entdecken → Gratis-Spiele: ein Klick auf die Karte öffnet die Details (wie überall sonst), der Extra-Button ist weg. Der Download-Button bleibt.', en: 'Discover → free games: a click on the card opens the details (like everywhere else), the extra button is gone. The download button stays.' },
      { type: 'improve', de: 'Das Ergebnis-Fenster beim manuellen Datei-Test (Drag & Drop) ist jetzt deutlich breiter.', en: 'The result window for the manual file test (drag & drop) is now much wider.' },
      { type: 'improve', de: '„Offline“-Texte klarer: die Hash-Datenbank wird einmalig geladen, danach läuft jeder Scan offline. Das Feld „Als beendet gilt nach“ hat jetzt eine Erklärung.', en: '"Offline" wording clarified: the hash database is loaded once, after that every scan runs offline. The "Consider ended after" field now has an explanation.' },
      { type: 'feature', de: 'GitHub-Link im Kopfbereich.', en: 'GitHub link in the header.' },
    ],
  },
  {
    version: '0.9.0',
    date: '2026-07-24',
    title: { de: 'Entdecken, Hardcore, Spielzeit & Emulator-Start', en: 'Discover, hardcore, playtime & emulator launch' },
    changes: [
      { type: 'feature', de: 'Neuer Bereich „Entdecken“: Gratis-Spiele (legale Homebrew-Downloads mit Achievements), Set-Radar (welche Sets gerade gebaut werden — und ob es deine ROMs betrifft) und Community (Achievement der Woche, frisch gemeisterte Spiele).', en: 'New "Discover" area: free games (legal homebrew downloads with achievements), set radar (which sets are being built right now — and whether it affects your ROMs) and community (Achievement of the Week, freshly mastered games).' },
      { type: 'feature', de: 'Hardcore-Aufholliste: zeigt für jedes Spiel, wie weit dein Hardcore-Fortschritt dem Softcore-Fortschritt hinterherhängt — eigene ROMs zuerst. Jeder Softcore-Erfolg lässt sich in Hardcore erneut holen.', en: 'Hardcore catch-up list: shows for every game how far your hardcore progress trails softcore — your own ROMs first. Every softcore unlock can be earned again in hardcore.' },
      { type: 'feature', de: 'Spielzeit-Tracking (opt-in): fragt per Rich Presence ab, was du spielst, und baut daraus eine lokale Spielzeit-Historie mit Sessions — etwas, das RetroAchievements selbst nicht speichert.', en: 'Playtime tracking (opt-in): polls Rich Presence for what you are playing and builds a local session history from it — something RetroAchievements itself does not store.' },
      { type: 'feature', de: 'Direkt starten: ROMs aus der Sammlung mit einem Klick in RetroArch öffnen, inklusive passender Core-Empfehlung pro System (Achievements/Hardcore-Tauglichkeit vermerkt).', en: 'Launch directly: open ROMs from your collection in RetroArch with one click, including the matching core recommendation per system (achievement/hardcore capability noted).' },
      { type: 'feature', de: 'Ranglisten: pro Spiel alle RA-Ranglisten mit deinem eigenen Eintrag und Platz (Ranglisten zählen nur im Hardcore-Modus).', en: 'Leaderboards: all RA leaderboards per game with your own entry and rank (leaderboards only count in hardcore mode).' },
      { type: 'feature', de: 'RA-Weltabdeckung: wie viel Prozent aller RA-Spiele, -Achievements und -Punkte deine Sammlung abdeckt, pro System aufgeschlüsselt.', en: 'RA world coverage: what percentage of all RA games, achievements and points your collection covers, broken down per system.' },
      { type: 'feature', de: 'Offline-Paket: Hash-DB, Spieldetails und Bildcache als ein Archiv exportieren/importieren — für einen zweiten Rechner oder als Vollbackup, plus Offline-Bereitschaftscheck.', en: 'Offline package: export/import hash DB, game details and image cache as one archive — for a second machine or as a full backup, plus an offline-readiness check.' },
      { type: 'feature', de: 'Mehr Export-Formate: neben RetroArch-Playlists jetzt auch ES-DE/EmulationStation, Playnite und LaunchBox. Der ES-DE-Export liefert ein ZIP mit einer gamelist.xml pro System und relativen Pfaden — genau so, wie ES-DE es erwartet.', en: 'More export formats: besides RetroArch playlists now also ES-DE/EmulationStation, Playnite and LaunchBox. The ES-DE export ships a ZIP with one gamelist.xml per system and relative paths — exactly what ES-DE expects.' },
      { type: 'fix', de: 'Geführte Tour: die Hinweisbox bleibt jetzt immer vollständig im Bild — bei Schritten am unteren Rand („Lokal & offline") ragten Weiter/Zurück vorher aus dem Fenster.', en: 'Guided tour: the hint card now always stays fully on screen — on steps anchored near the bottom edge ("Local & offline") the next/back buttons used to be cut off.' },
      { type: 'improve', de: 'Neu unterstützte Systeme werden nach einem Sync gemeldet — RetroAchievements fügt regelmäßig welche hinzu (Gamecube 2024, Wii 2026).', en: 'Newly supported systems are reported after a sync — RetroAchievements keeps adding them (GameCube 2024, Wii 2026).' },
      { type: 'improve', de: 'Versions-Finder zeigt jetzt direkt alle von RA unterstützten Datei-Versionen samt Region-Hinweis, damit „Unsupported Game Version“ erklärbar wird.', en: 'The version finder now lists every file version RA supports plus a region hint, making "Unsupported Game Version" explainable.' },
    ],
  },
  {
    version: '0.8.0',
    date: '2026-07-11',
    title: { de: 'Desktop-App, Sicherheit & Community-Release', en: 'Desktop app, security & community release' },
    changes: [
      { type: 'feature', de: 'Desktop-App: RAChecker lässt sich jetzt als eigenständige Windows-App bauen (Installer + Portable) — ein Fenster, kein Browser, keine Konsole. Anleitung: docs/BUILDING.md.', en: 'Desktop app: RAChecker can now be built as a standalone Windows app (installer + portable) — one window, no browser, no console. Guide: docs/BUILDING.md.' },
      { type: 'feature', de: 'Community-Release: MIT-Lizenz, Mitmach-Anleitung (CONTRIBUTING), automatische Tests per CI und ein Start-Skript für Linux/Mac.', en: 'Community release: MIT license, CONTRIBUTING guide, automated CI tests and a Linux/Mac launch script.' },
      { type: 'improve', de: 'Komplett offline: Schriften werden jetzt mitgeliefert statt von Google geladen — die App braucht nach dem Sync wirklich kein Internet mehr.', en: 'Fully offline: fonts now ship with the app instead of loading from Google — after syncing, the app truly needs no internet.' },
      { type: 'fix', de: 'Sicherheit: Die lokale API ist nicht mehr von fremden Webseiten aus ansprechbar (CORS nur noch localhost) und der Bild-Cache lädt nur noch von RetroAchievements-Servern.', en: 'Security: the local API can no longer be called from foreign websites (CORS restricted to localhost) and the image cache only fetches from RetroAchievements servers.' },
      { type: 'fix', de: 'Nur noch ein Scan zur Zeit: manueller Scan, Ordner-Überwachung und geplanter Scan koordinieren sich jetzt — kein doppeltes NAS-Hämmern mehr.', en: 'Only one scan at a time: manual scan, folder watch and scheduled scan now coordinate — no more double NAS hammering.' },
      { type: 'fix', de: 'Scan- und Sync-Fehler erscheinen jetzt sichtbar in der Oberfläche statt still zu verpuffen; läuft woanders schon ein Scan, sagt dir der Scan-Tab das.', en: 'Scan and sync errors now show up visibly in the UI instead of vanishing silently; if a scan is already running elsewhere, the scan tab tells you.' },
      { type: 'fix', de: 'Duplikat-Löschen: Dateien, die nicht gelöscht werden konnten (z. B. gesperrt), bleiben in der Sammlung sichtbar statt zu verschwinden.', en: 'Duplicate cleanup: files that could not be deleted (e.g. locked) stay visible in the collection instead of disappearing.' },
      { type: 'fix', de: 'Spiel-Details öffnen nicht mehr unsichtbar hinter dem Upload-Fenster; Esc schließt jetzt das oberste Fenster.', en: 'Game details no longer open invisibly behind the upload window; Esc now closes the topmost window.' },
      { type: 'improve', de: 'Licht-Design deutlich lesbarer: Kontraste, Tabellenköpfe und Hover-Effekte angepasst; rote Warn-Buttons leuchten rot; Tastatur-Fokus ist jetzt sichtbar.', en: 'Light theme far more readable: contrast, table headers and hover effects fixed; destructive buttons glow red; keyboard focus is now visible.' },
      { type: 'improve', de: 'Letzte deutsche Rest-Texte übersetzt — die englische Oberfläche ist jetzt wirklich vollständig.', en: 'Last remaining German strings translated — the English UI is now truly complete.' },
      { type: 'fix', de: 'Stabilität: Timer-Leck beim Scannen behoben, RAR-Archive brauchen nur noch halb so viel Speicher (klare Meldung bei zu großen RARs), Sammlungs-Check blockiert den Server nicht mehr bei nicht erreichbarem NAS, geplante Scans holen eine verpasste Minute nach.', en: 'Stability: fixed a timer leak while scanning, RAR archives need half the memory (clear message for oversized RARs), the collection health check no longer freezes the server when the NAS is unreachable, scheduled scans catch up a missed minute.' },
    ],
  },
  {
    version: '0.7.4',
    date: '2026-07-03',
    title: { de: 'Geplante Scans, Duplikat-Aufräumen & Bulk-Aktionen', en: 'Scheduled scans, duplicate cleanup & bulk actions' },
    changes: [
      { type: 'feature', de: 'Geplanter Scan: einmal täglich zur eingestellten Uhrzeit automatisch scannen (an/aus, Einstellungen → Scannen).', en: 'Scheduled scan: automatically scan once a day at a set time (on/off, Settings → Scanning).' },
      { type: 'feature', de: 'Duplikate: Extra-Kopien direkt löschen (behält die erste Datei) — echtes 1G1R-Aufräumen.', en: 'Duplicates: delete extra copies directly (keeps the first file) — real 1G1R cleanup.' },
      { type: 'feature', de: 'Sammlung: Mehrfachauswahl (Karten-Ansicht) → ausgewählte Dateien löschen oder Pfade kopieren.', en: 'Collection: multi-select (card view) → delete selected files or copy their paths.' },
      { type: 'improve', de: 'Speicher-Übersicht lädt schneller (kurzzeitig zwischengespeichert).', en: 'Storage overview loads faster (briefly cached).' },
      { type: 'improve', de: 'Automatische Tests für die Hash-Korrektheit (Schutz vor stillen Regressionen).', en: 'Automated tests for hash correctness (guards against silent regressions).' },
    ],
  },
  {
    version: '0.7.3',
    date: '2026-07-03',
    title: { de: 'Scan schneller, klarer & wirklich abbrechbar', en: 'Scan faster, clearer & truly cancelable' },
    changes: [
      { type: 'feature', de: 'Scan zeigt jetzt live, was er tut: entpacken · kopieren · prüfen — inkl. Fortschritt (%) bei großen Dateien.', en: 'Scan now shows live what it is doing: extracting · copying · hashing — with progress (%) for large files.' },
      { type: 'fix', de: 'Abbrechen stoppt jetzt WIRKLICH laufende Prüfungen/Kopien (RAHasher-Prozess & Kopie werden beendet) — kein Weiterlaufen im Hintergrund mehr.', en: 'Cancel now REALLY stops in-flight checks/copies (RAHasher process & copy are killed) — nothing keeps running in the background.' },
      { type: 'fix', de: 'Große Dateien werden nur noch für RAHasher-Discs lokal kopiert (nicht mehr bei normalem Hashing) — halbiert die I/O, deutlich schneller.', en: 'Large files are only copied locally for RAHasher discs (no longer for plain hashing) — halves the I/O, much faster.' },
      { type: 'fix', de: 'Kopie/Prüfung bricht nur noch bei echtem Stillstand ab (Leerlauf-Timeout) — langsame, aber stetige Übertragungen laufen durch (kein Fehl-Timeout bei 1–6 GB auf langsamem NAS).', en: 'Copy/check only times out on a real stall (idle timeout) — slow-but-steady transfers finish (no false timeout on 1–6 GB over a slow NAS).' },
      { type: 'feature', de: 'Parallele Scan-Dateien einstellbar (Einstellungen → Scannen) — bei langsamem NAS auf 1–2 senken.', en: 'Parallel scan files configurable (Settings → Scanning) — lower to 1–2 for a slow NAS.' },
      { type: 'improve', de: 'Klarere Meldung bei mehrdeutigen Disc-Images (welchen System-Ordner du brauchst).', en: 'Clearer message for ambiguous disc images (which system folder to use).' },
    ],
  },
  {
    version: '0.7.2',
    date: '2026-07-03',
    title: { de: 'Aufgeräumt: Einstellungen, Scan-Ansicht & Tour', en: 'Tidied: settings, scan view & tour' },
    changes: [
      { type: 'improve', de: 'Einstellungen als Sektionen (Allgemein · Scannen · Daten · Darstellung · Erweitert) — je eine sichtbar, viel übersichtlicher (nichts entfernt).', en: 'Settings split into sections (General · Scanning · Data · Appearance · Advanced) — one at a time, far tidier (nothing removed).' },
      { type: 'improve', de: 'Scan-Ergebnisse jetzt als Karten oder Tabelle (statt des unklaren Kompakt/Vollständig).', en: 'Scan results now as cards or table (instead of the unclear compact/full).' },
      { type: 'improve', de: 'Menüpunkt „Einzeltest" entfernt — einzelne Dateien einfach per Drag & Drop in die Seite ziehen.', en: 'Removed the "Single check" menu item — just drag single files onto the page.' },
      { type: 'fix', de: 'Geführte Tour: doppelt gezeigte Stationen entfernt (jede Station nur einmal).', en: 'Guided tour: removed duplicated stops (each stop shown once).' },
      { type: 'fix', de: 'Temporärer Speicher wird beim Start automatisch aufgeräumt (Reste abgebrochener Scans).', en: 'Temp storage is auto-cleaned on startup (leftovers from interrupted scans).' },
    ],
  },
  {
    version: '0.7.1',
    date: '2026-06-30',
    title: { de: 'Feinschliff: Ansichten, Einstellungen & Vollbild', en: 'Polish: views, settings & fullscreen' },
    changes: [
      { type: 'feature', de: 'Karten- oder Tabellen-Ansicht (umschaltbar) unter Spiele, Hash-DB, Mastery, Sammlung und Insights.', en: 'Card or table view (switchable) under Games, Hash-DB, Mastery, Collection and Insights.' },
      { type: 'feature', de: 'Große-Datei-Kopie hat jetzt eine Obergrenze + Freispeicher-Check — kopiert keine riesigen Dateien auf eine fast volle Platte.', en: 'Large-file copy now has an upper cap + free-space check — never copies huge files onto an almost-full disk.' },
      { type: 'improve', de: 'Einstellungen nutzen die volle Breite (zentriert) und sind übersichtlicher gruppiert.', en: 'Settings now use the full width (centered) and are grouped more clearly.' },
      { type: 'improve', de: 'System-Auswahl zeigt die vollen Systemnamen statt nur Kürzel.', en: 'System selection shows full system names instead of just abbreviations.' },
      { type: 'improve', de: 'Speicher-Übersicht detaillierter: erklärt „Temporär", listet die Posten auf und bietet „Temp leeren".', en: 'Storage overview more detailed: explains "Temp", lists items and offers "Clear temp".' },
      { type: 'improve', de: 'Spiel-Vollbild nutzt den Platz: mehr Spalten & Höhe für Erfolge und ROM-Versionen.', en: 'Game fullscreen uses the space: more columns & height for achievements and ROM versions.' },
    ],
  },
  {
    version: '0.7.0',
    date: '2026-06-30',
    title: { de: 'Schonende Überwachung, bessere Suche & Aufräumen', en: 'Gentle watching, better search & cleanup' },
    changes: [
      { type: 'feature', de: 'Ordner-Überwachung komplett umgebaut: an/aus + Intervall-Modus (alle N Minuten kurz prüfen statt Dauerlast) — standardmäßig AUS, schont NAS/Festplatte.', en: 'Folder watch rebuilt: on/off + interval mode (a short check every N minutes instead of constant load) — off by default, easy on NAS/disk.' },
      { type: 'feature', de: 'Große Dateien werden vor dem Hashen lokal zwischenkopiert (gegen Timeouts bei großen Images auf Netzlaufwerken) — Schwelle einstellbar.', en: 'Large files are copied to local temp before hashing (avoids timeouts for big images on network drives) — threshold configurable.' },
      { type: 'feature', de: 'System-Auswahl: lege fest, welche Systeme dich interessieren — Sync & Scan überspringen den Rest.', en: 'System selection: choose which systems you care about — sync & scan skip the rest.' },
      { type: 'feature', de: 'Spiel-Details zeigen jetzt, ob du die ROM besitzt (mit Pfad), plus Vollbild-Ansicht.', en: 'Game details now show whether you own the ROM (with path), plus a fullscreen view.' },
      { type: 'feature', de: 'Speicher-Übersicht: sehen, wie viel Datenbank, Bilder, Backups & Temp belegen.', en: 'Storage overview: see how much database, images, backups & temp use.' },
      { type: 'improve', de: 'Spiele-Suche viel treffsicherer: „oracle of ages" findet nicht mehr „Legend of Mana" (Stoppwörter ignoriert, alle Suchwörter müssen passen).', en: 'Game search far more accurate: "oracle of ages" no longer returns "Legend of Mana" (stopwords ignored, all search words must match).' },
      { type: 'improve', de: 'Spiele-Suche zeigt die Trefferanzahl an.', en: 'Game search shows the number of results.' },
      { type: 'improve', de: 'Einstellungen aufgeräumt & strukturiert; erweiterte Werte (Rate-Limit, Pfade) direkt in der App editierbar.', en: 'Settings tidied & structured; advanced values (rate limit, paths) editable right in the app.' },
      { type: 'improve', de: 'Geführte Tour erweitert; Scan-Tabelle mit kompakter/voller Ansicht.', en: 'Guided tour expanded; scan table with compact/full view.' },
    ],
  },
  {
    version: '0.6.0',
    date: '2026-06-29',
    title: { de: 'Politur, Tools & Spielereien', en: 'Polish, tools & playfulness' },
    changes: [
      { type: 'feature', de: 'Englische Übersetzung der gesamten Oberfläche (alle Ansichten), umschaltbar oben rechts.', en: 'Full English translation of the whole UI (all views), switchable top-right.' },
      { type: 'feature', de: 'Befehlspalette (Strg+K): Spiele, Aktionen & Navigation blitzschnell finden.', en: 'Command palette (Ctrl+K): find games, actions & navigation instantly.' },
      { type: 'feature', de: 'Geführte Tour erklärt die Oberfläche Schritt für Schritt.', en: 'Guided tour explains the UI step by step.' },
      { type: 'feature', de: 'Status-Box: laufender Scan/Sync/Bild-Vorladen bleibt beim Tab-Wechsel sichtbar.', en: 'Status box: a running scan/sync/image pre-load stays visible across tabs.' },
      { type: 'feature', de: 'Sammlung aufräumen: fehlende/verschobene ROMs finden & entfernen. RetroArch-Playlist (.lpl) exportieren.', en: 'Clean up collection: find & remove missing/moved ROMs. Export a RetroArch playlist (.lpl).' },
      { type: 'feature', de: 'Benachrichtigung, wenn die Ordner-Überwachung neue Treffer findet.', en: 'Notification when folder watch finds new matches.' },
      { type: 'feature', de: 'Mehr Leben: animierte Zähler, weiche Übergänge, Skeleton-Ladeanzeigen, optionaler Aurora-Hintergrund, Ring- statt Balken-Fortschritt (wählbar).', en: 'More life: animated counters, smooth transitions, skeleton loaders, optional aurora background, ring instead of bar progress (selectable).' },
      { type: 'feature', de: 'Neue interaktive Easter-Eggs: spielbares Snake (tippe „snake"), Live-CRT-Regler („crt"), steuerbarer Pac-Man („waka"), versteckte Klick-Jagd.', en: 'New interactive easter eggs: playable Snake (type "snake"), live CRT tuner ("crt"), steerable Pac-Man ("waka"), hidden click hunt.' },
      { type: 'fix', de: 'ZIPs mit LZMA-Kompression („Unknown compression method") werden jetzt über 7za entpackt.', en: 'ZIPs with LZMA compression ("Unknown compression method") are now extracted via 7za.' },
      { type: 'fix', de: 'Klarere Hashing-Fehlermeldungen; Scan-Timeout-Standard auf 10 Min angehoben (große Images auf Netzlaufwerken).', en: 'Clearer hashing error messages; default scan timeout raised to 10 min (large images on network drives).' },
    ],
  },
  {
    version: '0.5.0',
    date: '2026-06-28',
    title: { de: 'Onboarding, Diff & Offline', en: 'Onboarding, Diff & Offline' },
    changes: [
      { type: 'feature', de: 'Erst-Start-Assistent: ROM-Ordner, RA-Login und Hash-Sync in drei Schritten.', en: 'First-run wizard: ROM folder, RA login and hash sync in three steps.' },
      { type: 'feature', de: 'Sammlung-Diff: zeigt nach jedem Scan, was neu ist, jetzt Erfolge hat, verloren oder verschwunden ist.', en: 'Collection diff: after each scan, see what is new, newly playable, lost or gone.' },
      { type: 'feature', de: 'Erfolgs-Badges & Boxart lassen sich vorab lokal speichern — Spiel-Details laden danach komplett offline.', en: 'Achievement badges & box art can be pre-cached locally — game details then load fully offline.' },
      { type: 'feature', de: 'Tastatur-Shortcuts (g+Taste für Navigation, / für Suche, ? für Hilfe, Esc schließt).', en: 'Keyboard shortcuts (g+key to navigate, / to search, ? for help, Esc to close).' },
      { type: 'feature', de: 'Englische Übersetzung der Kern-Oberfläche — Sprache oben rechts umschaltbar.', en: 'English translation of the core UI — switch language top-right.' },
      { type: 'feature', de: 'Versions-Verlauf: ein Klick auf die Version unten links öffnet das Änderungsprotokoll.', en: 'Version history: click the version bottom-left to open the changelog.' },
      { type: 'feature', de: 'Neues Easter-Egg — tippe „waka". 🟡', en: 'New easter egg — type "waka". 🟡' },
    ],
  },
  {
    version: '0.4.0',
    date: '2026-06-27',
    title: { de: 'Profil-Hub & Caching', en: 'Profile hub & caching' },
    changes: [
      { type: 'feature', de: 'Profil-Hub mit Mastery, Sammlung und Insights als Unter-Tabs.', en: 'Profile hub with Mastery, Collection and Insights as sub-tabs.' },
      { type: 'feature', de: 'Quick Wins: Spiele kurz vor Mastery und schnelle Einstiege auf der Übersicht.', en: 'Quick Wins: games close to mastery and easy starts on the dashboard.' },
      { type: 'feature', de: 'Versions-Report: für „Kein Match"-ROMs die passende unterstützte RA-Version finden.', en: 'Version report: find the supported RA version for "no match" ROMs.' },
      { type: 'feature', de: 'Automatische DB-Backups (Start + nach Scan), manuell, Download und Restore.', en: 'Automatic DB backups (start + after scan), manual, download and restore.' },
      { type: 'improve', de: 'Konfigurierbare Cache-Fristen und manuelles Aktualisieren überall.', en: 'Configurable cache TTLs and manual refresh everywhere.' },
      { type: 'improve', de: 'CSV-Export für Scan und Sammlung, Sortierung und Live-Anzeige der aktuellen Datei.', en: 'CSV export for scan and collection, sorting and live current-file display.' },
    ],
  },
  {
    version: '0.3.0',
    date: '2026-06-20',
    title: { de: 'Disc-Systeme & Überwachung', en: 'Disc systems & watching' },
    changes: [
      { type: 'feature', de: 'RAHasher-Integration für Disc-Systeme (PS1, PS2, Saturn, Dreamcast …) inkl. .chd.', en: 'RAHasher integration for disc systems (PS1, PS2, Saturn, Dreamcast …) incl. .chd.' },
      { type: 'feature', de: 'Ordner-Überwachung: neue/geänderte Dateien werden automatisch geprüft.', en: 'Folder watch: new/changed files are checked automatically.' },
      { type: 'feature', de: 'Drag & Drop Schnelltest und Duplikat-Erkennung (1G1R-Helfer).', en: 'Drag & drop quick test and duplicate detection (1G1R helper).' },
      { type: 'fix', de: 'Streaming-Hashing für sehr große ROMs ohne Speicherüberlauf.', en: 'Streaming hashing for very large ROMs without memory blow-up.' },
    ],
  },
  {
    version: '0.2.0',
    date: '2026-06-12',
    title: { de: 'Sammlung & Themes', en: 'Collection & themes' },
    changes: [
      { type: 'feature', de: 'Persistente Sammlung mit Filtern nach Status und System.', en: 'Persistent collection with filters by status and system.' },
      { type: 'feature', de: 'Mehrere Retro-Themes und Schriftarten-Auswahl.', en: 'Multiple retro themes and font choices.' },
      { type: 'improve', de: 'Lokaler Bild-Cache für Icons und Boxart.', en: 'Local image cache for icons and box art.' },
    ],
  },
  {
    version: '0.1.0',
    date: '2026-06-05',
    title: { de: 'Erste Version', en: 'Initial release' },
    changes: [
      { type: 'feature', de: 'Rekursiver ROM-Scan mit RetroAchievements-Hash-Abgleich (Cartridge-Systeme, ZIP/RAR/7z).', en: 'Recursive ROM scan with RetroAchievements hash matching (cartridge systems, ZIP/RAR/7z).' },
      { type: 'feature', de: 'Lokale Hash-Datenbank pro System, Einzeltest und Scan-Verlauf.', en: 'Local per-system hash database, single check and scan history.' },
    ],
  },
];
