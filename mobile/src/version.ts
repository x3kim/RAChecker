// Single source of truth for the mobile app version + changelog. Mirror the
// version in app.json ("version" + android.versionCode). The auto-updater
// compares this against GitHub releases tagged `android-vX.Y.Z`.
export const APP_VERSION = '0.2.0';

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
