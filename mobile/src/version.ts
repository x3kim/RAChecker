// Single source of truth for the mobile app version + changelog. Mirror the
// version in app.json ("version" + android.versionCode). The auto-updater
// compares this against GitHub releases tagged `android-vX.Y.Z`.
export const APP_VERSION = '0.4.2';

export const REPO_URL = 'https://github.com/x3kim/RAChecker';
export const DOCS_URL = 'https://x3kim.github.io/RAChecker/';
// Where the RA Web API key lives (opened from Settings).
export const RA_KEY_URL = 'https://retroachievements.org/settings';
// GitHub releases API — the updater lists releases and picks the newest
// `android-v*` tag with an .apk asset.
export const RELEASES_API = 'https://api.github.com/repos/x3kim/RAChecker/releases';

export type ChangelogEntry = { version: string; date: string; en: string[]; de: string[] };

// Newest first. `en`/`de` are bullet lists.
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.4.2',
    date: '2026-07-29',
    en: [
      '7z archives now work on the phone — RAChecker unpacks them itself and hashes the ROMs inside, including disc images, which are unpacked to temporary storage and removed again afterwards.',
      'ZIP files that use LZMA compression are now read too (some ROM sites pack that way to save space).',
      'Fixed ISO images being reported as “needs the desktop app”: the file size couldn’t always be determined, and the disc hasher gave up. Reading now uses a faster, seekable file API.',
      'A disc image that genuinely isn’t recognised now says so, instead of the misleading desktop-only note.',
      'Files are read faster overall (binary instead of base64).',
    ],
    de: [
      '7z-Archive funktionieren jetzt am Handy — RAChecker entpackt sie selbst und hasht die ROMs darin, auch Disc-Images: die werden in den temporären Speicher entpackt und danach wieder gelöscht.',
      'ZIP-Dateien mit LZMA-Kompression werden jetzt ebenfalls gelesen (manche ROM-Seiten packen so, um Platz zu sparen).',
      'Behoben: ISO-Images wurden fälschlich als „braucht die Desktop-App" gemeldet — die Dateigröße war nicht immer ermittelbar, woraufhin das Disc-Hashing abbrach. Gelesen wird jetzt über eine schnellere, springbare Datei-Schnittstelle.',
      'Ein Disc-Image, das wirklich nicht erkannt wird, sagt das jetzt auch — statt des irreführenden Desktop-Hinweises.',
      'Dateien werden insgesamt schneller gelesen (binär statt Base64).',
    ],
  },
  {
    version: '0.4.1',
    date: '2026-07-28',
    en: [
      'ROMs are now identified by their content, not by folder names: every plausible hash for a file is computed in one pass and looked up, so a correctly-dumped ROM matches no matter how you organise your collection.',
      'Unmatched files now say why — “this system isn’t synced yet” (can still match later) is no longer confused with “this dump isn’t known to RetroAchievements”.',
      '7z and RAR archives now give a clear message instead of a cryptic error; ZIP still works.',
      'Large files no longer fail to hash: files are read in slices, so multi-gigabyte ROMs and disc images work without running out of memory.',
      'Quick Wins now lists games from your collection (like the desktop app) instead of only games you already started.',
      'Fixed the Atari Lynx header check so it matches RetroAchievements exactly.',
    ],
    de: [
      'ROMs werden jetzt anhand ihres Inhalts erkannt, nicht anhand von Ordnernamen: für jede Datei werden alle plausiblen Hashes in einem Durchgang berechnet und nachgeschlagen — ein korrekt gedumptes ROM trifft also unabhängig davon, wie du deine Sammlung sortierst.',
      'Nicht-getroffene Dateien nennen jetzt den Grund — „System noch nicht synchronisiert" (kann später noch treffen) wird nicht mehr mit „dieser Dump ist RetroAchievements unbekannt" verwechselt.',
      '7z- und RAR-Archive geben jetzt eine klare Meldung statt eines kryptischen Fehlers; ZIP funktioniert weiterhin.',
      'Große Dateien scheitern nicht mehr beim Hashen: Dateien werden in Teilstücken gelesen, dadurch funktionieren auch mehrere Gigabyte große ROMs und Disc-Images ohne Speicherprobleme.',
      'Schnelle Erfolge listet jetzt Spiele aus deiner Sammlung (wie die Desktop-App) statt nur bereits begonnener Spiele.',
      'Die Atari-Lynx-Header-Prüfung korrigiert, sodass sie exakt RetroAchievements entspricht.',
    ],
  },
  {
    version: '0.4.0',
    date: '2026-07-27',
    en: [
      'On-device disc hashing — CHD, ISO and PBP disc images now hash right on your phone and match RetroAchievements, no desktop app needed. Covers PlayStation, PS2, PSP, Saturn, Sega CD, Dreamcast, PC Engine CD, PC-FX, 3DO, Neo Geo CD and Atari Jaguar CD.',
      'CHD support reads zlib- and LZMA-compressed disc images (the common space-saving format) directly.',
      'New “What’s new” popup shows the changelog once after each update.',
      'Fixed theme colours: some boxes (e.g. the Profile header) kept the blue tint after switching theme — now every panel follows the chosen theme.',
      'Replaced the Synthwave theme with Gold (matching the desktop app).',
    ],
    de: [
      'Disc-Hashing direkt auf dem Gerät — CHD-, ISO- und PBP-Disc-Images werden jetzt direkt am Handy gehasht und mit RetroAchievements abgeglichen, ganz ohne Desktop-App. Unterstützt PlayStation, PS2, PSP, Saturn, Sega CD, Dreamcast, PC Engine CD, PC-FX, 3DO, Neo Geo CD und Atari Jaguar CD.',
      'CHD-Unterstützung liest zlib- und LZMA-komprimierte Disc-Images (das gängige platzsparende Format) direkt.',
      'Neues „Neuigkeiten“-Popup zeigt den Changelog einmalig nach jedem Update.',
      'Theme-Farben korrigiert: manche Boxen (z. B. der Profil-Kopf) behielten nach dem Theme-Wechsel den blauen Ton — jetzt folgt jedes Panel dem gewählten Theme.',
      'Das Synthwave-Theme durch Gold ersetzt (wie in der Desktop-App).',
    ],
  },
  {
    version: '0.3.0',
    date: '2026-07-27',
    en: [
      'ZIP support — scanning now reads ROMs inside .zip archives and hashes each one, so zipped collections match too.',
      'Bottom tab bar no longer hides behind the Android navigation buttons (proper safe-area spacing).',
      'Disc images (CHD, CUE/BIN, ISO…) are now detected and clearly flagged as desktop-only instead of being silently ignored.',
    ],
    de: [
      'ZIP-Unterstützung — der Scan liest jetzt ROMs in .zip-Archiven und hasht jedes einzeln, sodass auch gepackte Sammlungen treffen.',
      'Die untere Tab-Leiste verschwindet nicht mehr hinter den Android-Navigationstasten (korrekter Safe-Area-Abstand).',
      'Disc-Images (CHD, CUE/BIN, ISO…) werden jetzt erkannt und klar als Desktop-only markiert, statt still ignoriert zu werden.',
    ],
  },
  {
    version: '0.2.0',
    date: '2026-07-27',
    en: [
      'German language — full DE/EN with a live switcher and a first-run picker.',
      'Games tab now browses by system with console artwork, like the desktop.',
      'Discover shows game artwork, achievement counts and authors; tapping opens game details.',
      'Profile gained Collection and Insights tabs (coverage by system, points, files).',
      'In-app changelog and an opt-in auto-updater that pulls new APKs from GitHub.',
      'Clickable link to the RetroAchievements API-key page in Settings.',
      'New app icon.',
    ],
    de: [
      'Deutsche Sprache — vollständig DE/EN mit Live-Umschalter und Erst-Start-Auswahl.',
      'Der Spiele-Tab lässt sich jetzt nach Systemen durchklicken, mit Konsolen-Artwork wie am Desktop.',
      'Entdecken zeigt Spiel-Artwork, Erfolgs-Anzahl und Autoren; Tippen öffnet die Spieldetails.',
      'Das Profil hat jetzt Sammlung- und Insights-Tabs (Abdeckung pro System, Punkte, Dateien).',
      'In-App-Changelog und ein optionaler Auto-Updater, der neue APKs von GitHub holt.',
      'Anklickbarer Link zur RetroAchievements-API-Key-Seite in den Einstellungen.',
      'Neues App-Icon und Splash-Art.',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-07-26',
    en: [
      'First Android release: on-device cartridge hashing, hash-DB sync, ROM matching.',
      'Profile, Games browser, Discover, collection and 6 CRT themes.',
    ],
    de: [
      'Erstes Android-Release: On-Device-Cartridge-Hashing, Hash-DB-Sync, ROM-Abgleich.',
      'Profil, Spiele-Browser, Entdecken, Sammlung und 6 CRT-Themes.',
    ],
  },
];
