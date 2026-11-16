---
status: accepted
date: 2026-10-10
---

# Starting a session opens every overlay and minimises the manager

The manager is for building talks; the overlays, the Control Panel (ADR 0028) and the hotkeys run them (epic 011). So starting a session, with **Ready to start** on the Get ready page (ADR 0019), opens every overlay and minimises the manager, and the manager has no Previous, Pause or Next.

- **Every overlay, every time.** There is no choice of overlays, per talk or otherwise: an empty choice remembered from a rehearsal once left John with no overlays and no sign of why, and the overlays are the point of a session. An overlay can be hidden during a session from the Control Panel. `overlaysByTalk` is no longer read; an older `settings.json` keeps it as an unknown field.
- **Out of the way.** The frontend minimises the manager once the overlays are open (`GetReadyPage.svelte`, with the `core:window:allow-minimize` permission). Brought back while the session runs, it shows one compact page: the session's progress and End session.
- **Back at the end.** The Rust core, which owns the session (ADR 0005), brings the manager back (unminimises and focuses it) when the session ends, however it ends: from an overlay, the Control Panel, a hotkey or the manager (`bring_back_manager` in `src-tauri/src/session.rs`). It then shows the summary.

## Consequences

- Once the overlays are open, and before the manager is minimised, an overlay with one place for every look (Talking Points) that sits over or under the Timeline goes back to its own place (`keep_overlays_apart` in `src-tauri/src/overlay.rs`). It is never moved later in the session.
- Minimising is in the frontend and restoring in the core, so the two halves live in different languages. They are named here and in each file's comments.
- A future plugin opens with every session. If someone wants a plugin off for good, that becomes a setting for the plugin, not a choice per talk.
- If the manager was not minimised (minimising failed, or the user brought it back), the core leaves it as it is.
