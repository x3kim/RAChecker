#!/usr/bin/env node
// Bump the app version in every place that must stay in sync, then (optionally)
// commit + tag + push so the release workflow builds and publishes the exe.
//
//   node scripts/release.mjs patch|minor|major|X.Y.Z [--push] [--force]
//
// Without --push it only edits the files and prints the git commands. With
// --push it commits, tags vX.Y.Z and pushes (that tag triggers the release
// workflow). --force lets a freshly-stubbed changelog through the guard.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const push = args.includes('--push');
const force = args.includes('--force');
const bump = args.find((a) => !a.startsWith('--')) || 'patch';

const rootPkgPath = join(ROOT, 'package.json');
const webPkgPath = join(ROOT, 'web', 'package.json');
const versionTsPath = join(ROOT, 'web', 'src', 'lib', 'version.ts');

const cur = JSON.parse(readFileSync(rootPkgPath, 'utf8')).version;

function nextVersion(from, kind) {
  if (/^\d+\.\d+\.\d+$/.test(kind)) return kind;
  const [a, b, c] = from.split('.').map(Number);
  if (kind === 'major') return `${a + 1}.0.0`;
  if (kind === 'minor') return `${a}.${b + 1}.0`;
  if (kind === 'patch') return `${a}.${b}.${c + 1}`;
  throw new Error(`Unknown bump "${kind}" — use patch | minor | major | X.Y.Z`);
}

const next = nextVersion(cur, bump);
if (next === cur) { console.error(`Version is already ${cur}.`); process.exit(1); }

// 1) package.json (root + web) — keep 2-space indent + trailing newline.
for (const p of [rootPkgPath, webPkgPath]) {
  const j = JSON.parse(readFileSync(p, 'utf8'));
  j.version = next;
  writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
}

// 2) version.ts: APP_VERSION + a CHANGELOG stub if none exists for this version.
let ts = readFileSync(versionTsPath, 'utf8');
ts = ts.replace(/export const APP_VERSION = '[^']*';/, `export const APP_VERSION = '${next}';`);

let insertedStub = false;
if (!ts.includes(`version: '${next}'`)) {
  const today = new Date().toISOString().slice(0, 10);
  const stub = `  {
    version: '${next}',
    date: '${today}',
    title: { de: 'TODO Titel', en: 'TODO title' },
    changes: [
      { type: 'improve', de: 'TODO: Änderung beschreiben.', en: 'TODO: describe the change.' },
    ],
  },
`;
  ts = ts.replace('export const CHANGELOG: Release[] = [\n', `export const CHANGELOG: Release[] = [\n${stub}`);
  insertedStub = true;
}
writeFileSync(versionTsPath, ts);

console.log(`Version ${cur} -> ${next}`);
if (insertedStub) console.log('Inserted a CHANGELOG stub (TODO) in web/src/lib/version.ts — edit it.');

if (push) {
  if (insertedStub && !force) {
    console.error('\nRefusing to push: the changelog for this version is still a TODO stub.');
    console.error('Edit web/src/lib/version.ts, then re-run with --push (or pass --force to ship the stub).');
    process.exit(1);
  }
  const files = ['package.json', 'web/package.json', 'web/src/lib/version.ts'];
  const git = (...a) => execFileSync('git', a, { cwd: ROOT, stdio: 'inherit' });
  git('add', ...files);
  git('commit', '-m', `chore: release v${next}`);
  git('tag', `v${next}`);
  git('push', '--follow-tags');
  console.log(`\nPushed v${next}. The release workflow will build and publish the exe.`);
} else {
  console.log(`\nNext steps:`);
  console.log(`  1) edit the CHANGELOG entry for v${next} in web/src/lib/version.ts`);
  console.log(`  2) git add package.json web/package.json web/src/lib/version.ts`);
  console.log(`     git commit -m "chore: release v${next}"`);
  console.log(`     git tag v${next} && git push --follow-tags`);
  console.log(`  (or re-run with --push to do step 2 automatically)`);
}
