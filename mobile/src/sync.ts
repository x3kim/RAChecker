// Sync the on-device hash DB from the RA Web API, one cartridge console at a
// time (the bulk API_GetGameList endpoint), with progress + gentle pacing.
import { CART_CONSOLES } from './consoles';
import { getGameList } from './ra/api';
import { Creds } from './storage';
import { replaceConsole, initDb } from './db';

export type SyncProgress = { done: number; total: number; name: string; gameCount: number; hashCount: number; errors: number };

export async function syncAll(creds: Creds, onProgress: (p: SyncProgress) => void): Promise<SyncProgress> {
  await initDb();
  const total = CART_CONSOLES.length;
  let done = 0, gameCount = 0, hashCount = 0, errors = 0;
  for (const c of CART_CONSOLES) {
    onProgress({ done, total, name: c.name, gameCount, hashCount, errors });
    try {
      const games = await getGameList(creds, c.id);
      const r = await replaceConsole(c.id, Array.isArray(games) ? games : []);
      gameCount += r.gameCount;
      hashCount += r.hashCount;
    } catch {
      errors++;
    }
    done++;
    onProgress({ done, total, name: c.name, gameCount, hashCount, errors });
    await new Promise((res) => setTimeout(res, 250)); // be gentle with the RA API
  }
  return { done, total, name: 'done', gameCount, hashCount, errors };
}
