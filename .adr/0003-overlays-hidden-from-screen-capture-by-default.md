---
status: accepted
date: 2026-10-06
---

# Overlays are hidden from screen sharing and recordings by default

The overlays are excluded from screen capture unless the person switches it off: Tauri's `content_protected`, which is `NSWindow.sharingType = .none` on macOS and `WDA_EXCLUDEFROMCAPTURE` on Windows. The overlays are the presenter's private notes and timing, and a talk is often given over a screen share, so leaking them by default would be the worse mistake (spec §13, decision 5). The setting can be changed for all overlays or for one overlay during a session. The Control Panel is always hidden, whatever the setting (ADR 0028).

## Consequences

- Someone recording a demo of Oversay itself has to switch this off first, or the overlays will be missing from the recording.
- Hiding is confirmed for screenshots on both systems. Zoom or Teams sharing and screen recording are not yet checked (`docs/platform/fullscreen-results.md`).

*Backfilled 2026-10-07 from ticket 002/07 and spec §11.*
