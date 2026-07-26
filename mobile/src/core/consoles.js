// VENDORED COPY of packages/core/hash/consoles.js — keep in sync (source of
// truth is packages/core). Minimal cartridge ext -> { consoleId, headerRule }.
const EXT = {
  '.nes': { consoleId: 7,  headerRule: 'nes' },
  '.fds': { consoleId: 81, headerRule: 'nes' },
  '.sfc': { consoleId: 3,  headerRule: 'snes' },
  '.smc': { consoleId: 3,  headerRule: 'snes' },
  '.n64': { consoleId: 2,  headerRule: 'n64' },
  '.v64': { consoleId: 2,  headerRule: 'n64' },
  '.z64': { consoleId: 2,  headerRule: 'n64' },
  '.gb':  { consoleId: 4,  headerRule: null },
  '.gbc': { consoleId: 6,  headerRule: null },
  '.gba': { consoleId: 5,  headerRule: null },
  '.md':  { consoleId: 1,  headerRule: null },
  '.gen': { consoleId: 1,  headerRule: null },
  '.sms': { consoleId: 11, headerRule: null },
  '.gg':  { consoleId: 15, headerRule: null },
  '.lnx': { consoleId: 13, headerRule: 'lynx' },
  '.pce': { consoleId: 8,  headerRule: 'pce' },
  '.a78': { consoleId: 51, headerRule: 'a7800' },
};

export function consoleForExt(ext) {
  return EXT[String(ext).toLowerCase()] || null;
}
