# Overlay platform checks: full screen and screen capture

Tickets: 002/05 and 002/07. Test with the `hello` overlay from the Manager's "Overlay test" panel.

Legend: ✅ pass · ❌ fail · ⏳ not yet tested · — not applicable

## Overlays above full-screen apps (002/05)

Overlay settings under test: always on top, `visible_on_all_workspaces(true)`. On macOS, overlays are also converted to non-activating `NSPanel`s (via `tauri-nspanel`) with `CanJoinAllSpaces | FullScreenAuxiliary` at the status window level; without that they don't appear in a full-screen app's Space.

| Scenario | Mac | Windows | Notes |
| --- | --- | --- | --- |
| Browser in full screen (Chrome/Edge F11, macOS green button) | ✅ pass | ⏳ | Mac checked 2026-10-06 with overlays as non-activating panels |
| Keynote slideshow | ⏳ | — | |
| PowerPoint slideshow | ⏳ | ✅ pass | Windows checked 2026-10-06: hello stays on top of the full-screen slideshow |
| Switching Spaces / virtual desktops: overlay follows | ✅ pass | ⏳ | Mac checked 2026-10-06 |

## Hidden from screen capture (002/07)

Default is hidden (Manager checkbox "Hide overlays from screen sharing and recordings" ticked). Overlays must still be visible locally.

| Scenario | Mac | Windows | Notes |
| --- | --- | --- | --- |
| Zoom (or Teams) screen share: hidden when ticked | ⏳ | ⏳ | Not tested yet; same OS mechanism as screenshots |
| Screenshot (macOS ⇧⌘3 / Windows Win+Shift+S): hidden when ticked | ✅ pass | ✅ pass | Checked 2026-10-06 |
| Screen recording (macOS ⇧⌘5 / Windows Snipping Tool or Xbox Game Bar): hidden when ticked | ✅ pass | ⏳ | Mac checked 2026-11-15 on the signed, notarized build ([macOS signing](macos-signing.md)) |
| Unticking makes open overlays visible in capture | ✅ pass | ✅ pass | Screenshot |
| Overlays visible locally while hidden from capture | ✅ pass | ✅ pass | |

## Issues found

- **Mac: overlays missing from full-screen Spaces (fixed):** a normal window from another app isn't shown in a full-screen app's Space even with `FullScreenAuxiliary`. Fixed by making overlays non-activating panels.
- **Mac: crash when an overlay closes (fixed 2026-10-08, 006/02):** closing an overlay aborted the app with "Rust cannot catch foreign exceptions". AppKit threw NSRangeException ("Cannot remove an observer … because it is not registered as an observer"). An overlay becomes a panel by changing its window's class; key-value observers are registered on the window both before that (the webview's `WKWindowVisibilityObserver`) and after it (the Touch Bar's `_NSTouchBarFinderObservation` once the panel is used), and destroying the window can only remove one set, whichever class it has by then. Converting back to a window before closing just moved the crash to the other observer. So overlays are never destroyed while the app runs: closing one hides it (`close_overlay`, and the overlay's close request), opening it again shows the same window, and quitting saves window positions and ends the process without tearing windows down (`platform::exit_now`). Debug builds log any native exception as it is thrown (`platform::log_native_exceptions`), and the panel setup catches one instead of aborting.
- **Mac: crash on Touch Bar Macs (fixed):** converting an already visible window to a panel crashed in `_NSTouchBarFinderObservation invalidate` (KVO observer removal). Overlays are now created hidden, converted, then shown.

- **Windows hang (fixed in `ceb0c9c`):** with content protection and all-workspaces enabled, opening an overlay on Windows produced a white, unresponsive window that outlived the app. Cause: the window commands were synchronous, which can deadlock on Windows. They are now async; retested on Windows 2026-10-06 and overlays open normally.
