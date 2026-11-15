---
status: accepted
date: 2026-10-06
---

# Tauri commands that touch windows are always async

Any `#[tauri::command]` that creates or changes windows is `async`. On Windows, a synchronous command blocks the thread that has to do the window work. Opening an overlay with content protection then produced a white, frozen window that outlived the app (fixed in `ceb0c9c`). Nothing in the code shows why these commands must be async, and a synchronous version works fine on macOS, so this is recorded to stop someone "simplifying" it back.

## Consequences

- `scripts/check-window-rules.py` (run by `make check` and CI) rejects synchronous window commands.

*Backfilled 2026-10-07 from `docs/platform/fullscreen-results.md` and `overlay.rs`.*
