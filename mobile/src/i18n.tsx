// Lightweight i18n for the mobile app (mirrors the desktop's lib/i18n.ts).
// English + German dictionaries, a React context so switching language re-renders
// live, and a first-run language flag. Keys fall back EN → key so a missing
// translation never shows a blank.
import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Lang = 'en' | 'de';

const K_LANG = 'ra_lang';
const K_LANG_CHOSEN = 'ra_lang_chosen';

let _lang: Lang = 'en'; // module mirror for non-hook callers

export async function loadLang(): Promise<Lang> {
  const v = await AsyncStorage.getItem(K_LANG);
  _lang = v === 'de' ? 'de' : 'en';
  return _lang;
}
export async function saveLang(l: Lang): Promise<void> {
  _lang = l;
  await AsyncStorage.setItem(K_LANG, l);
  await AsyncStorage.setItem(K_LANG_CHOSEN, '1');
}
export async function langChosen(): Promise<boolean> {
  return (await AsyncStorage.getItem(K_LANG_CHOSEN)) === '1';
}

const EN: Record<string, string> = {
  // shell / nav
  'app.tagline': 'ROM ⇄ Achievement Scanner',
  'nav.scan': 'Scan', 'nav.games': 'Games', 'nav.discover': 'Discover',
  'nav.sync': 'Hash DB', 'nav.profile': 'Profile', 'nav.settings': 'Settings',
  // common
  'common.connect': 'Connect account', 'common.cancel': 'Cancel', 'common.delete': 'Delete',
  'common.close': 'Close', 'common.save': 'Save', 'common.retry': 'Retry', 'common.loading': 'Loading…',
  'common.pts': 'pts', 'common.achievements': 'achievements', 'common.by': 'by', 'common.later': 'Later',
  // scan
  'scan.title': 'SCAN ROMS',
  'scan.intro': 'Hash cartridge ROMs on your device and match them against the RetroAchievements database. Nothing leaves your phone except the hash lookup.',
  'scan.pickFiles': 'Pick ROMs', 'scan.pickFolder': 'Scan folder',
  'scan.scanning': 'Scanning…', 'scan.hashing': 'Hashing {name}',
  'scan.collection': 'YOUR COLLECTION', 'scan.results': 'SCAN RESULTS',
  'scan.match': 'Match', 'scan.noMatch': 'No match', 'scan.hashedSync': 'hashed · sync to match',
  'scan.error': 'Error', 'scan.clear': 'Clear', 'scan.empty': 'No ROMs scanned yet.',
  'scan.folderRemembered': 'Folder remembered — re-scanned on launch.',
  'scan.matched': '{n} matched', 'scan.of': 'of {n}',
  'scan.noHashes': 'No hashes yet — sync the hash DB first (Hash DB tab) so ROMs can match.',
  'scan.folderNote': 'Folder set · scans on launch. Tap “Scan folder” to change.',
  'scan.listing': 'Listing folder…',
  'scan.withAch': 'with achievements', 'scan.errors': 'errors',
  'scan.rowHashed': 'Hashed ✓ — sync the hash DB to check for achievements',
  'scan.rowNoMatch': 'No match — this exact dump isn’t in RetroAchievements, or the game has no achievement set',
  'scan.rowUnsynced': 'Hashed ✓ — this system isn’t synced yet. Sync it in Hash DB and it can still match.',
  'scan.tagUnsynced': 'not synced',
  'scan.archiveUnsupported': '{ext} archives can’t be opened on the phone — extract the ROM first, or use the desktop app. (ZIP and 7z work.)',
  'scan.andMore': '… and {n} more', 'scan.noRoms': 'No ROMs found in that folder.',
  'scan.zipEmpty': 'No supported ROM inside this archive.',
  'scan.discUnrecognised': 'Not a recognised disc image — no PlayStation, Saturn, Dreamcast, PC Engine, 3DO or Neo Geo signature found in it.',
  'scan.discSummary': '{n} disc image(s) not hashable here',
  'scan.discNote': 'These disc formats still need the desktop app (e.g. GameCube/Wii, CSO, RVZ, GDI, CUE/BIN). CHD, ISO and PBP now hash on-device.',
  // games
  'games.title': 'GAMES', 'games.search': 'Search games…',
  'games.systems': 'Systems', 'games.backToSystems': 'Systems',
  'games.noneYet': 'No games yet — sync the hash DB to load every RetroAchievements game.',
  'games.goSync': 'Go to Hash DB →',
  'games.noneMatch': 'No games match “{q}”.',
  'games.gamesN': '{n} games', 'games.sortPoints': 'Points', 'games.sortAch': 'Achievements', 'games.sortTitle': 'Title',
  'games.sortBy': 'Sort', 'games.inSystem': '{n} games in the hash DB',
  // discover
  'disc.free': 'Free games', 'disc.radar': 'Set radar', 'disc.community': 'Community',
  'disc.freeTitle': 'FREE / HOMEBREW GAMES',
  'disc.freeBody': 'Legally free games with achievements, curated by RetroAchievements. Download links go to the developers’ pages — RAChecker ships no ROMs.',
  'disc.searchFree': 'Search free games…',
  'disc.connectFeed': 'Connect your RA account to load the community feed.',
  'disc.radarBody': 'Achievement sets being built right now.',
  'disc.noClaims': 'No active claims.',
  'disc.aotw': 'ACHIEVEMENT OF THE WEEK',
  'disc.recent': 'Recently mastered across the community.',
  'disc.download': 'Download', 'disc.openDetails': 'Open game details',
  'disc.inYourDb': 'in hash DB', 'disc.tapDetails': 'Tap for details',
  // profile
  'prof.connectBody': 'Connect your RetroAchievements account to see your profile and progress.',
  'prof.points': 'POINTS', 'prof.rank': 'RANK', 'prof.games': 'GAMES',
  'prof.overview': 'Overview', 'prof.collection': 'Collection', 'prof.insights': 'Insights',
  'prof.mastery': 'Mastery', 'prof.hardcore': 'Hardcore',
  'prof.quickWins': 'QUICK WINS',
  'prof.noQuickWins': 'No games are close to mastery right now.',
  'prof.left': '{n} left',
  'prof.hardcoreBody': 'Games where hardcore trails softcore — re-earn these in hardcore for gold.',
  'prof.hardcoreLevel': 'Hardcore is level with softcore. 💪',
  'prof.truePoints': 'TRUE PTS',
  // profile · collection
  'prof.colFiles': 'FILES', 'prof.colMatched': 'WITH ACH.', 'prof.colPoints': 'POINTS',
  'prof.colEmpty': 'Your collection is empty. Scan some ROMs to fill it.',
  'prof.colGoScan': 'Go to Scan →',
  'prof.colTitle': 'YOUR COLLECTION',
  // profile · insights
  'ins.title': 'INSIGHTS',
  'ins.noData': 'Sync the hash DB and scan a folder to see coverage insights.',
  'ins.files': 'FILES', 'ins.withAch': 'WITH ACH.', 'ins.obtAch': 'ACHIEVEMENTS', 'ins.obtPts': 'POINTS',
  'ins.filesSub': 'in your collection', 'ins.withAchSub': '{p}% of files',
  'ins.obtAchSub': 'obtainable in your games', 'ins.obtPtsSub': 'obtainable in your games',
  'ins.bySystem': 'BY SYSTEM', 'ins.noSystemData': 'No system data yet.',
  // sync
  'sync.title': 'HASH DATABASE',
  'sync.body': 'Download the RetroAchievements hash list for cartridge systems so scanning works offline. Runs on demand — pick your systems in onboarding to make it faster.',
  'sync.start': 'Sync now', 'sync.syncing': 'Syncing…', 'sync.stats': '{g} games · {h} hashes · {c} systems',
  'sync.clear': 'Clear hash DB', 'sync.done': 'Sync complete.', 'sync.progress': '{done}/{total} systems',
  'sync.hashes': 'HASHES', 'sync.games': 'GAMES', 'sync.systems': 'SYSTEMS',
  'sync.systemsToSync': 'Systems to sync: {n}', 'sync.all': 'all',
  'sync.hide': 'Hide', 'sync.choose': 'Choose', 'sync.starting': 'starting…',
  'sync.resync': 'Re-sync', 'sync.connectFirst': 'Connect your RA account first (Settings).',
  // settings
  'set.account': 'RETROACHIEVEMENTS ACCOUNT',
  'set.keyHelp': 'Your Web API key is stored securely on this device only. Get it at retroachievements.org → Settings → Keys.',
  'set.keyLink': 'Open the API-key page ↗',
  'set.username': 'Username', 'set.keyStored': 'API key (set — enter to change)', 'set.key': 'Web API key',
  'set.keyPlaceholderUser': 'your RA username', 'set.keyStoredPh': '•••••••• stored', 'set.keyPh': 'paste your key',
  'set.saveConnect': 'Save & connect', 'set.verifying': 'Verifying…', 'set.disconnect': 'Disconnect',
  'set.connectedAs': 'Connected as {u}.', 'set.enterBoth': 'Enter username and API key.', 'set.disconnected': 'Disconnected.',
  'set.appearance': 'APPEARANCE', 'set.themeHelp': 'Pick a theme — restart the app to apply.',
  'set.themeSaved': 'Theme saved', 'set.themeSavedBody': 'Restart RAChecker to apply the new theme.',
  'set.language': 'LANGUAGE', 'set.langHelp': 'Switch instantly. English and German are fully supported.',
  'set.data': 'DATA & STORAGE',
  'set.hashes': 'HASHES', 'set.dbGames': 'GAMES', 'set.collection': 'COLLECTION',
  'set.clearHash': 'Clear hash DB', 'set.clearCol': 'Clear collection',
  'set.clearHashQ': 'Clear hash database?', 'set.clearColQ': 'Clear collection?', 'set.cannotUndo': 'This cannot be undone.',
  'set.exportCsv': 'Export collection (CSV)', 'set.preparing': 'Preparing…',
  'set.exportOk': 'Shared {n} entries.', 'set.exportFail': 'Export failed.',
  'set.about': 'ABOUT',
  'set.disclaimer': 'RAChecker is an unofficial, independent community project, not affiliated with RetroAchievements. It ships no ROMs; game data © retroachievements.org.',
  'set.desktopNote': 'There’s also a desktop app (Windows) that scans your whole ROM library, including disc systems.',
  'set.desktopLink': 'Get the desktop app ↗',
  'set.github': 'GitHub ↗', 'set.docs': 'Docs ↗', 'set.changelog': 'What’s new',
  'set.versionMobile': 'v{v} · mobile',
  // updates
  'upd.section': 'APP UPDATE',
  'upd.checking': 'Checking for updates…',
  'upd.upToDate': 'You’re on the latest version (v{v}).',
  'upd.available': 'Version {v} is available.',
  'upd.download': 'Download & install',
  'upd.downloading': 'Downloading… {p}%',
  'upd.installing': 'Opening installer…',
  'upd.failed': 'Update failed: {e}',
  'upd.check': 'Check for updates',
  'upd.auto': 'Check automatically on launch',
  'upd.bannerTitle': 'Update available — v{v}',
  'upd.bannerBody': 'A newer RAChecker APK is on GitHub.',
  'upd.notNow': 'Not now', 'upd.skip': 'Skip this version',
  'upd.notesTitle': 'What’s new in v{v}',
  // changelog
  'chg.title': 'CHANGELOG',
  // onboarding
  'onb.welcome': 'Welcome to RAChecker',
  'onb.step1': 'Connect your RetroAchievements account',
  'onb.step2': 'Pick the systems you own',
  'onb.step3': 'Sync the hash database',
  'onb.next': 'Next', 'onb.back': 'Back', 'onb.finish': 'Finish', 'onb.skip': 'Skip',
  'onb.subtitle': 'Let’s get you set up',
  'onb.s1title': '1 · Connect RetroAchievements',
  'onb.s1body': 'Your Web API key stays on this device. Get it at retroachievements.org → Settings → Keys.',
  'onb.connect': 'Connect',
  'onb.s2title': '2 · Choose your systems',
  'onb.s2body': 'Only sync the cartridge systems you own — fewer systems = faster. You can change this later.',
  'onb.nextSystems': 'Next ({n} systems)',
  'onb.s3title': '3 · Load the hash database',
  'onb.s3body': 'Downloads the RA hashes for your {n} systems so scanning works offline. Takes a moment.',
  // game detail
  'gd.title': 'GAME', 'gd.connectAch': 'Connect your RA account to see achievements.',
  'gd.unlocked': '{e}/{t} unlocked · {p}%', 'gd.leaderboards': 'LEADERBOARDS',
  'gd.lbNote': 'Leaderboards only count in hardcore mode.',
  // systems picker
  'sp.count': '{n}/{m} systems', 'sp.all': 'All', 'sp.none': 'None',
  // language gate
  'gate.title': 'Choose your language', 'gate.sub': 'You can change this any time in Settings.',
};

const DE: Record<string, string> = {
  'app.tagline': 'ROM ⇄ Achievement-Scanner',
  'nav.scan': 'Scan', 'nav.games': 'Spiele', 'nav.discover': 'Entdecken',
  'nav.sync': 'Hash-DB', 'nav.profile': 'Profil', 'nav.settings': 'Einstellungen',
  'common.connect': 'Konto verbinden', 'common.cancel': 'Abbrechen', 'common.delete': 'Löschen',
  'common.close': 'Schließen', 'common.save': 'Speichern', 'common.retry': 'Erneut', 'common.loading': 'Lädt…',
  'common.pts': 'Pkt.', 'common.achievements': 'Erfolge', 'common.by': 'von', 'common.later': 'Später',
  'scan.title': 'ROMS SCANNEN',
  'scan.intro': 'Hasht Cartridge-ROMs direkt auf dem Gerät und gleicht sie mit der RetroAchievements-Datenbank ab. Außer der Hash-Abfrage verlässt nichts dein Handy.',
  'scan.pickFiles': 'ROMs wählen', 'scan.pickFolder': 'Ordner scannen',
  'scan.scanning': 'Scanne…', 'scan.hashing': 'Hashe {name}',
  'scan.collection': 'DEINE SAMMLUNG', 'scan.results': 'SCAN-ERGEBNISSE',
  'scan.match': 'Treffer', 'scan.noMatch': 'Kein Treffer', 'scan.hashedSync': 'gehasht · für Treffer synchronisieren',
  'scan.error': 'Fehler', 'scan.clear': 'Leeren', 'scan.empty': 'Noch keine ROMs gescannt.',
  'scan.folderRemembered': 'Ordner gemerkt — beim Start neu gescannt.',
  'scan.matched': '{n} Treffer', 'scan.of': 'von {n}',
  'scan.noHashes': 'Noch keine Hashes — synchronisiere zuerst die Hash-DB (Tab Hash-DB), damit ROMs treffen können.',
  'scan.folderNote': 'Ordner gesetzt · scannt beim Start. „Ordner scannen" tippen zum Ändern.',
  'scan.listing': 'Lese Ordner…',
  'scan.withAch': 'mit Erfolgen', 'scan.errors': 'Fehler',
  'scan.rowHashed': 'Gehasht ✓ — synchronisiere die Hash-DB, um Erfolge zu prüfen',
  'scan.rowNoMatch': 'Kein Treffer — genau dieser Dump ist nicht bei RetroAchievements, oder das Spiel hat kein Achievement-Set',
  'scan.rowUnsynced': 'Gehasht ✓ — dieses System ist noch nicht synchronisiert. In der Hash-DB synchronisieren, dann kann es noch treffen.',
  'scan.tagUnsynced': 'nicht sync.',
  'scan.archiveUnsupported': '{ext}-Archive lassen sich am Handy nicht öffnen — ROM vorher entpacken oder die Desktop-App nutzen. (ZIP und 7z funktionieren.)',
  'scan.andMore': '… und {n} weitere', 'scan.noRoms': 'Keine ROMs in diesem Ordner gefunden.',
  'scan.zipEmpty': 'Kein unterstütztes ROM in diesem Archiv.',
  'scan.discUnrecognised': 'Kein erkanntes Disc-Image — darin wurde keine PlayStation-, Saturn-, Dreamcast-, PC-Engine-, 3DO- oder Neo-Geo-Signatur gefunden.',
  'scan.discSummary': '{n} Disc-Image(s) hier nicht hashbar',
  'scan.discNote': 'Diese Disc-Formate brauchen weiterhin die Desktop-App (z. B. GameCube/Wii, CSO, RVZ, GDI, CUE/BIN). CHD, ISO und PBP werden jetzt auf dem Gerät gehasht.',
  'games.title': 'SPIELE', 'games.search': 'Spiele suchen…',
  'games.systems': 'Systeme', 'games.backToSystems': 'Systeme',
  'games.noneYet': 'Noch keine Spiele — synchronisiere die Hash-DB, um alle RetroAchievements-Spiele zu laden.',
  'games.goSync': 'Zur Hash-DB →',
  'games.noneMatch': 'Keine Spiele passen zu „{q}".',
  'games.gamesN': '{n} Spiele', 'games.sortPoints': 'Punkte', 'games.sortAch': 'Erfolge', 'games.sortTitle': 'Titel',
  'games.sortBy': 'Sortieren', 'games.inSystem': '{n} Spiele in der Hash-DB',
  'disc.free': 'Gratis-Spiele', 'disc.radar': 'Set-Radar', 'disc.community': 'Community',
  'disc.freeTitle': 'GRATIS- / HOMEBREW-SPIELE',
  'disc.freeBody': 'Legal kostenlose Spiele mit Erfolgen, kuratiert von RetroAchievements. Download-Links führen zu den Entwicklerseiten — RAChecker liefert keine ROMs.',
  'disc.searchFree': 'Gratis-Spiele suchen…',
  'disc.connectFeed': 'Verbinde dein RA-Konto, um den Community-Feed zu laden.',
  'disc.radarBody': 'Achievement-Sets, die gerade gebaut werden.',
  'disc.noClaims': 'Keine aktiven Claims.',
  'disc.aotw': 'ACHIEVEMENT DER WOCHE',
  'disc.recent': 'Kürzlich in der Community gemeistert.',
  'disc.download': 'Download', 'disc.openDetails': 'Spieldetails öffnen',
  'disc.inYourDb': 'in Hash-DB', 'disc.tapDetails': 'Tippen für Details',
  'prof.connectBody': 'Verbinde dein RetroAchievements-Konto, um Profil und Fortschritt zu sehen.',
  'prof.points': 'PUNKTE', 'prof.rank': 'RANG', 'prof.games': 'SPIELE',
  'prof.overview': 'Übersicht', 'prof.collection': 'Sammlung', 'prof.insights': 'Insights',
  'prof.mastery': 'Mastery', 'prof.hardcore': 'Hardcore',
  'prof.quickWins': 'SCHNELLE ERFOLGE',
  'prof.noQuickWins': 'Gerade ist kein Spiel nah an Mastery.',
  'prof.left': 'noch {n}',
  'prof.hardcoreBody': 'Spiele, bei denen Hardcore hinter Softcore liegt — für Gold in Hardcore neu holen.',
  'prof.hardcoreLevel': 'Hardcore ist gleichauf mit Softcore. 💪',
  'prof.truePoints': 'TRUE-PKT.',
  'prof.colFiles': 'DATEIEN', 'prof.colMatched': 'MIT ERFOLGEN', 'prof.colPoints': 'PUNKTE',
  'prof.colEmpty': 'Deine Sammlung ist leer. Scanne ein paar ROMs, um sie zu füllen.',
  'prof.colGoScan': 'Zum Scan →',
  'prof.colTitle': 'DEINE SAMMLUNG',
  'ins.title': 'INSIGHTS',
  'ins.noData': 'Synchronisiere die Hash-DB und scanne einen Ordner, um Abdeckungs-Insights zu sehen.',
  'ins.files': 'DATEIEN', 'ins.withAch': 'MIT ERFOLGEN', 'ins.obtAch': 'ERFOLGE', 'ins.obtPts': 'PUNKTE',
  'ins.filesSub': 'in deiner Sammlung', 'ins.withAchSub': '{p}% der Dateien',
  'ins.obtAchSub': 'erreichbar in deinen Spielen', 'ins.obtPtsSub': 'erreichbar in deinen Spielen',
  'ins.bySystem': 'NACH SYSTEM', 'ins.noSystemData': 'Noch keine System-Daten.',
  'sync.title': 'HASH-DATENBANK',
  'sync.body': 'Lädt die RetroAchievements-Hash-Liste für Cartridge-Systeme, damit das Scannen offline funktioniert. Läuft auf Abruf — wähle im Onboarding deine Systeme, dann geht es schneller.',
  'sync.start': 'Jetzt synchronisieren', 'sync.syncing': 'Synchronisiere…', 'sync.stats': '{g} Spiele · {h} Hashes · {c} Systeme',
  'sync.clear': 'Hash-DB leeren', 'sync.done': 'Synchronisierung fertig.', 'sync.progress': '{done}/{total} Systeme',
  'sync.hashes': 'HASHES', 'sync.games': 'SPIELE', 'sync.systems': 'SYSTEME',
  'sync.systemsToSync': 'Systeme zum Synchronisieren: {n}', 'sync.all': 'alle',
  'sync.hide': 'Verbergen', 'sync.choose': 'Wählen', 'sync.starting': 'starte…',
  'sync.resync': 'Neu synchronisieren', 'sync.connectFirst': 'Verbinde zuerst dein RA-Konto (Einstellungen).',
  'set.account': 'RETROACHIEVEMENTS-KONTO',
  'set.keyHelp': 'Dein Web-API-Key wird nur sicher auf diesem Gerät gespeichert. Zu finden auf retroachievements.org → Settings → Keys.',
  'set.keyLink': 'API-Key-Seite öffnen ↗',
  'set.username': 'Benutzername', 'set.keyStored': 'API-Key (gesetzt — zum Ändern eingeben)', 'set.key': 'Web-API-Key',
  'set.keyPlaceholderUser': 'dein RA-Benutzername', 'set.keyStoredPh': '•••••••• gespeichert', 'set.keyPh': 'Key einfügen',
  'set.saveConnect': 'Speichern & verbinden', 'set.verifying': 'Prüfe…', 'set.disconnect': 'Trennen',
  'set.connectedAs': 'Verbunden als {u}.', 'set.enterBoth': 'Benutzername und API-Key eingeben.', 'set.disconnected': 'Getrennt.',
  'set.appearance': 'DARSTELLUNG', 'set.themeHelp': 'Theme wählen — zum Anwenden App neu starten.',
  'set.themeSaved': 'Theme gespeichert', 'set.themeSavedBody': 'Starte RAChecker neu, um das Theme anzuwenden.',
  'set.language': 'SPRACHE', 'set.langHelp': 'Sofort umschaltbar. Englisch und Deutsch werden vollständig unterstützt.',
  'set.data': 'DATEN & SPEICHER',
  'set.hashes': 'HASHES', 'set.dbGames': 'SPIELE', 'set.collection': 'SAMMLUNG',
  'set.clearHash': 'Hash-DB leeren', 'set.clearCol': 'Sammlung leeren',
  'set.clearHashQ': 'Hash-Datenbank leeren?', 'set.clearColQ': 'Sammlung leeren?', 'set.cannotUndo': 'Kann nicht rückgängig gemacht werden.',
  'set.exportCsv': 'Sammlung exportieren (CSV)', 'set.preparing': 'Bereite vor…',
  'set.exportOk': '{n} Einträge geteilt.', 'set.exportFail': 'Export fehlgeschlagen.',
  'set.about': 'ÜBER',
  'set.disclaimer': 'RAChecker ist ein inoffizielles, unabhängiges Community-Projekt, nicht mit RetroAchievements affiliiert. Es liefert keine ROMs; Spieldaten © retroachievements.org.',
  'set.desktopNote': 'Es gibt auch eine Desktop-App (Windows), die deine komplette ROM-Sammlung scannt — inklusive Disc-Systemen.',
  'set.desktopLink': 'Desktop-App holen ↗',
  'set.github': 'GitHub ↗', 'set.docs': 'Doku ↗', 'set.changelog': 'Neuigkeiten',
  'set.versionMobile': 'v{v} · mobil',
  'upd.section': 'APP-UPDATE',
  'upd.checking': 'Suche nach Updates…',
  'upd.upToDate': 'Du hast die neueste Version (v{v}).',
  'upd.available': 'Version {v} ist verfügbar.',
  'upd.download': 'Herunterladen & installieren',
  'upd.downloading': 'Lädt… {p}%',
  'upd.installing': 'Öffne Installer…',
  'upd.failed': 'Update fehlgeschlagen: {e}',
  'upd.check': 'Nach Updates suchen',
  'upd.auto': 'Beim Start automatisch prüfen',
  'upd.bannerTitle': 'Update verfügbar — v{v}',
  'upd.bannerBody': 'Eine neuere RAChecker-APK liegt auf GitHub.',
  'upd.notNow': 'Jetzt nicht', 'upd.skip': 'Diese Version überspringen',
  'upd.notesTitle': 'Neu in v{v}',
  'chg.title': 'CHANGELOG',
  'onb.welcome': 'Willkommen bei RAChecker',
  'onb.step1': 'Verbinde dein RetroAchievements-Konto',
  'onb.step2': 'Wähle die Systeme, die du besitzt',
  'onb.step3': 'Synchronisiere die Hash-Datenbank',
  'onb.next': 'Weiter', 'onb.back': 'Zurück', 'onb.finish': 'Fertig', 'onb.skip': 'Überspringen',
  'onb.subtitle': 'Lass uns dich einrichten',
  'onb.s1title': '1 · RetroAchievements verbinden',
  'onb.s1body': 'Dein Web-API-Key bleibt auf diesem Gerät. Zu finden auf retroachievements.org → Settings → Keys.',
  'onb.connect': 'Verbinden',
  'onb.s2title': '2 · Systeme wählen',
  'onb.s2body': 'Synchronisiere nur die Cartridge-Systeme, die du besitzt — weniger Systeme = schneller. Später änderbar.',
  'onb.nextSystems': 'Weiter ({n} Systeme)',
  'onb.s3title': '3 · Hash-Datenbank laden',
  'onb.s3body': 'Lädt die RA-Hashes für deine {n} Systeme, damit das Scannen offline funktioniert. Dauert einen Moment.',
  'gd.title': 'SPIEL', 'gd.connectAch': 'Verbinde dein RA-Konto, um Erfolge zu sehen.',
  'gd.unlocked': '{e}/{t} freigeschaltet · {p}%', 'gd.leaderboards': 'BESTENLISTEN',
  'gd.lbNote': 'Bestenlisten zählen nur im Hardcore-Modus.',
  'sp.count': '{n}/{m} Systeme', 'sp.all': 'Alle', 'sp.none': 'Keine',
  'gate.title': 'Sprache wählen', 'gate.sub': 'Jederzeit in den Einstellungen änderbar.',
};

const DICTS: Record<Lang, Record<string, string>> = { en: EN, de: DE };

export function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  let s = DICTS[lang][key] ?? EN[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  return s;
}

// The live language for non-React callers (mirrors the provider; updated by
// loadLang/saveLang). Lets plain modules like scan.ts localize their strings.
export function currentLang(): Lang { return _lang; }
export function tt(key: string, vars?: Record<string, string | number>): string {
  return translate(_lang, key, vars);
}

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (key: string, vars?: Record<string, string | number>) => string };
const I18nCtx = createContext<Ctx>({ lang: 'en', setLang: () => {}, t: (k) => k });

export function I18nProvider({ initial, children }: { initial: Lang; children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial);
  const setLang = useCallback((l: Lang) => { setLangState(l); saveLang(l); }, []);
  const t = useCallback((key: string, vars?: Record<string, string | number>) => translate(lang, key, vars), [lang]);
  return <I18nCtx.Provider value={{ lang, setLang, t }}>{children}</I18nCtx.Provider>;
}

export function useI18n(): Ctx { return useContext(I18nCtx); }
