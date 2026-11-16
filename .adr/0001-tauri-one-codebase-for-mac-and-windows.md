---
status: accepted
date: 2026-10-06
---

# One Tauri v2 codebase for Mac and Windows, with Windows built only in CI

Oversay is a Tauri v2 app: a Rust core with web UI (now Svelte 5) for both macOS and Windows. The overlay proof of concept (epic 001; its results were in `poc/overlay/results.md`, now in git history) showed that one codebase, with no platform-specific native code, gives a frameless, translucent, always-on-top, draggable overlay on both systems, so it got a "go". Windows builds come only from GitHub Actions (`build.yml`), because the Windows machine used for development has no build tools. The macOS build is made both locally and in CI.

## Consequences

- A Windows-only problem can only be reproduced from a CI build (`gh workflow run build.yml`, then `scripts/fetch-builds.sh`). Windows checks lag behind Mac checks, and several tickets note "not yet tried on Windows".
- Native platform behaviour that Tauri does not cover is kept in one module, `platform.rs` (see ADR 0002 and `CODING_STANDARDS.md`).

*Backfilled 2026-10-07 from the epic 001 records.*
