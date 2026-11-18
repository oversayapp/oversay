# Linux platform checks: the Steam Deck

Epic [#49](https://github.com/oversayapp/oversay/issues/49). The machine under test is a Steam Deck in desktop mode: SteamOS, KDE Plasma on Wayland.

Legend: ✅ pass · ❌ fail · ⏳ not yet tested · — not applicable

## Hidden from screen capture (slice 1)

How to run each check: [linux-capture-test.md](linux-capture-test.md). **Pass** means the test window is missing from the capture while the rest of the screen shows.

- **Baseline** is KWin's own window-menu switch.
- **Route A** is a KWin script, which an app can load itself.
- **Route B** is a window rule written to `kwinrulesrc`.

| Check | Baseline | Route A | Route A, XWayland | Route B | Notes |
| --- | --- | --- | --- | --- | --- |
| Flag set without clicks (Alt+F3 shows it ticked) | — | ⏳ | ⏳ | ⏳ | |
| C1 Google Meet, whole screen | ⏳ | ⏳ | — | — | |
| C2 Zoom, whole screen | ⏳ | ⏳ | — | — | |
| C3 OBS recording (PipeWire) | ⏳ | ⏳ | ⏳ | ⏳ | |
| C4 sharing one other window | ⏳ | ⏳ | — | — | |
| C5 Spectacle (full screen, region, window under cursor) | ⏳ | ⏳ | ⏳ | ⏳ | |

- **Tested on:** ⏳ (date; SteamOS version from Settings › System; Plasma and KWin versions from `capture-test.sh info`)
- **Browser, Zoom and OBS versions:** ⏳
- **Test window's `resourceClass` (from `capture-test.sh inspect`), native / XWayland:** ⏳

### Verdict

⏳ Choose one, then give the reason:

- **Kept.** Linux keeps "hidden by default", using route A or route B.
- **Known gap.** Overlays are visible to screen capture on Linux.

## What the routes rest on (desk research, 2026-11-17)

These come from reading KWin's source at the v6.6.0 and v6.7.0 tags. None of it was tried on a device, and that is what the table above is for.

- **The flag (Plasma 6.6).** `Window::excludeFromCapture` and the window-menu action came in Plasma 6.6 ([kwin!8442](https://invent.kde.org/plasma/kwin/-/merge_requests/8442)). The property can be written from KWin scripts (`src/window.h`), which is route A.
- **The rule and Spectacle (Plasma 6.7).** Plasma 6.7 added the window rule, with the keys `excludefromcapture` and `excludefromcapturerule` ([kwin!8828](https://invent.kde.org/plasma/kwin/-/merge_requests/8828), `src/rulesettings.kcfg`), which is route B. The screenshot plugin, which Spectacle uses, started respecting the flag in the same release.
- **What screencasts drop.** Screencasts of a whole screen or a region leave the window out (`src/plugins/screencast/filteredsceneview.cpp`). A cast of a single window has no such filter, but that window's own content is all it captures.
- **No standard way for an app to ask.** There is no standard Wayland protocol for an app to hide itself ([wayland-protocols!450](https://gitlab.freedesktop.org/wayland/wayland-protocols/-/merge_requests/450) is still open). Tauri's `set_content_protected` does nothing on Linux.

## Issues found

None yet.
