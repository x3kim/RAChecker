// One full-library scan at a time, no matter who starts it (manual scan route,
// watcher interval pass, daily scheduler). Two concurrent scans over the same
// tree double the NAS I/O and temp copies, race the library writes and clobber
// the collection-diff baseline mid-scan.
let holder = null; // 'scan' | 'watch' | 'schedule' | null

export function acquireScanLock(name) {
  if (holder) return false;
  holder = name;
  return true;
}

export function releaseScanLock(name) {
  if (holder === name || name == null) holder = null;
}

export function scanLockHolder() {
  return holder;
}
