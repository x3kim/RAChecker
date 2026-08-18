import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// EAS uploads only `mobile/`, so the shared core is vendored into
// `mobile/src/core/`. region.js is an exact copy (unlike the hash rules, which
// were adapted when they were ported), and a silent drift would mean the phone
// and the desktop read the same filename differently. Fail loudly instead.
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');

test('mobile/src/core/region.js is an exact copy of packages/core/region.js', () => {
  const source = readFileSync(join(ROOT, 'packages', 'core', 'region.js'), 'utf8');
  const mirror = readFileSync(join(ROOT, 'mobile', 'src', 'core', 'region.js'), 'utf8');
  assert.equal(
    mirror,
    source,
    'Copy packages/core/region.js over mobile/src/core/region.js after changing it.',
  );
});

test('mobile/src/core/nds.js is an exact copy of packages/core/hash/nds.js', () => {
  const source = readFileSync(join(ROOT, 'packages', 'core', 'hash', 'nds.js'), 'utf8');
  const mirror = readFileSync(join(ROOT, 'mobile', 'src', 'core', 'nds.js'), 'utf8');
  assert.equal(
    mirror,
    source,
    'Copy packages/core/hash/nds.js over mobile/src/core/nds.js after changing it.',
  );
});
