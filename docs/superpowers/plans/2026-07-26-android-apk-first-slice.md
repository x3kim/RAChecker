# RAChecker Android — First Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the shared-core, on-device pipeline end to end — extract the cartridge hash rules into a framework-agnostic `packages/core`, keep the desktop's 44 tests green, and hash one cartridge ROM on an Android device via an Expo app, showing an MD5 that matches the desktop.

**Architecture:** Monorepo. `packages/core` holds the pure RetroAchievements cartridge hash rules (byte transforms + MD5 injected). The desktop (`server/`) keeps its Node streaming I/O but delegates the *rules* to core. The mobile app (`mobile/`, Expo) reads a ROM into memory (cartridges are ≤64 MB — no streaming needed; disc systems are out of scope) and calls the SAME core with a pure-JS MD5. Identical rule code ⇒ identical hashes on both platforms.

**Tech Stack:** Node workspaces, `node:test`, Expo (React Native), `js-md5`, `expo-document-picker`, `expo-file-system`, EAS build.

**Design spec:** `docs/superpowers/specs/2026-07-26-android-apk-design.md`

**EAS project id:** `b7b1a3b5-50cf-45a2-bce0-24f8baab51ce` (Expo project "rachecker").

---

## File structure

```
packages/core/
  package.json            name "ra-core", type module, no deps
  index.js                re-exports the public surface
  hash/
    rules.js              byte helpers, magic bytes, stripBytes, n64Mode,
                          applyHeaderRule, hashBuffer(bytes, rule, md5)
    consoles.js           minimal ext -> {consoleId, headerRule} map (first slice)
  test/
    rules.test.js         RA hash vectors, run with an injected MD5

server/src/hashing/
  file-hash.js            MODIFIED: keeps node streaming I/O, delegates rules to ra-core

mobile/                   Expo app (own package.json, NOT hoisted)
  app/index.tsx           "Pick a ROM" -> read bytes -> hash -> show md5 + rule
  src/md5.ts              js-md5 wrapper: (bytes: Uint8Array) => hex
  src/hashFile.ts         document-picker + file read -> ra-core hashBuffer
  metro.config.js         monorepo resolver (watch repo root)
  app.json                name/slug/eas projectId
  eas.json                build profiles (development / preview / production)
  tsconfig.json           path to ra-core
```

---

## Task 1: Add `packages/core` as a workspace

**Files:**
- Modify: `package.json:12-15` (workspaces array)
- Create: `packages/core/package.json`
- Create: `packages/core/index.js`

- [ ] **Step 1: Add the packages glob to root workspaces**

Modify `package.json` — change:

```json
  "workspaces": [
    "server",
    "web"
  ],
```

to:

```json
  "workspaces": [
    "server",
    "web",
    "packages/*"
  ],
```

- [ ] **Step 2: Create the core package manifest**

Create `packages/core/package.json`:

```json
{
  "name": "ra-core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Framework-agnostic RetroAchievements hashing core (shared by desktop and mobile).",
  "main": "index.js",
  "exports": {
    ".": "./index.js",
    "./hash/rules.js": "./hash/rules.js",
    "./hash/consoles.js": "./hash/consoles.js"
  }
}
```

- [ ] **Step 3: Create a placeholder public surface**

Create `packages/core/index.js`:

```js
export * from './hash/rules.js';
export * from './hash/consoles.js';
```

- [ ] **Step 4: Install so the workspace symlink is created**

Run: `npm install`
Expected: completes; `node_modules/ra-core` is a symlink to `packages/core`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json packages/core/package.json packages/core/index.js
git commit -m "chore: add ra-core workspace (shared hashing core)"
```

---

## Task 2: Port the pure cartridge hash rules into `ra-core` (TDD)

**Files:**
- Create: `packages/core/hash/rules.js`
- Create: `packages/core/hash/consoles.js`
- Test: `packages/core/test/rules.test.js`

The rules mirror `server/src/hashing/file-hash.js` but operate on `Uint8Array`
(not Node `Buffer`) and take MD5 as an injected function, so the exact same code
runs under Node and React Native.

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/rules.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { hashBuffer, consoleForExt } from '../index.js';

// MD5 is injected — here we use Node's for the test. Any correct MD5 yields the
// same result, which is exactly why the mobile js-md5 will match.
const md5 = (bytes) => createHash('md5').update(bytes).digest('hex');
const rawMd5 = (bytes) => createHash('md5').update(bytes).digest('hex');

test('no rule -> whole-file md5', () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  assert.equal(hashBuffer(bytes, null, md5), rawMd5(bytes));
});

test('nes -> 16-byte iNES header is stripped', () => {
  const header = new Uint8Array(16); header.set([0x4e, 0x45, 0x53, 0x1a]); // "NES\x1a"
  const body = new Uint8Array([9, 8, 7, 6, 5]);
  const rom = new Uint8Array([...header, ...body]);
  assert.equal(hashBuffer(rom, 'nes', md5), rawMd5(body));
});

test('nes without header -> whole file', () => {
  const rom = new Uint8Array([1, 2, 3, 4, 5]);
  assert.equal(hashBuffer(rom, 'nes', md5), rawMd5(rom));
});

test('snes -> 512-byte copier header stripped when size % 8192 === 512', () => {
  const body = new Uint8Array(0x2000).fill(7);   // one 8 KB bank
  const header = new Uint8Array(512).fill(1);
  const rom = new Uint8Array([...header, ...body]);
  assert.equal(hashBuffer(rom, 'snes', md5), rawMd5(body));
});

test('n64 .v64 (0x37) -> 16-bit byteswap before md5', () => {
  const rom = new Uint8Array([0x37, 0x80, 0x40, 0x12]);
  const swapped = new Uint8Array([0x80, 0x37, 0x12, 0x40]);
  assert.equal(hashBuffer(rom, 'n64', md5), rawMd5(swapped));
});

test('n64 .z64 (0x80 native) -> no swap', () => {
  const rom = new Uint8Array([0x80, 0x37, 0x12, 0x40]);
  assert.equal(hashBuffer(rom, 'n64', md5), rawMd5(rom));
});

test('arduboy .hex -> normalized line endings, trailing empty dropped', () => {
  const text = 'AAA\r\nBBB\r\n';
  const normalized = 'AAA\nBBB\n';
  const rom = new TextEncoder().encode(text);
  assert.equal(hashBuffer(rom, 'arduboy', md5), rawMd5(new TextEncoder().encode(normalized)));
});

test('consoleForExt maps common cartridge extensions', () => {
  assert.equal(consoleForExt('.nes').headerRule, 'nes');
  assert.equal(consoleForExt('.sfc').headerRule, 'snes');
  assert.equal(consoleForExt('.z64').headerRule, 'n64');
  assert.equal(consoleForExt('.gb').headerRule, null);
  assert.equal(consoleForExt('.iso'), null); // disc = out of scope on mobile
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test packages/core/test/rules.test.js`
Expected: FAIL — `Cannot find module '../index.js'` targets (`hash/rules.js` not written yet).

- [ ] **Step 3: Implement the pure rules**

Create `packages/core/hash/rules.js`:

```js
// Framework-agnostic RetroAchievements cartridge hash rules. Operates on
// Uint8Array; MD5 is injected so the same code runs under Node and React Native.
// Source of truth: rcheevos src/rhash/hash_rom.c.

// ---- byte-order helpers (Nintendo 64) ----
export function byteswap16InPlace(buf) {
  const n = buf.length - (buf.length % 2);
  for (let i = 0; i < n; i += 2) { const t = buf[i]; buf[i] = buf[i + 1]; buf[i + 1] = t; }
}
export function byteswap32InPlace(buf) {
  const n = buf.length - (buf.length % 4);
  for (let i = 0; i < n; i += 4) {
    const a = buf[i], b = buf[i + 1], c = buf[i + 2], d = buf[i + 3];
    buf[i] = d; buf[i + 1] = c; buf[i + 2] = b; buf[i + 3] = a;
  }
}

function startsWith(buf, bytes, offset = 0) {
  if (buf.length < offset + bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) if (buf[offset + i] !== bytes[i]) return false;
  return true;
}

export const MAGIC = {
  NES: [0x4e, 0x45, 0x53, 0x1a],
  FDS: [0x46, 0x44, 0x53, 0x1a],
  LYNX: [0x4c, 0x59, 0x4e, 0x58],
  ATARI7800: [0x41, 0x54, 0x41, 0x52, 0x49, 0x37, 0x38, 0x30, 0x30],
  EMUSCV: [0x45, 0x6d, 0x75, 0x53, 0x43, 0x56],
};

// .v64 (0x37) => 16-bit swap; .n64 (0x40) => 32-bit swap; else native, no swap.
export function n64Mode(firstByte) {
  return firstByte === 0x37 ? 2 : firstByte === 0x40 ? 4 : 1;
}

// How many leading header bytes a strip-style rule removes (pure: size + head).
export function stripBytes(rule, size, head) {
  switch (rule) {
    case 'nes':   return size > 16 && (startsWith(head, MAGIC.NES) || startsWith(head, MAGIC.FDS)) ? 16 : 0;
    case 'snes':  return size - Math.floor(size / 0x2000) * 0x2000 === 512 ? 512 : 0;
    case 'lynx':  return size > 64 && startsWith(head, MAGIC.LYNX) ? 64 : 0;
    case 'a7800': return size > 128 && startsWith(head, MAGIC.ATARI7800, 1) ? 128 : 0;
    case 'pce':   return (size & 512) ? 512 : 0;
    case 'scv':   return size > 32 && startsWith(head, MAGIC.EMUSCV) ? 32 : 0;
    default:      return 0;
  }
}

function normalizeArduboyText(bytes) {
  const text = new TextDecoder().decode(bytes);
  const lines = text.split(/\r\n|\r|\n/);
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  let normalized = '';
  for (const l of lines) normalized += l + '\n';
  return new TextEncoder().encode(normalized);
}

// Return the exact bytes RA hashes for `rule` (stripped / byteswapped / text
// normalized). `null`/unknown rule => the whole buffer.
export function applyHeaderRule(bytes, rule) {
  if (!rule) return bytes;
  if (rule === 'arduboy') return normalizeArduboyText(bytes);
  if (rule === 'n64') {
    const out = bytes.slice(); // copy before mutating
    const mode = n64Mode(out[0]);
    if (mode === 2) byteswap16InPlace(out);
    else if (mode === 4) byteswap32InPlace(out);
    return out;
  }
  const strip = stripBytes(rule, bytes.length, bytes);
  return strip ? bytes.subarray(strip) : bytes;
}

// The public entry point: md5 is injected as (Uint8Array) => hex string.
export function hashBuffer(bytes, rule, md5) {
  return md5(applyHeaderRule(bytes, rule));
}
```

- [ ] **Step 4: Implement the minimal console map**

Create `packages/core/hash/consoles.js`:

```js
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
};

export function consoleForExt(ext) {
  return EXT[String(ext).toLowerCase()] || null;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test packages/core/test/rules.test.js`
Expected: PASS — all cases green.

- [ ] **Step 6: Commit**

```bash
git add packages/core/hash/rules.js packages/core/hash/consoles.js packages/core/test/rules.test.js
git commit -m "feat(core): port cartridge hash rules to ra-core (Uint8Array, injected md5)"
```

---

## Task 3: Rewire the desktop to use `ra-core` (keep 44 tests green)

The desktop keeps its constant-memory Node streaming, but the *rule* logic now
lives in one place (`ra-core`). The public exports (`hashBuffer`, `hashFile`,
`md5`) stay identical so no caller changes.

**Files:**
- Modify: `server/src/hashing/file-hash.js` (replace the duplicated pure logic with imports from `ra-core`)
- Modify: `server/package.json` (add `ra-core` dependency)

- [ ] **Step 1: Declare the workspace dependency**

In `server/package.json`, add to `dependencies` (create the block if missing):

```json
    "ra-core": "*"
```

- [ ] **Step 2: Run the existing suite first (baseline is green)**

Run: `npm test`
Expected: `# pass 44`.

- [ ] **Step 3: Rewrite `file-hash.js` to delegate rules to core**

Replace `server/src/hashing/file-hash.js` with:

```js
// File-based RetroAchievements hashing. The per-console RULE logic lives in
// ra-core (shared with the mobile app); this module supplies Node's MD5 and the
// constant-memory streaming I/O so files of ANY size hash correctly.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat, open, readFile } from 'node:fs/promises';
import {
  hashBuffer as coreHashBuffer, applyHeaderRule,
  stripBytes, n64Mode, byteswap16InPlace, byteswap32InPlace,
} from 'ra-core';

function md5(buf) { return createHash('md5').update(buf).digest('hex'); }

// In-memory hash for a header rule (null = whole-file MD5). Delegates to core.
export function hashBuffer(buf, headerRule) {
  return coreHashBuffer(buf, headerRule, md5);
}

function streamMd5(filePath, start = 0, { signal, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const h = createHash('md5');
    const s = createReadStream(filePath, start ? { start } : undefined);
    const onAbort = () => s.destroy(new Error('aborted'));
    if (signal) {
      if (signal.aborted) { s.destroy(); return reject(new Error('aborted')); }
      signal.addEventListener('abort', onAbort, { once: true });
    }
    let done = 0;
    s.on('data', (c) => { h.update(c); if (onProgress) { done += c.length; onProgress(done); } });
    s.on('end', () => { signal?.removeEventListener('abort', onAbort); resolve(h.digest('hex')); });
    s.on('error', (e) => { signal?.removeEventListener('abort', onAbort); reject(e); });
  });
}

async function readHead(filePath, n) {
  const fh = await open(filePath, 'r');
  try {
    const buf = Buffer.alloc(n);
    const { bytesRead } = await fh.read(buf, 0, n, 0);
    return buf.subarray(0, bytesRead);
  } finally { await fh.close(); }
}

function hashN64Streamed(filePath, mode, { signal } = {}) {
  return new Promise((resolve, reject) => {
    const h = createHash('md5');
    let carry = Buffer.alloc(0);
    const s = createReadStream(filePath);
    const onAbort = () => s.destroy(new Error('aborted'));
    if (signal) {
      if (signal.aborted) { s.destroy(); return reject(new Error('aborted')); }
      signal.addEventListener('abort', onAbort, { once: true });
    }
    s.on('data', (chunk) => {
      const buf = carry.length ? Buffer.concat([carry, chunk]) : chunk;
      const n = buf.length - (buf.length % mode);
      const aligned = Buffer.from(buf.subarray(0, n));
      carry = Buffer.from(buf.subarray(n));
      if (mode === 2) byteswap16InPlace(aligned); else byteswap32InPlace(aligned);
      h.update(aligned);
    });
    s.on('end', () => { signal?.removeEventListener('abort', onAbort); if (carry.length) h.update(carry); resolve(h.digest('hex')); });
    s.on('error', (e) => { signal?.removeEventListener('abort', onAbort); reject(e); });
  });
}

// Stream-hash a file for a header rule; constant memory, any size.
export async function hashFile(filePath, headerRule, opts = {}) {
  if (!headerRule) return streamMd5(filePath, 0, opts);

  if (headerRule === 'n64') {
    const head = await readHead(filePath, 1);
    const mode = n64Mode(head[0]);
    return mode === 1 ? streamMd5(filePath, 0, opts) : hashN64Streamed(filePath, mode, opts);
  }

  if (headerRule === 'arduboy') {
    // Small text file; core normalizes its line endings.
    return coreHashBuffer(await readFile(filePath), 'arduboy', md5);
  }

  const size = (await stat(filePath)).size;
  const head = await readHead(filePath, 16);
  return streamMd5(filePath, stripBytes(headerRule, size, head), opts);
}

export { md5, applyHeaderRule };
```

- [ ] **Step 4: Run the full suite — desktop must stay green**

Run: `npm test`
Expected: `# pass 44` (the existing `file-hash.test.js` + `hashing.test.js` now exercise the shared core through the Node wrapper).

- [ ] **Step 5: Commit**

```bash
git add server/src/hashing/file-hash.js server/package.json package-lock.json
git commit -m "refactor(hashing): desktop delegates cartridge rules to ra-core (tests green)"
```

---

## Task 4: Scaffold the Expo app in `mobile/`

`mobile/` is an Expo app with its own `package.json` (Expo/Metro manage their
own deps; we do NOT hoist it into the npm workspace). Metro is pointed at the repo
root so it can resolve `ra-core`.

- [ ] **Step 1: Create the Expo app (blank TypeScript, expo-router)**

Run from the repo root:

```bash
npx create-expo-app@latest mobile --template blank-typescript
```

Expected: `mobile/` created with `package.json`, `App.tsx`, `app.json`, `tsconfig.json`.

- [ ] **Step 2: Add the runtime deps used by the first slice**

Run:

```bash
cd mobile && npx expo install expo-document-picker expo-file-system && npm install js-md5 && cd ..
```

- [ ] **Step 3: Point Metro at the monorepo so it resolves `ra-core`**

Create `mobile/metro.config.js`:

```js
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);
// Watch the repo root so changes to packages/core are picked up.
config.watchFolders = [workspaceRoot];
// Resolve modules from the app first, then the repo root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;
// Allow importing the ra-core workspace by path.
config.resolver.extraNodeModules = {
  'ra-core': path.resolve(workspaceRoot, 'packages/core'),
};

module.exports = config;
```

- [ ] **Step 4: Configure app identity + EAS project id**

Edit `mobile/app.json` — set the `expo` block's `name`, `slug`, and add `extra.eas.projectId`:

```json
{
  "expo": {
    "name": "RAChecker",
    "slug": "rachecker",
    "version": "0.1.0",
    "orientation": "portrait",
    "android": { "package": "de.rachecker.app" },
    "extra": {
      "eas": { "projectId": "b7b1a3b5-50cf-45a2-bce0-24f8baab51ce" }
    }
  }
}
```

- [ ] **Step 5: Add EAS build profiles (both cloud and local prepared)**

Create `mobile/eas.json`:

```json
{
  "cli": { "version": ">= 12.0.0" },
  "build": {
    "development": { "developmentClient": true, "distribution": "internal", "android": { "buildType": "apk" } },
    "preview": { "distribution": "internal", "android": { "buildType": "apk" } },
    "production": { "android": { "buildType": "app-bundle" } }
  }
}
```

- [ ] **Step 6: Let mobile TypeScript resolve `ra-core`**

Add to `mobile/tsconfig.json` `compilerOptions`:

```json
    "baseUrl": ".",
    "paths": { "ra-core": ["../packages/core/index.js"] }
```

- [ ] **Step 7: Ignore mobile build artifacts**

Append to the repo-root `.gitignore`:

```
# Expo / mobile
mobile/node_modules/
mobile/.expo/
mobile/android/
mobile/ios/
mobile/dist/
```

- [ ] **Step 8: Commit**

```bash
git add mobile/package.json mobile/app.json mobile/eas.json mobile/metro.config.js mobile/tsconfig.json mobile/App.tsx .gitignore
git commit -m "chore(mobile): scaffold Expo app wired to the ra-core workspace"
```

---

## Task 5: On-device hash — read a ROM and show its MD5

**Files:**
- Create: `mobile/src/md5.ts`
- Create: `mobile/src/hashFile.ts`
- Modify: `mobile/App.tsx`

- [ ] **Step 1: MD5 wrapper matching the core's injected signature**

Create `mobile/src/md5.ts`:

```ts
import md5 from 'js-md5';

// (Uint8Array) => lowercase hex — the exact shape ra-core's hashBuffer expects.
export function md5Bytes(bytes: Uint8Array): string {
  return md5.hex(bytes);
}
```

- [ ] **Step 2: Pick a file, read its bytes, hash via ra-core**

Create `mobile/src/hashFile.ts`:

```ts
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
// @ts-expect-error — resolved via metro extraNodeModules / tsconfig paths
import { hashBuffer, consoleForExt } from 'ra-core';
import { md5Bytes } from './md5';

export type HashResult = { name: string; ext: string; rule: string | null; md5: string };

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = globalThis.atob ? globalThis.atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function pickAndHash(): Promise<HashResult | null> {
  const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0];
  const ext = extOf(asset.name);
  const meta = consoleForExt(ext);
  const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
  const bytes = base64ToBytes(b64);
  const rule = meta?.headerRule ?? null;
  return { name: asset.name, ext, rule, md5: hashBuffer(bytes, rule, md5Bytes) };
}
```

- [ ] **Step 3: Minimal screen**

Replace `mobile/App.tsx`:

```tsx
import { useState } from 'react';
import { SafeAreaView, Text, Pressable, View, StyleSheet } from 'react-native';
import { pickAndHash, HashResult } from './src/hashFile';

export default function App() {
  const [result, setResult] = useState<HashResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true); setError(null);
    try { setResult(await pickAndHash()); }
    catch (e: any) { setError(String(e?.message || e)); }
    finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={styles.root}>
      <Text style={styles.title}>RAChecker — hash proof</Text>
      <Pressable style={styles.btn} onPress={run} disabled={busy}>
        <Text style={styles.btnText}>{busy ? 'Hashing…' : 'Pick a ROM'}</Text>
      </Pressable>
      {error && <Text style={styles.err}>{error}</Text>}
      {result && (
        <View style={styles.card}>
          <Text style={styles.row}>file: {result.name}</Text>
          <Text style={styles.row}>rule: {result.rule ?? '(none)'}</Text>
          <Text style={styles.md5}>{result.md5}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0e14', alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { color: '#22e0ff', fontSize: 18, marginBottom: 24 },
  btn: { backgroundColor: '#22e0ff', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
  btnText: { color: '#001018', fontWeight: '700' },
  err: { color: '#ff6b6b', marginTop: 16 },
  card: { marginTop: 24, padding: 16, backgroundColor: '#121821', borderRadius: 8, alignSelf: 'stretch' },
  row: { color: '#9db4d0', marginBottom: 6 },
  md5: { color: '#39ff8b', fontFamily: 'monospace', marginTop: 6 },
});
```

- [ ] **Step 4: Commit**

```bash
git add mobile/src/md5.ts mobile/src/hashFile.ts mobile/App.tsx
git commit -m "feat(mobile): pick a ROM, hash it on-device via ra-core, show md5"
```

---

## Task 6: Verify on device + a cross-platform hash smoke test

- [ ] **Step 1: Cross-check js-md5 vs Node MD5 for a header-rule case (Node test)**

Create `packages/core/test/mobile-md5-parity.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import jsmd5 from 'js-md5';
import { hashBuffer } from '../index.js';

// Proves the mobile MD5 primitive produces the same hash as Node's over the
// SAME rule output — i.e. desktop and mobile agree.
test('js-md5 matches node md5 through hashBuffer (nes strip)', () => {
  const rom = new Uint8Array([0x4e, 0x45, 0x53, 0x1a, ...Array(20).fill(3)]);
  const withNode = hashBuffer(rom, 'nes', (b) => createHash('md5').update(b).digest('hex'));
  const withJs = hashBuffer(rom, 'nes', (b) => jsmd5.hex(b));
  assert.equal(withJs, withNode);
});
```

Add `js-md5` as a dev dependency at the repo root so the Node test can import it:

Run: `npm install -D js-md5`

- [ ] **Step 2: Run the parity test**

Run: `node --test packages/core/test/mobile-md5-parity.test.js`
Expected: PASS.

- [ ] **Step 3: Full desktop suite still green**

Run: `npm test`
Expected: `# pass 45` (44 + the parity test).

- [ ] **Step 4: Run the app on a device/emulator (manual)**

Local (needs Android Studio + a device/emulator over ADB):

```bash
cd mobile && npx expo run:android
```

OR EAS cloud preview build (needs `npx eas login` once):

```bash
cd mobile && npx eas build --profile preview --platform android
```

Manual verification:
- Tap **Pick a ROM**, choose a `.nes` (or `.gb`, `.z64`) file on the device.
- The screen shows the detected rule and an MD5.
- Cross-check: hash the SAME file on the desktop (Scan / drag-and-drop) — the MD5 must be identical. This is the proof that the shared core hashes identically on both platforms.

- [ ] **Step 5: Commit the parity test**

```bash
git add packages/core/test/mobile-md5-parity.test.js package.json package-lock.json
git commit -m "test(core): js-md5 vs node md5 parity through hashBuffer"
```

---

## Done-when

- `npm test` → 45 pass (desktop unchanged in behaviour; rules now shared).
- The Expo app hashes a real cartridge ROM on an Android device and shows an MD5
  that matches the desktop's hash for the same file.
- `ra-core` contains the only copy of the cartridge rule logic; the desktop
  imports it.

## Next slices (out of scope here — separate plans)

1. Full `consoles` port (all systems, folder aliases, ext maps) + arcade filename hash.
2. On-device RA hash-DB sync (RA API client port → `expo-sqlite`) + `expo-secure-store` login.
3. SAF folder picker + recursive scan + progress UI.
4. ZIP support on-device (`fflate`); 7z/rar → "extract first" message.
5. Results screen: matched game, "has achievements", user progress (RA API, cached).
