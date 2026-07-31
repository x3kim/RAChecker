// Region + language detection from ROM filenames.
//
// ROM sets bake the region and the languages into the filename, and every
// convention does it a little differently:
//
//   No-Intro / Redump  "Chrono Trigger (USA).sfc"
//                      "Zelda - Minish Cap (Europe) (En,Fr,De,Es,It).gba"
//   GoodTools          "Chrono Trigger (U) [!].smc", "Zelda (JU).gb"
//   TOSEC              "Elite (1984)(Firebird)(GB).tap"
//   Translations       "Seiken Densetsu 3 (Japan) [T+Eng1.0].sfc"
//
// RetroAchievements names its own hash entries the No-Intro way, so the very
// same parser reads RA's rom names as well as the user's files. Nothing here
// touches the filesystem — it is pure string work, shared by desktop and mobile.
//
// Region codes are short and uppercase (JP/US/EU/...), language codes are
// lowercase ISO-639-1 (ja/en/de/...). They deliberately live in one flat
// vocabulary so a single ordered priority list can mix both (see rankTokens).

// Bumped whenever the parsing itself changes. Stored values were produced by an
// older version and are re-derived from the names we already have (no network,
// no re-scan) when this number moves.
export const TAG_PARSER_VERSION = 2;

// ---- vocabulary -----------------------------------------------------------

// Canonical region codes and their English names. The UI shows the code as the
// chip and the name as its tooltip, so this needs no translation.
/** @type {Record<string, string>} */
export const REGION_NAMES = {
  JP: 'Japan',
  US: 'USA',
  EU: 'Europe',
  WORLD: 'World',
  AS: 'Asia',
  AU: 'Australia',
  BR: 'Brazil',
  CA: 'Canada',
  CN: 'China',
  KR: 'Korea',
  TW: 'Taiwan',
  HK: 'Hong Kong',
  RU: 'Russia',
  UK: 'United Kingdom',
  DE: 'Germany',
  FR: 'France',
  ES: 'Spain',
  IT: 'Italy',
  NL: 'Netherlands',
  SE: 'Sweden',
  NO: 'Norway',
  DK: 'Denmark',
  FI: 'Finland',
  PL: 'Poland',
  PT: 'Portugal',
  GR: 'Greece',
  IN: 'India',
  IL: 'Israel',
  MX: 'Mexico',
  AR: 'Argentina',
  NZ: 'New Zealand',
  ZA: 'South Africa',
  TR: 'Turkey',
  AT: 'Austria',
  BE: 'Belgium',
  LATAM: 'Latin America',
  SCN: 'Scandinavia',
  UNK: 'Unknown region',
};

// The order the UI offers regions in when nothing is configured yet — the ones
// people actually own come first.
/** @type {string[]} */
export const REGION_ORDER = [
  'JP', 'US', 'EU', 'WORLD', 'AS', 'AU', 'BR', 'KR', 'CN', 'TW', 'HK', 'CA',
  'UK', 'DE', 'FR', 'ES', 'IT', 'NL', 'SE', 'NO', 'DK', 'FI', 'PL', 'PT',
  'GR', 'RU', 'IN', 'IL', 'MX', 'AR', 'NZ', 'ZA', 'TR', 'AT', 'BE',
  'LATAM', 'SCN', 'UNK',
];

// Full region names as written by No-Intro / Redump, lowercased.
const FULL_NAMES = {
  japan: 'JP', 'japan (english)': 'JP',
  usa: 'US', 'united states': 'US', 'usa (english)': 'US',
  europe: 'EU',
  world: 'WORLD',
  asia: 'AS',
  australia: 'AU',
  brazil: 'BR',
  canada: 'CA',
  china: 'CN',
  korea: 'KR', 'south korea': 'KR',
  taiwan: 'TW',
  'hong kong': 'HK',
  russia: 'RU',
  uk: 'UK', 'united kingdom': 'UK', 'great britain': 'UK', england: 'UK', ireland: 'UK',
  germany: 'DE',
  france: 'FR',
  spain: 'ES',
  italy: 'IT',
  netherlands: 'NL', holland: 'NL',
  sweden: 'SE',
  norway: 'NO',
  denmark: 'DK',
  finland: 'FI',
  poland: 'PL',
  portugal: 'PT',
  greece: 'GR',
  india: 'IN',
  israel: 'IL',
  mexico: 'MX',
  argentina: 'AR',
  'new zealand': 'NZ',
  'south africa': 'ZA',
  turkey: 'TR',
  austria: 'AT',
  belgium: 'BE',
  switzerland: 'AT',
  'latin america': 'LATAM',
  scandinavia: 'SCN',
  unknown: 'UNK',
};

// Short set codes: GoodTools single letters and combos, plus the ISO-ish
// two-letter codes TOSEC writes in caps. Looked up with the tag uppercased.
// Deliberately absent: CH (GoodTools "China" vs ISO "Switzerland" — ambiguous
// enough that guessing wrong is worse than not guessing).
const SHORT_CODES = {
  J: ['JP'], U: ['US'], E: ['EU'], W: ['WORLD'],
  F: ['FR'], G: ['DE'], I: ['IT'], S: ['ES'],
  A: ['AU'], B: ['BR'], C: ['CN'], K: ['KR'],
  JU: ['JP', 'US'], JE: ['JP', 'EU'], UE: ['US', 'EU'], JUE: ['JP', 'US', 'EU'],
  UNK: ['UNK'],
  SW: ['SE'], HK: ['HK'], NL: ['NL'], KR: ['KR'], CN: ['CN'], TW: ['TW'],
  JP: ['JP'], US: ['US'], EU: ['EU'], GB: ['UK'], UK: ['UK'],
  DE: ['DE'], FR: ['FR'], ES: ['ES'], IT: ['IT'], SE: ['SE'], NO: ['NO'],
  DK: ['DK'], FI: ['FI'], PL: ['PL'], PT: ['PT'], GR: ['GR'], RU: ['RU'],
  BR: ['BR'], AU: ['AU'], CA: ['CA'], AT: ['AT'], BE: ['BE'], IN: ['IN'],
  IL: ['IL'], MX: ['MX'], AR: ['AR'], NZ: ['NZ'], ZA: ['ZA'], TR: ['TR'],
  AS: ['AS'],
};

// ISO-639-1 codes that show up in No-Intro language lists.
const LANGS = new Set([
  'en', 'ja', 'fr', 'de', 'es', 'it', 'nl', 'pt', 'sv', 'no', 'da', 'fi',
  'zh', 'ko', 'pl', 'ru', 'cs', 'hu', 'el', 'tr', 'ar', 'he', 'ca', 'sl',
  'hr', 'sr', 'uk', 'ro', 'bg', 'et', 'lv', 'lt', 'sk', 'th', 'vi', 'id',
  'ms', 'hi', 'ga', 'cy', 'eu', 'gl', 'af', 'is', 'fa', 'la', 'mk', 'sq',
  'be', 'bs', 'ka', 'hy', 'az', 'kk', 'mn', 'ta', 'te', 'ur', 'bn',
]);

// English names for the language codes we actually surface, so a chip can carry
// a tooltip. Anything missing falls back to the bare code.
/** @type {Record<string, string>} */
export const LANGUAGE_NAMES = {
  en: 'English', ja: 'Japanese', fr: 'French', de: 'German', es: 'Spanish',
  it: 'Italian', nl: 'Dutch', pt: 'Portuguese', sv: 'Swedish', no: 'Norwegian',
  da: 'Danish', fi: 'Finnish', zh: 'Chinese', ko: 'Korean', pl: 'Polish',
  ru: 'Russian', cs: 'Czech', hu: 'Hungarian', el: 'Greek', tr: 'Turkish',
  ar: 'Arabic', he: 'Hebrew', ca: 'Catalan', uk: 'Ukrainian', ro: 'Romanian',
};

// GoodTools three-letter codes used inside translation markers: [T+Eng1.0].
const TRANSLATION_LANGS = {
  eng: 'en', ger: 'de', fre: 'fr', spa: 'es', ita: 'it', por: 'pt', dut: 'nl',
  swe: 'sv', nor: 'no', dan: 'da', fin: 'fi', chi: 'zh', kor: 'ko', rus: 'ru',
  pol: 'pl', jap: 'ja', cze: 'cs', hun: 'hu', gre: 'el', tur: 'tr', heb: 'he',
  cat: 'ca', dut2: 'nl',
};

// ---- parsing --------------------------------------------------------------

// Last path segment, also stripping the "archive.zip › inner.nes" display form
// the scanners use so an archive member is judged by its own name.
export function romBasename(p) {
  let s = String(p ?? '');
  const arrow = s.lastIndexOf('›'); // ›
  if (arrow >= 0) s = s.slice(arrow + 1);
  const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
  if (i >= 0) s = s.slice(i + 1);
  return s.trim();
}

// Drop a trailing file extension — but only something that actually looks like
// one. A greedy /\.[^.]+$/ would eat the whole tail of a name that contains a
// dot and has no extension at all: RetroAchievements stores disc entries as
// "Spy vs. Spy (Europe) (En,Fr,De,Es)", where it would strip from "vs." onwards
// and throw the region away.
function stripExtension(s) {
  return s.replace(/\.[A-Za-z0-9_]{1,8}$/, '');
}

// Every bracketed tag in the filename, keeping the bracket kind. GoodTools puts
// the region in (parens) and the dump flags in [brackets] — "[a]" is "alternate
// dump", not Australia — so the two are never treated alike.
function tagsOf(name) {
  const stem = stripExtension(romBasename(name));
  const out = [];
  const re = /([([])([^)\]]*)[)\]]/g;
  let m;
  while ((m = re.exec(stem)) !== null) {
    const value = m[2].trim();
    if (value) out.push({ paren: m[1] === '(', value });
  }
  return out;
}

function push(list, value) {
  if (value && !list.includes(value)) list.push(value);
}

/**
 * Parse a ROM filename into regions + languages.
 * @param {string} name  filename, path, or "archive.zip › member.nes"
 * @returns {{regions: string[], languages: string[]}} both possibly empty
 */
export function parseRomTags(name) {
  const regions = [];
  const languages = [];

  for (const { paren, value } of tagsOf(name)) {
    // Translation markers live in square brackets: [T+Eng], [T-Ger1.0].
    const tr = /^T[+-]\s*([A-Za-z]{3})/.exec(value);
    if (tr) { push(languages, TRANSLATION_LANGS[tr[1].toLowerCase()]); continue; }
    if (!paren) continue; // any other [flag] says nothing about region/language

    const parts = value.split(',').map((s) => s.trim()).filter(Boolean);

    // "(Japan, USA)" — every part must be a region name, otherwise the tag is
    // something else entirely ("(Rev 1)", "(Konami, 1989)").
    const named = parts.map((p) => FULL_NAMES[p.toLowerCase()]);
    if (named.length && named.every(Boolean)) { for (const r of named) push(regions, r); continue; }

    // "(En,Fr,De)" — No-Intro writes language codes capitalised, TOSEC writes
    // country codes in caps ("(DE)"), which is exactly how the two are told
    // apart here.
    if (parts.length && parts.every((p) => /^[A-Z][a-z]$/.test(p) && LANGS.has(p.toLowerCase()))) {
      for (const p of parts) push(languages, p.toLowerCase());
      continue;
    }

    // "(U)", "(JU)", "(JP)", "(GB)" — set-specific short codes.
    const short = SHORT_CODES[value.toUpperCase()];
    if (short) { for (const r of short) push(regions, r); }
  }

  return { regions, languages };
}

// ---- priority -------------------------------------------------------------

// A priority list mixes region codes ("JP") with language tokens ("L:ja") so a
// single ordered list can express "Japanese audio first, then anything from
// Japan, then Europe". Everything the parser produces is turned into the same
// token vocabulary here.
export const LANG_PREFIX = 'L:';

export function langToken(code) { return LANG_PREFIX + String(code).toLowerCase(); }
export function isLangToken(tok) { return String(tok).startsWith(LANG_PREFIX); }
export function tokenCode(tok) { return isLangToken(tok) ? String(tok).slice(LANG_PREFIX.length) : String(tok); }

// Human label for a token, used for chips and the settings list. Regions stay
// uppercase and languages go lowercase, following the ISO convention — without
// that, Germany and German would both read "DE" on a badge.
export function tokenLabel(tok) {
  const code = tokenCode(tok);
  return isLangToken(tok) ? code.toLowerCase() : code;
}
export function tokenName(tok) {
  const code = tokenCode(tok);
  return isLangToken(tok) ? (LANGUAGE_NAMES[code] ?? code.toUpperCase()) : (REGION_NAMES[code] ?? code);
}

// Flatten a parse result into priority tokens.
/**
 * @param {{regions?: string[], languages?: string[]}} [tags]
 * @returns {string[]}
 */
export function tagTokens(tags = {}) {
  const { regions = [], languages = [] } = tags;
  return [...regions, ...languages.map(langToken)];
}

/**
 * Position of an entry in the user's priority list: the best (lowest) index any
 * of its tokens reaches. Entries that match nothing sort after everything that
 * does, which keeps an unconfigured priority list from reordering anything.
 * @returns {number} index, or Number.MAX_SAFE_INTEGER when nothing matches
 */
/**
 * @param {string[]|null|undefined} tokens
 * @param {string[]|null|undefined} priority
 */
export function rankTokens(tokens, priority) {
  if (!Array.isArray(priority) || priority.length === 0) return Number.MAX_SAFE_INTEGER;
  let best = Number.MAX_SAFE_INTEGER;
  for (const tok of tokens || []) {
    const i = priority.indexOf(tok);
    if (i >= 0 && i < best) best = i;
  }
  return best;
}

// Convenience: rank a filename directly.
export function rankFilename(name, priority) {
  return rankTokens(tagTokens(parseRomTags(name)), priority);
}

// Serialise for the SQLite columns. '' means "parsed, found nothing" — distinct
// from NULL, which means "never parsed" and is what the backfill looks for.
/**
 * @param {{regions?: string[], languages?: string[]}} [tags]
 * @returns {{region: string, langs: string}}
 */
export function packTags(tags = {}) {
  const { regions = [], languages = [] } = tags;
  return { region: regions.join(','), langs: languages.join(',') };
}
/**
 * @param {{region?: string|null, langs?: string|null}} [row]
 * @returns {{regions: string[], languages: string[]}}
 */
export function unpackTags(row = {}) {
  const split = (v) => String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return { regions: split(row.region), languages: split(row.langs) };
}
