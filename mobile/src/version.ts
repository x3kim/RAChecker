// Single source of truth for the mobile app version + changelog. Mirror the
// version in app.json ("version" + android.versionCode). The auto-updater
// compares this against GitHub releases tagged `android-vX.Y.Z`.
export const APP_VERSION = '0.7.0';

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
    version: '0.7.0',
    date: '2026-08-06',
    en: [
      'The app opens on your profile, and scanning never starts on its own any more. A scan reads every file in the folder, so it now only runs when you ask for it. Both are yours to change under Settings → Scanning & start.',
      'Compressed disc images (.cso/.zso, common for PSP) hash on the device. Only the parts of the image the hash actually needs are decompressed, so it takes a moment rather than minutes.',
      'A game\'s points are right. RetroAchievements returns no point total for a game, which is why the game view could read "0 pts" while an achievement showed 3. It is now summed from the achievement set and shown with your own standing ("3 of 514 points").',
      'The achievement list can be filtered like the RetroAchievements page: missable, progression, win condition, unlocked, remaining.',
      'Achievement of the Week now names the game and the system it belongs to, and opens the game when tapped.',
    ],
    de: [
      'Die App startet mit deinem Profil, und es wird nicht mehr von selbst gescannt. Ein Scan liest jede Datei im Ordner — das passiert jetzt nur noch, wenn du es anstößt. Beides lässt sich unter Einstellungen → Scannen & Start ändern.',
      'Komprimierte Disc-Images (.cso/.zso, verbreitet bei PSP) werden auf dem Gerät gehasht. Entpackt wird nur, was der Hash wirklich braucht — daher dauert es Momente statt Minuten.',
      'Die Punkte eines Spiels stimmen. RetroAchievements liefert für ein Spiel gar keine Punktsumme, weshalb in der Spielansicht „0 pts" stehen konnte, während ein Erfolg 3 zeigte. Der Wert wird jetzt aus dem Erfolgs-Satz gerechnet und mit deinem Stand angezeigt („3 von 514 Punkten").',
      'Die Erfolgsliste lässt sich filtern wie auf der RetroAchievements-Seite: verpassbar, Fortschritt, Abschluss, erhalten, offen.',
      'Die Errungenschaft der Woche nennt jetzt Spiel und System dazu und öffnet das Spiel per Tipp.',
    ],
  },
  {
    version: '0.6.0',
    date: '2026-07-31',
    en: [
      'Every scan row now states its region and languages — regions uppercase (DE, EU, JP), languages lowercase (de, en, ja). For a ROM that matches, they come straight from RetroAchievements (solid outline): the hash identifies that exact dump, whatever the file is called. Only for unknown files is the filename read (dashed outline).',
      'New preferred order under Settings: sort regions and languages freely, e.g. "Japanese → Japan → Europe". Tap "Preferred first" above the results to sort by it.',
      'Scan results and your collection can be filtered by region or language. The chips only offer what your files actually carry.',
    ],
    de: [
      'Jede Scan-Zeile zeigt jetzt Region und Sprachen — Regionen groß (DE, EU, JP), Sprachen klein (de, en, ja). Bei einer ROM, die trifft, kommen sie direkt von RetroAchievements (durchgezogener Rahmen): der Hash identifiziert genau diesen Dump, egal wie die Datei heißt. Nur bei unbekannten Dateien wird der Dateiname gelesen (gestrichelt).',
      'Neue Wunsch-Reihenfolge in den Einstellungen: Regionen und Sprachen frei sortierbar, z. B. „Japanisch → Japan → Europa". Über den Ergebnissen auf „Wunsch zuerst" tippen, um danach zu sortieren.',
      'Scan-Ergebnisse und Sammlung lassen sich nach Region oder Sprache filtern. Die Chips zeigen nur, was in deinen Dateien wirklich steht.',
    ],
  },
  {
    version: '0.5.1',
    date: '2026-07-29',
    en: [
      'CHD files compressed with Zstandard now work. Recent versions of chdman use it by default, so many current CHDs simply failed before — and the app wrongly blamed the image ("not a recognised disc image") instead of naming the real reason.',
      'Large 7z archives no longer crawl or run out of memory: the compressed data is now read in slices instead of all at once. A 1.6 GB disc image inside a 7z went from effectively unusable to a few minutes.',
      'The scan now shows unpacking progress in percent, so a slow archive no longer looks frozen.',
      'Hash-DB counts now mean the same thing as in the desktop app (games you can earn achievements in), so the two no longer show different numbers for the same account.',
    ],
    de: [
      'CHD-Dateien mit Zstandard-Kompression funktionieren jetzt. Neuere chdman-Versionen nutzen das standardmäßig, weshalb viele aktuelle CHDs vorher schlicht fehlschlugen — und die App gab fälschlich dem Image die Schuld („kein erkanntes Disc-Image"), statt den echten Grund zu nennen.',
      'Große 7z-Archive kriechen nicht mehr bzw. sprengen nicht mehr den Speicher: die komprimierten Daten werden jetzt in Scheiben gelesen statt am Stück. Ein 1,6-GB-Disc-Image in einem 7z ging damit von praktisch unbrauchbar auf wenige Minuten.',
      'Der Scan zeigt jetzt den Entpack-Fortschritt in Prozent — ein langsames Archiv wirkt nicht mehr eingefroren.',
      'Die Hash-DB-Zahlen bedeuten jetzt dasselbe wie in der Desktop-App (Spiele, in denen du Erfolge holen kannst) — beide zeigen für dasselbe Konto keine unterschiedlichen Werte mehr.',
    ],
  },
  {
    version: '0.5.0',
    date: '2026-07-29',
    en: [
      '7z archives now work on the phone — RAChecker unpacks them itself and hashes the ROMs inside, including disc images, which are unpacked to temporary storage and removed again afterwards.',
      'Disc systems are now part of the hash sync. Without this a disc image hashed correctly but could never match anything — pick your disc systems in the Hash DB tab and re-sync.',
      'Scan results now tell the cases apart: earns achievements · recognised game with no achievement set yet · system not synced yet · not known to RetroAchievements.',
      'ZIP files that use LZMA compression are now read too (some ROM sites pack that way to save space).',
      'Fixed ISO images being reported as “needs the desktop app”: the file size couldn’t always be determined, and the disc hasher gave up. A disc image that genuinely isn’t recognised now says so.',
      'Files are read faster overall (binary instead of base64), and size is no longer a limit.',
    ],
    de: [
      '7z-Archive funktionieren jetzt am Handy — RAChecker entpackt sie selbst und hasht die ROMs darin, auch Disc-Images: die werden in den temporären Speicher entpackt und danach wieder gelöscht.',
      'Disc-Systeme sind jetzt Teil des Hash-Syncs. Ohne das wurde ein Disc-Image zwar korrekt gehasht, konnte aber nie treffen — wähle deine Disc-Systeme im Hash-DB-Tab und synchronisiere neu.',
      'Scan-Ergebnisse unterscheiden jetzt die Fälle: bringt Erfolge · erkanntes Spiel ohne Achievement-Set · System noch nicht synchronisiert · RetroAchievements unbekannt.',
      'ZIP-Dateien mit LZMA-Kompression werden jetzt ebenfalls gelesen (manche ROM-Seiten packen so, um Platz zu sparen).',
      'Behoben: ISO-Images wurden fälschlich als „braucht die Desktop-App" gemeldet — die Dateigröße war nicht immer ermittelbar, woraufhin das Disc-Hashing abbrach. Ein wirklich nicht erkanntes Disc-Image sagt das jetzt auch.',
      'Dateien werden insgesamt schneller gelesen (binär statt Base64), und die Größe ist keine Grenze mehr.',
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
