// Minimal cartridge ext -> { consoleId, headerRule } for the first slice. The
// full port of server/src/consoles.js (all systems, folder aliases) is a later
// task. Disc extensions are intentionally absent — disc systems are out of scope
// on mobile (they need RAHasher).
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
  '.nds': { consoleId: 18, headerRule: null },
  '.dsi': { consoleId: 78, headerRule: null },
  '.ids': { consoleId: 18, headerRule: null },
};

export function consoleForExt(ext) {
  return EXT[String(ext).toLowerCase()] || null;
}
