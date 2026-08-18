# Security Policy

## Supported versions

Only the latest release gets fixes. Desktop releases are listed under
[Releases](https://github.com/x3kim/RAChecker/releases); the Android app ships
under the `android-v*` tags.

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Use GitHub's private reporting instead:
[Report a vulnerability](https://github.com/x3kim/RAChecker/security/advisories/new).

Helpful to include: what you did, what happened, the RAChecker version, and your
OS. A proof of concept is welcome but not required.

This is a hobby project maintained by one person — expect a first reply within a
few days, not within hours.

## What RAChecker actually touches

Worth knowing when judging impact:

- **It runs locally.** The server binds to `127.0.0.1` by default and CORS is
  restricted to localhost origins, so nothing on your network can reach it
  unless you deliberately change `host` in `config.local.json`.
- **Your RetroAchievements API key** is stored in `data/ra-checker.db` and in
  `config.local.json` (both git-ignored). It is sent only to
  `retroachievements.org`. **A downloaded backup contains that key** — treat
  backup files like a password.
- **It reads your ROM files** to hash them, and never uploads their contents.
  Only hashes are compared, locally, against the database RAChecker synced from
  the RetroAchievements Web API.
- **It can delete files you point it at** — the duplicate-cleanup action removes
  real ROM files, restricted to paths already in your collection.
- **Bundled third-party binaries**: `RAHasher.exe` (from
  [RALibretro](https://github.com/RetroAchievements/RALibretro)) and `7za` are
  invoked as child processes for disc hashing and archive extraction.

## Scope

In scope: anything that lets a remote page or a crafted ROM/archive read files
outside the scanned folders, run code, leak the API key, or delete data you did
not select.

Out of scope: findings that require an attacker to already have access to your
user account or filesystem, and the fact that RAChecker itself can delete ROMs
you explicitly asked it to clean up.
