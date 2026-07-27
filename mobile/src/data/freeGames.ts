// @ts-nocheck — ported data module (from server/src/data/free-games.js)
// Curated catalog of legally free / homebrew games that have (or may have)
// RetroAchievements sets. Source: RetroAchievements docs "Free Games" page.
// Data only — no network access at runtime.
//
// Transcribed directly from the page's rendered HTML (not from a markdown
// summary) to avoid encoding artifacts. A few author fields were lightly
// cleaned of parenthetical asides that are notes about the game rather than
// part of the author's name (e.g. NSFW warnings, "no longer available"
// remarks); nothing was invented. "Bootee" had a broken markdown link left
// in the source page's author text ("[Mojo Twins](https://www.mojontwins.com/")
// — cleaned to the intended "Mojo Twins" to match the other Mojo Twins credit
// on this same page. "Super Boss Gaiden"'s author is transcribed verbatim as
// "superfamicom.org (??)" — the "(??)" is the page authors' own uncertainty
// marker, not something we added. Every system section on the source page at
// fetch time (Atari 2600 through Virtual Boy) was retrieved in full; there
// were no truncated/missing sections.

export const FREE_GAMES_SOURCE = 'https://docs.retroachievements.org/orphaned/free-games.html';
export const FREE_GAMES_UPDATED = '2026-07-24';

// Compute a URL's hostname without a leading "www.". Returns null if the URL
// fails to parse (never guess/hardcode a host).
function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

// Raw entries as transcribed from the source page, grouped by system section
// in the same order they appear there. `host` is derived below, not typed
// here, so it can never drift from the actual url.
const RAW_ENTRIES = [
  // --- Atari 2600 ---
  { title: 'Amoeba Jump', author: 'Dionoid', url: 'http://atariage.com/forums/topic/280211-amoeba-jump/', consoleId: 25, systemLabel: 'Atari 2600' },
  { title: 'AVGN K.O. Boxing', author: 'Devin Cook', url: 'https://atariage.com/forums/topic/149089-angry-video-game-nerd-ko-boxing/', consoleId: 25, systemLabel: 'Atari 2600' },
  { title: 'Flappy', author: 'Michael Haas', url: 'https://atariage.com/forums/topic/222161-flappy-my-1st-released-game/', consoleId: 25, systemLabel: 'Atari 2600' },
  { title: 'Go Fish!', author: 'Bob Montgomery', url: 'https://www.atariage.com/software_page.php?SoftwareLabelID=2721', consoleId: 25, systemLabel: 'Atari 2600' },
  { title: 'Halo 2600', author: 'Ed Fries', url: 'https://atariage.com/forums/topic/166916-halo-for-the-2600-released-at-cge-download-the-game-here/', consoleId: 25, systemLabel: 'Atari 2600' },
  { title: 'INV+', author: 'Erik Mooney, Piero Cavina', url: 'https://atariage.com/software_page.php?SoftwareLabelID=2691', consoleId: 25, systemLabel: 'Atari 2600' },
  { title: 'Oystron', author: 'Piero Cavina', url: 'https://atariage.com/software_page.php?SoftwareLabelID=869', consoleId: 25, systemLabel: 'Atari 2600' },
  { title: 'Pac-Man 4K', author: 'Dennis Debro', url: 'https://atariage.com/forums/topic/277992-pac-man-4k-old-vs-new-clarification-2600/', consoleId: 25, systemLabel: 'Atari 2600' },
  { title: 'Princess Rescue', author: 'Chris Spry', url: 'https://atariage.com/forums/topic/215058-princess-rescue-binaries-released/', consoleId: 25, systemLabel: 'Atari 2600' },
  { title: 'Sheep It Up!', author: 'Dr. Ludos', url: 'https://drludos.itch.io/sheep-it-up-2600', consoleId: 25, systemLabel: 'Atari 2600' },
  { title: 'Snake-2600', author: 'Wickeycolombus', url: 'https://atariage.com/forums/blogs/entry/7740-snake-2600/', consoleId: 25, systemLabel: 'Atari 2600' },
  { title: 'Tetris26', author: 'Colin Hughes', url: 'https://github.com/udibr/tetris26', consoleId: 25, systemLabel: 'Atari 2600' },
  { title: 'Video Simon', author: 'Mark De Smet', url: 'https://atariage.com/software_page.php?SoftwareLabelID=873', consoleId: 25, systemLabel: 'Atari 2600' },
  { title: 'Wall Jump Ninja', author: 'Walaber', url: 'https://atariage.com/forums/topic/232200-ninja-wall-jump-game-wip/page-6#entry3154689', consoleId: 25, systemLabel: 'Atari 2600' },
  { title: 'Zippy the Porcupine', author: 'Chris Spry', url: 'https://atariage.com/forums/topic/269247-zippy-the-porcupine-binary-released/', consoleId: 25, systemLabel: 'Atari 2600' },

  // --- Game Boy ---
  { title: 'Dangan GB', author: 'snorpung', url: 'https://snorpung.itch.io/dangan-gb', consoleId: 4, systemLabel: 'Game Boy' },
  { title: 'Deadeus', author: '-IZMA-', url: 'https://izma.itch.io/deadeus', consoleId: 4, systemLabel: 'Game Boy' },
  { title: 'Deep Forest', author: 'Kevin Trepanier', url: 'https://small.itch.io/deep-forest', consoleId: 4, systemLabel: 'Game Boy' },
  { title: "Dino's Offline Adventure", author: 'gaming monster', url: 'https://gaming-monster.itch.io/dinos-offline-adventure', consoleId: 4, systemLabel: 'Game Boy' },
  { title: 'DMG Deals Damage', author: 'Dr. Ludos', url: 'https://drludos.itch.io/dmg-deals-damage', consoleId: 4, systemLabel: 'Game Boy' },
  { title: 'Flappy Boy', author: 'zurashu', url: 'https://zurashu.itch.io/flappy-boy', consoleId: 4, systemLabel: 'Game Boy' },
  { title: 'Petite Professional GB', author: 'ocarson', url: 'https://ocarson.itch.io/petite-professional-gb', consoleId: 4, systemLabel: 'Game Boy' },
  { title: "Pretty Princess' Castle Escape", author: 'sergeeo', url: 'https://sergeeo.itch.io/pretty-princess-castle-escape', consoleId: 4, systemLabel: 'Game Boy' },
  { title: 'Popcorn Caravan', author: 'cabbage', url: 'https://cabbage.itch.io/gbjam6', consoleId: 4, systemLabel: 'Game Boy' },
  { title: 'Snake', author: 'Donald Hays', url: 'https://donaldhays.com/projects/snake/', consoleId: 4, systemLabel: 'Game Boy' },
  { title: 'The Binding of Isaac: Game Boy Edition', author: 'Joshua Robertson', url: 'https://jrob774.itch.io/the-binding-of-isaac-gbjam8-edition', consoleId: 4, systemLabel: 'Game Boy' },
  { title: 'Tobu Tobu Girl', author: 'TangramGames', url: 'https://tangramgames.dk/tobutobugirl/', consoleId: 4, systemLabel: 'Game Boy' },
  { title: 'Waifu Clicker', author: 'Refresh Games', url: 'https://refreshgames.itch.io/waifu-clicker', consoleId: 4, systemLabel: 'Game Boy' },

  // --- Game Boy Color ---
  { title: 'Hong Kong 2099', author: 'Bl4h8L4hBl4h', url: 'https://bl4h8l4hbl4h.itch.io/hong-kong-2099-for-gameboy', consoleId: 6, systemLabel: 'Game Boy Color' },
  { title: 'Tobu Tobu Girl Deluxe', author: 'TangramGames', url: 'https://tangramgames.dk/tobutobugirldx/', consoleId: 6, systemLabel: 'Game Boy Color' },
  { title: 'Warp Coin Catastrophe', author: 'Proximity Sound', url: 'http://game.warp.world/', consoleId: 6, systemLabel: 'Game Boy Color' },

  // --- Game Boy Advance ---
  { title: 'Celeste Classic', author: 'Maddy Thorson and Noel Berry', url: 'https://github.com/JeffRuLz/Celeste-Classic-GBA/releases/tag/v1.0', consoleId: 5, systemLabel: 'Game Boy Advance' },
  { title: 'Pocket Meat', author: 'BomberDev', url: 'https://bomberdev.itch.io/pocket-meat', consoleId: 5, systemLabel: 'Game Boy Advance' },
  { title: 'Snakes', author: 'BadMrFrostyXXX', url: 'http://puu.sh/g3QGQ/dd42da818e.zip', consoleId: 5, systemLabel: 'Game Boy Advance' },

  // --- Nintendo DS ---
  { title: 'Anguna DS', author: 'Nathan Tolbert', url: 'https://gamebrew.org/wiki/Anguna', consoleId: 18, systemLabel: 'Nintendo DS' },
  { title: 'Bubble Wrap DS', author: 'Prodigy Games', url: 'https://www.gamebrew.org/wiki/Bubble_Wrap_DS', consoleId: 18, systemLabel: 'Nintendo DS' },
  { title: 'Crocodingus in Cube Island', author: 'PXLteam', url: 'https://gamebrew.org/wiki/Crocodingus_in_Cube_Island', consoleId: 18, systemLabel: 'Nintendo DS' },
  { title: 'EunHye DS', author: 'beadeulpiri', url: 'https://gamebrew.org/wiki/EunHye_DS', consoleId: 18, systemLabel: 'Nintendo DS' },
  { title: 'Slide Puzzles', author: 'Neumann(Puzzle), roronoa(Migraine), Dustin(15-16)', url: 'https://retroachievements.org/viewtopic.php?t=10222', consoleId: 18, systemLabel: 'Nintendo DS' },
  { title: 'Ultimate Sliding Puzzle', author: 'Kukulcan, LOBO', url: 'https://retroachievements.org/viewtopic.php?t=10793', consoleId: 18, systemLabel: 'Nintendo DS' },

  // --- Mega Drive/Genesis ---
  { title: "30 Years of Nintendon't", author: 'Dr. Ludos', url: 'https://drludos.itch.io/30-years-of-nintendont', consoleId: 1, systemLabel: 'Genesis/Mega Drive' },
  { title: 'Cave Story MD', author: 'andwn', url: 'https://github.com/andwn/cave-story-md/releases', consoleId: 1, systemLabel: 'Genesis/Mega Drive' },
  { title: 'Double Cooked', author: 'Zhamul, mipelius, Miranda', url: 'https://zhamul.itch.io/double-cooked', consoleId: 1, systemLabel: 'Genesis/Mega Drive' },
  { title: "L'ABBAYE DES MORTS", author: 'Locomalito', url: 'https://playonretro.itch.io/labbaye-des-morts-megadrivegenesis-por-002', consoleId: 1, systemLabel: 'Genesis/Mega Drive' },
  { title: 'Mega Flappy Sis', author: 'Lennart', url: 'https://harlequin.itch.io/mega-flappy-sys', consoleId: 1, systemLabel: 'Genesis/Mega Drive' },
  { title: 'Pringles Game', author: 'MtChocolate', url: 'http://68000.web.fc2.com/pringles.html', consoleId: 1, systemLabel: 'Genesis/Mega Drive' },
  { title: 'Uwol - Quest For Money', author: 'Shiru', url: 'https://shiru.untergrund.net/files/smd/uwol_quest_for_money.zip', consoleId: 1, systemLabel: 'Genesis/Mega Drive' },
  { title: 'ZOOMING SECRETARY: GOING PANIC', author: 'Playonretro', url: 'https://playonretro.itch.io/zooming-secretary-going-panic-megadrivegenesis-por-006', consoleId: 1, systemLabel: 'Genesis/Mega Drive' },

  // --- NES ---
  { title: '2048', author: 'tsone', url: 'https://www.romhacking.net/homebrew/65/', consoleId: 7, systemLabel: 'NES/Famicom' },
  { title: 'Alter Ego', author: 'Shiru', url: 'https://shiru.untergrund.net/files/nes/alter_ego.zip', consoleId: 7, systemLabel: 'NES/Famicom' },
  { title: 'Blade Buster', author: 'High Level Challenge', url: 'http://hlc6502.web.fc2.com/BB_20120301.zip', consoleId: 7, systemLabel: 'NES/Famicom' },
  { title: 'Böbl', author: 'Morphcat Games', url: 'https://neshomebrew.ca/contest19/', consoleId: 7, systemLabel: 'NES/Famicom' },
  { title: 'Bootee', author: 'Mojo Twins', url: 'https://www.mojontwins.com/juegos_mojonos/bootee-nes/', consoleId: 7, systemLabel: 'NES/Famicom' },
  { title: 'Cookie Clicker', author: 'Damian Yerrick', url: 'http://pineight.com/cookieclicker/', consoleId: 7, systemLabel: 'NES/Famicom' },
  { title: 'D-Pad Hero', author: 'Kent Hansen, Andreas Pedersen', url: 'https://dpadhero.com/Download.html', consoleId: 7, systemLabel: 'NES/Famicom' },
  { title: 'D-Pad Hero 2', author: 'Kent Hansen, Andreas Pedersen', url: 'https://dpadhero.com/Download.html', consoleId: 7, systemLabel: 'NES/Famicom' },
  { title: 'Filthy Kitchen', author: 'dustmop', url: 'https://dustmop.itch.io/filthy-kitchen', consoleId: 7, systemLabel: 'NES/Famicom' },
  { title: 'Function', author: null, url: 'http://nesdevcompo.nintendoage.com/contest14/', consoleId: 7, systemLabel: 'NES/Famicom' },
  { title: "Gotta Protectors - Amazon's Running Diet", author: 'Ancient Corp', url: 'http://www.ancient.co.jp/~game/download/GottaProtectors_AmazonsRunningDiet.zip', consoleId: 7, systemLabel: 'NES/Famicom' },
  { title: 'Gruniozerca', author: 'emunes.pl', url: 'http://emunes.pl/grunio/', consoleId: 7, systemLabel: 'NES/Famicom' },
  { title: 'Gruniozerca 2', author: null, url: 'http://nesdevcompo.nintendoage.com/contest17/', consoleId: 7, systemLabel: 'NES/Famicom' },
  { title: 'Hot Seat Harry', author: 'Memblerz', url: 'http://www.nesworld.com/article.php?system=nes&', consoleId: 7, systemLabel: 'NES/Famicom' },
  { title: 'I Wanna Flip the Sky', author: 'TomL', url: 'https://www.neoflash.com/forum/index.php?topic=7472.0_', consoleId: 7, systemLabel: 'NES/Famicom' },
  { title: 'Indivisible', author: 'Kasumi', url: 'https://kasumi.itch.io/indivisible', consoleId: 7, systemLabel: 'NES/Famicom' },
  { title: 'Lala The Magical', author: null, url: 'http://nesdevcompo.nintendoage.com/contest16/', consoleId: 7, systemLabel: 'NES/Famicom' },
  { title: 'LAN Master', author: 'Shiru', url: 'https://shiru.untergrund.net/files/nes/lan_master.zip', consoleId: 7, systemLabel: 'NES/Famicom' },
  { title: 'Lawn Mower', author: 'Shiru', url: 'https://shiru.untergrund.net/files/nes/lawn_mower.zip', consoleId: 7, systemLabel: 'NES/Famicom' },
  { title: 'Legends of Owlia, The', author: 'Gradual Games', url: 'http://www.gradualgames.com/p/the-legends-of-owlia_1.html', consoleId: 7, systemLabel: 'NES/Famicom' },
  { title: 'Lunar Limit', author: null, url: 'https://www.romhacking.net/homebrew/100/', consoleId: 7, systemLabel: 'NES/Famicom' },
  { title: 'Melo-Jellos 2', author: 'Adrian Makes Games', url: 'https://adrianmakesgames.itch.io/melo-jellos-2', consoleId: 7, systemLabel: 'NES/Famicom' },
  { title: 'Miedow', author: 'Mojo Twins', url: 'https://forums.nesdev.com/viewtopic.php?f=33&t=16889', consoleId: 7, systemLabel: 'NES/Famicom' },
  { title: 'MilioNESy', author: null, url: 'http://nesdevcompo.nintendoage.com/contest14/', consoleId: 7, systemLabel: 'NES/Famicom' },
  { title: "Nebs 'n Debs", author: null, url: 'http://nesdevcompo.nintendoage.com/contest16/', consoleId: 7, systemLabel: 'NES/Famicom' },
  { title: 'NES Virus Cleaner', author: null, url: 'https://www.romhacking.net/homebrew/32/', consoleId: 7, systemLabel: 'NES/Famicom' },
  { title: 'NeSnake 2', author: null, url: 'https://www.romhacking.net/homebrew/30/', consoleId: 7, systemLabel: 'NES/Famicom' },
  { title: 'Project Blue', author: null, url: 'http://nesdevcompo.nintendoage.com/contest17/', consoleId: 7, systemLabel: 'NES/Famicom' },
  { title: 'SplatooD', author: 'SplatooD Team', url: 'https://www.reddit.com/r/splatoon/comments/3te61d/splatood_a_splatooninspired_demake_for_the_nes/', consoleId: 7, systemLabel: 'NES/Famicom' },
  { title: 'Streemerz', author: 'Mr. Podunkian', url: 'https://www.fauxgame.com/', consoleId: 7, systemLabel: 'NES/Famicom' },
  { title: 'Sudoku: NESWORLD Edition', author: 'Al Bailey', url: 'https://www.romhacking.net/homebrew/17/', consoleId: 7, systemLabel: 'NES/Famicom' },
  { title: 'Super Bat Puncher', author: 'Morphcat Games', url: 'http://morphcat.de/superbatpuncher', consoleId: 7, systemLabel: 'NES/Famicom' },
  { title: 'Zooming Secretary', author: 'Shiru', url: 'https://shiru.untergrund.net/files/nes/zooming_secretary.zip', consoleId: 7, systemLabel: 'NES/Famicom' },

  // --- SNES ---
  { title: 'Christmas Craze', author: 'Shiru', url: 'https://www.romhacking.net/homebrew/89/', consoleId: 3, systemLabel: 'SNES/Super Famicom' },
  { title: 'Super Boss Gaiden', author: 'superfamicom.org (??)', url: 'https://superbossgaiden.superfamicom.org/', consoleId: 3, systemLabel: 'SNES/Super Famicom' },
  { title: 'Super Sudoku', author: 'Raphaël Assénat', url: 'https://www.raphnet.net/divers/retro_challenge_2019_03/index_en.php', consoleId: 3, systemLabel: 'SNES/Super Famicom' },
  { title: 'Super Road Blaster (MSU-1)', author: 'dforce3000', url: 'https://www.zeldix.net/t1448-super-road-blaster', consoleId: 3, systemLabel: 'SNES/Super Famicom' },

  // --- N64 ---
  { title: 'Pyoro 64', author: 'n64squid', url: 'https://n64squid.com/pyoro-64/', consoleId: 2, systemLabel: 'Nintendo 64' },

  // --- Virtual Boy ---
  { title: 'BLOX', author: 'KR155E', url: 'https://www.planetvb.com/modules/games/?h001g', consoleId: 28, systemLabel: 'Virtual Boy' },
  { title: 'Fishbone', author: 'thunderstruck and Virtual_Ben', url: 'https://www.planetvb.com/modules/games/?h078g', consoleId: 28, systemLabel: 'Virtual Boy' },
  { title: 'Mario Kart: Virtual Cup', author: 'DogP', url: 'https://www.planetvb.com/modules/games/?h044d', consoleId: 28, systemLabel: 'Virtual Boy' },
  { title: 'Tron', author: 'Alberto Covarrubias', url: 'https://www.planetvb.com/modules/games/?h010g', consoleId: 28, systemLabel: 'Virtual Boy' },
  { title: 'VB Racing', author: 'M.K.', url: 'https://www.planetvb.com/modules/games/?h045g', consoleId: 28, systemLabel: 'Virtual Boy' },
];

// { title, author, url, consoleId, systemLabel, host }
export const FREE_GAMES = RAW_ENTRIES.map((entry) => ({ ...entry, host: hostOf(entry.url) }));

export const FREE_GAMES_BY_CONSOLE = (() => {
  const map = new Map();
  for (const entry of FREE_GAMES) {
    const key = entry.consoleId;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(entry);
  }
  return map;
})();

export function freeGamesForConsole(id) {
  return FREE_GAMES_BY_CONSOLE.get(id) ?? [];
}