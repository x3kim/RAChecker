// RetroAchievements genre strings mapped onto the 19 major genres defined in
// https://docs.retroachievements.org/guidelines/content/genre-definitions.html
// RA's field mostly holds subgenres ("2D Platforming", "Sports - Golf",
// "Turn-Based RPG"), far too fine-grained to sort or filter by — so the raw
// string is kept as-is and this module folds it into one major genre.

export const MAJOR_GENRES = [
  'Action-Adventure', 'Action', 'Adventure', 'Arcade', 'Board and Card', 'Educational',
  'Fighting', 'Horror', 'Literature', 'Platforming', 'Puzzle', 'Racing', 'Rhythm',
  'Role-Playing Game', 'Shooter', 'Simulation', 'Sports', 'Strategy', 'Other',
];

// Bump when the mapping changes — stored genre_major values are recomputed then.
export const GENRE_MAP_VERSION = 3;

// "Shoot 'Em Up", "shoot-em-up" and "Shoot em Up" must all hit the same entry.
function key(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '');
}

const MAJOR_BY_KEY = new Map(MAJOR_GENRES.map((g) => [key(g), g]));

export function isMajorGenre(token) {
  return MAJOR_BY_KEY.has(key(token));
}

// Exact subgenre names and alternative spellings -> major genre.
const SUBGENRES = {
  'Action-Adventure': [
    'Metroidvania', 'Open World', 'Sandbox', 'Zelda-like', 'Immersive Sim', 'Survival',
    'Action Adventure', 'Adventure Action',
  ],
  Action: [
    "Beat 'em Up", 'Brawler', 'Hack and Slash', 'Character Action', 'Stealth', 'Ninja',
  ],
  Adventure: [
    'Visual Novel', 'Point and Click', 'Point-and-Click Adventure', 'Graphic Adventure',
    'Text Adventure', 'Interactive Fiction', 'Interactive Movie', 'Escape Room', 'Mystery',
  ],
  Arcade: [
    'Breakout', 'Brick Breakers', 'Block Breaker', 'Maze', 'Maze Chase', 'Pinball',
    'Endless Runner', 'Runner', 'Whack-a-Mole', 'Single Screen', 'Minigames', 'Simon Says',
  ],
  'Board and Card': [
    'Board Game', 'Card Game', 'Collectible Card Game', 'Chess', 'Shogi', 'Shougi', 'Go',
    'Mahjong', 'Mahjong Solitaire', 'Solitaire', 'Casino', 'Gambling', 'Pachinko', 'Slots',
    'Trivia', 'Quiz', 'Game Show', 'Tabletop', 'Rock-Paper-Scissors',
  ],
  Educational: ['Edutainment', 'Typing', 'Math', 'Language Learning', 'Learning'],
  Fighting: ['Versus Fighting', 'Fighter'],
  Horror: ['Survival Horror', 'Psychological Horror'],
  Literature: ['Book', 'Gamebook', 'Digital Comic', 'Reading'],
  Platforming: ['Platform', 'Platformer', 'Collect-a-thon'],
  Puzzle: [
    'Match 3', 'Match Three', 'Tile Matching', 'Nonogram', 'Picross', 'Sokoban', 'Logic',
    'Sudoku', 'Hidden Object', 'Marble Popper', 'Word',
  ],
  Racing: ['Rally', 'Motorcycle', 'Vehicular Combat', 'Vehicle Combat'],
  Rhythm: ['Music', 'Dance', 'Karaoke'],
  'Role-Playing Game': [
    'RPG', 'JRPG', 'WRPG', 'CRPG', 'ARPG', 'SRPG', 'MMORPG', 'Dungeon Crawl', 'Dungeon Crawler',
    'Roguelike', 'Roguelite', 'Monster Collecting', 'Personalike',
  ],
  Shooter: [
    "Shoot 'Em Up", 'Shmup', 'Run and Gun', 'FPS', 'TPS', 'Light Gun', 'Light-Phaser Game',
    'Bullet Hell', 'Danmaku', 'Space Combat',
  ],
  Simulation: [
    'Farming', 'Tycoon', 'Business', 'City Builder', 'Construction and Management', 'Cooking',
    'Fishing', 'Virtual Pet', 'Photography',
  ],
  Sports: [
    'Soccer', 'Football', 'Basketball', 'Baseball', 'Golf', 'Tennis', 'Boxing', 'Wrestling',
    'Hockey', 'Bowling', 'Skateboarding', 'Snowboarding', 'Olympic', 'Volleyball', 'Cricket',
    'Rugby', 'Sumo', 'Darts', 'Pool', 'Billiards', 'Track & Field', 'Dodgeball', 'Hunting',
  ],
  Strategy: [
    'RTS', 'TBS', 'Tactics', '4X', 'Tower Defense', 'Wargame', 'Artillery', 'Auto Battler', 'MOBA',
  ],
  Other: [
    'Compilation', 'Party', 'Minigame Collection', 'Utility', 'Tool', 'Creative', 'Demo',
    'Test Kit', 'Multi-genre', 'Misc', 'Miscellaneous', 'Incremental', 'Video',
  ],
};

const SUB_BY_KEY = new Map();
for (const [major, subs] of Object.entries(SUBGENRES)) {
  for (const s of subs) SUB_BY_KEY.set(key(s), major);
}

// Fallback for RA's compound names ("2.5D Platforming", "Sports - Horse Racing",
// "Combat Flight Simulation"). Order is the priority: the first needle found in
// the normalized token decides, so "Platform Fighting" lands in Fighting and
// "Tactical Shooter" in Shooter.
const KEYWORD_RULES = [
  [['fighting', 'fighter', 'martialarts'], 'Fighting'],
  [['shooter', 'shooting', 'shootem', 'shmup', 'rungun'], 'Shooter'],
  [['rpg', 'roleplaying', 'dungeoncrawl'], 'Role-Playing Game'],
  [['platform'], 'Platforming'],
  [['puzzle', 'nonogram', 'jigsaw', 'sokoban', 'sudoku', 'match3'], 'Puzzle'],
  [['sports', 'athletic'], 'Sports'],
  [['racing', 'driving', 'vehicular', 'vehiclecombat', 'kart', 'motocross'], 'Racing'],
  [['simulation', 'simulator'], 'Simulation'],
  [['horror'], 'Horror'],
  [['strategy', 'tactic', 'towerdefense', 'wargame'], 'Strategy'],
  [['card', 'mahjong', 'solitaire', 'chess', 'trivia', 'gameshow', 'quiz', 'board', 'casino', 'gambling'], 'Board and Card'],
  [['rhythm', 'music', 'dance', 'karaoke'], 'Rhythm'],
  [['educational', 'edutainment'], 'Educational'],
  [['metroidvania', 'openworld'], 'Action-Adventure'],
  [['adventure'], 'Adventure'],
  [['maze', 'brickbreak', 'breakout', 'pinball', 'minigame', 'arcade'], 'Arcade'],
  [['beatem', 'brawler', 'hackandslash', 'stealth', 'sidescrolling'], 'Action'],
  [['action'], 'Action'],
];

function fromKeywords(k) {
  if (k.includes('action') && k.includes('adventure')) return 'Action-Adventure';
  for (const [needles, major] of KEYWORD_RULES) {
    if (needles.some((n) => k.includes(n))) return major;
  }
  return null;
}

/**
 * The major genre for a raw RA genre string ("2D Platforming, Collect-a-thon").
 * null when there is nothing to classify, 'Other' when nothing matches.
 */
export function majorGenre(genre) {
  // RA separates alternatives with commas, slashes and pipes alike.
  const keys = String(genre ?? '').split(/[,/|]/).map(key).filter(Boolean);
  if (!keys.length) return null;
  // 'Compilation' & friends only decide when nothing more specific is present:
  // "Compilation, Turn-Based RPG" is an RPG.
  let fallback = null;
  for (const k of keys) {
    const hit = MAJOR_BY_KEY.get(k);
    if (hit && hit !== 'Other') return hit;
    if (hit) fallback = hit;
  }
  for (const k of keys) {
    const hit = SUB_BY_KEY.get(k);
    if (hit && hit !== 'Other') return hit;
    if (hit) fallback = hit;
  }
  for (const k of keys) {
    const hit = fromKeywords(k);
    if (hit) return hit;
  }
  return fallback ?? 'Other';
}
