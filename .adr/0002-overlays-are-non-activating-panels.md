---
status: accepted
date: 2026-10-06
---

# On macOS, overlays are non-activating panels that never take focus

On macOS each overlay window is converted into a non-activating `NSPanel` (via `tauri-nspanel`) that joins all Spaces as a full-screen auxiliary at the status window level. Clicking an overlay does not activate Oversay, and code never focuses an overlay. Without the panel conversion, a normal window from another app is not shown inside a full-screen app's Space, so overlays vanished during a full-screen slideshow. Focusing an overlay would pull keyboard focus away from the presentation. On Windows, plain always-on-top windows already stay above full-screen slideshows, so nothing extra is done there.

## Consequences

- The conversion must happen while the window is still hidden: converting a visible window crashed on Touch Bar Macs, where AppKit observers were attached to it. Overlays are created hidden, converted, then shown (`platform.rs`).
- **Overlay windows are never destroyed while the app runs** (2026-10-08, 006/02). Changing the window's class after key-value observers are registered on it (by the webview before the conversion, by the Touch Bar after it) means destroying it fails to remove one set or the other, and AppKit's NSRangeException aborts the app. Closing an overlay hides it, opening it shows the same window, a finished session hides them all, and quitting saves window positions and ends the process without tearing windows down (`platform::exit_now`). A hidden overlay keeps its webview running; there is one per plugin, so the cost is small.
- "Overlay code never calls `set_focus`" is checked mechanically by `scripts/check-window-rules.py`.
- An overlay first opens on the built-in (laptop) display rather than the primary one, so it does not land on a projector that has been set as primary. After that its display and position are remembered.
- Results per OS are in `docs/platform/fullscreen-results.md`. Keynote is not yet checked.

*Backfilled 2026-10-07 from tickets 002/02 and 002/05, `platform.rs` and `docs/platform/fullscreen-results.md`.*
