import test from 'node:test';
import assert from 'node:assert/strict';
import { binaryFormat, pickRAHasherAsset, canDownloadRAHasher, interpretProbe } from '../src/hashing/rahasher.js';

// RALibretro 1.8.4 — the first release that ships Linux builds itself.
const ASSETS = [
  { name: 'RAHasher-x64-Linux-1.8.4.zip' },
  { name: 'RAHasher-x64-Windows-1.8.4.zip' },
  { name: 'RAHasher-x86-Linux-1.8.4.zip' },
  { name: 'RAHasher-x86-Windows-1.8.4.zip' },
];

test('binaryFormat tells Windows, Linux and macOS executables apart', () => {
  assert.equal(binaryFormat(Buffer.from([0x4d, 0x5a, 0x90, 0x00])), 'pe');
  assert.equal(binaryFormat(Buffer.from([0x7f, 0x45, 0x4c, 0x46])), 'elf');
  assert.equal(binaryFormat(Buffer.from([0xcf, 0xfa, 0xed, 0xfe])), 'macho');
  assert.equal(binaryFormat(Buffer.from([0xca, 0xfe, 0xba, 0xbe])), 'macho');
  assert.equal(binaryFormat(Buffer.from('#!/bin/sh')), 'script');
  assert.equal(binaryFormat(Buffer.from('hello')), 'unknown');
  assert.equal(binaryFormat(Buffer.alloc(0)), 'unknown');
});

test('the download picks the build for this OS and CPU', () => {
  assert.equal(pickRAHasherAsset(ASSETS, 'linux', 'x64').name, 'RAHasher-x64-Linux-1.8.4.zip');
  assert.equal(pickRAHasherAsset(ASSETS, 'linux', 'ia32').name, 'RAHasher-x86-Linux-1.8.4.zip');
  assert.equal(pickRAHasherAsset(ASSETS, 'win32', 'x64').name, 'RAHasher-x64-Windows-1.8.4.zip');
  assert.equal(pickRAHasherAsset(ASSETS, 'win32', 'ia32').name, 'RAHasher-x86-Windows-1.8.4.zip');
});

test('x64 Windows falls back to the x86 build, x64 Linux does not', () => {
  const x86Only = ASSETS.filter((a) => a.name.includes('x86'));
  assert.equal(pickRAHasherAsset(x86Only, 'win32', 'x64').name, 'RAHasher-x86-Windows-1.8.4.zip');
  // A 32-bit binary on 64-bit Linux needs multilib, which SteamOS does not ship.
  assert.equal(pickRAHasherAsset(x86Only, 'linux', 'x64'), null);
});

test('no build for macOS or ARM — and the button knows it', () => {
  assert.equal(pickRAHasherAsset(ASSETS, 'darwin', 'arm64'), null);
  assert.equal(pickRAHasherAsset(ASSETS, 'darwin', 'x64'), null);
  assert.equal(pickRAHasherAsset(ASSETS, 'linux', 'arm64'), null);
  assert.equal(canDownloadRAHasher('darwin', 'arm64'), false);
  assert.equal(canDownloadRAHasher('linux', 'arm64'), false);
  assert.equal(canDownloadRAHasher('linux', 'x64'), true);
  assert.equal(canDownloadRAHasher('win32', 'x64'), true);
});

test('asset names are matched exactly, not by substring', () => {
  assert.equal(pickRAHasherAsset([{ name: 'RAHasher-x64-Linux-1.8.4.zip.sig' }], 'linux', 'x64'), null);
  assert.equal(pickRAHasherAsset([{ name: 'RAHasher-x64-LinuxXzip' }], 'linux', 'x64'), null);
});

test('the usage text RAHasher prints without arguments proves it runs', () => {
  // It exits 1 on purpose when called without arguments.
  const error = Object.assign(new Error('Command failed'), { code: 1 });
  const stdout = 'RAHasher 1.8.4\n====================\nUsage: RAHasher [-v] [-s systempath] systemid filepath\n';
  assert.deepEqual(interpretProbe({ error, stdout }), { available: true, version: '1.8.4' });
  assert.deepEqual(interpretProbe({ error: null, stdout }), { available: true, version: '1.8.4' });
});

test('spawn failures name the reason instead of claiming "installed"', () => {
  assert.equal(interpretProbe({ error: { code: 'ENOENT' } }).problem, 'missing');
  assert.equal(interpretProbe({ error: { code: 'EACCES' } }).problem, 'not-executable');
  const noexec = interpretProbe({ error: { code: 'ENOEXEC', message: 'spawn ENOEXEC' } });
  assert.equal(noexec.problem, 'wont-run');
  assert.equal(noexec.available, false);
});

test('a binary that starts but fails to load reports the loader\'s words', () => {
  const stderr = "./RAHasher: /lib/x86_64-linux-gnu/libc.so.6: version `GLIBC_2.38' not found (required by ./RAHasher)";
  const r = interpretProbe({ error: { code: 1 }, stdout: '', stderr });
  assert.equal(r.available, false);
  assert.equal(r.problem, 'wont-run');
  assert.match(r.detail, /GLIBC_2\.38/);
});

test('something that runs but is not RAHasher is not accepted', () => {
  const r = interpretProbe({ error: null, stdout: 'Hello from some other tool\n' });
  assert.equal(r.available, false);
  assert.equal(r.problem, 'wont-run');
});

test('a hanging probe is reported as such', () => {
  const r = interpretProbe({ error: { killed: true, code: null, signal: 'SIGTERM' } });
  assert.equal(r.problem, 'wont-run');
  assert.match(r.detail, /timed out/);
});

test('the button names the build it will fetch', async () => {
  const { rahasherDownloadTarget } = await import('../src/hashing/rahasher.js');
  assert.equal(rahasherDownloadTarget('linux', 'x64'), 'Linux x64');
  assert.equal(rahasherDownloadTarget('linux', 'ia32'), 'Linux x86');
  assert.equal(rahasherDownloadTarget('win32', 'x64'), 'Windows x64');
  assert.equal(rahasherDownloadTarget('darwin', 'arm64'), null);
});
