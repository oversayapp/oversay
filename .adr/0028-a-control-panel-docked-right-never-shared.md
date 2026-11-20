---
status: superseded by 0051
date: 2026-10-19
---

# A control panel docked right, never shared

The Timeline carries Start, Pause, Next and End itself (ADR 0020), so a panel that only repeated them has no place. What was missing was one place for the rest: each overlay grew a ⋯ menu for how it looks, the look gained more choices (panel colour, text size, what shows; the epic), and quick notes put a second kind of run on screen. John asked for one central place for these, reached from the menus, never in a screen share, at the right-hand side of the screen (17 Oct).

## Decision

- **One control panel window**, `control-panel`, docked to the right edge of the display the pointer is on, full height of its work area, 330 px wide. It is not an overlay plugin: it is not part of a session's workspace, and it doesn't take the overlays' look.
- **Always hidden from screen sharing and recordings** (content protection on from creation), whatever the overlays' setting; `set_hidden_from_capture` leaves it alone.
- **Non-activating, like the overlays** (ADR 0002): it is made a panel by `platform::float_over_fullscreen` before it is first shown, so clicking it never takes focus from the slides, and it is hidden, never closed (platform::exit_now).
- **What it holds:** what is running with its buttons (a talk: Previous, Pause, Next, End; a shown note: Previous topic, Next topic, Close notes), which overlays are on screen, the overlays' hiding from screen sharing, how they look (the ⋯ menus come off the overlays, which keep only ✕), and the keys. It changes the look through the manager, which owns the saved settings (`control-panel-look` event), as the hotkeys do.
- **How it opens:** ⌃⌥P (Ctrl+Alt+Shift+P on Windows), the session icon's menu (menu bar or tray), and with nothing running from the Dock menu on a Mac and the taskbar button's menu on Windows. It toggles: the same key or menu item closes it.
- **Available any time** (John, 17 Oct): the menu-bar or tray icon stays for the life of the app (with no time beside it and a short menu when nothing runs), the panel's key is registered all the time, and with nothing running the panel puts a sample talk on screen as a **preview** session (never recorded, without hotkeys of its own, ended when the panel closes, and replaced by any talk or note).
- **The Dock and taskbar menus need platform code:** Tauri has neither, so `platform.rs` adds the Dock menu to the app delegate at run time, and on Windows a jump-list task starts the app with `--control-panel`, which the single-instance plugin hands to the running app.
- **The side rail style moves left** beside it while it is open, so the side rail is never under it: any overlay under the panel is moved just left of it, and put back when the panel closes.

## Consequences

- A second always-on-top window at the right edge: overlays that open or change style while it is open are moved out from under it (`control_panel::keep_clear`), and a place remembered while pushed aside is the pushed-aside one until the panel closes.
- The panel is a webview of its own, reading the session and the look from the state channels like an overlay; it doesn't load the manager's stores.
- Because it is never captured, a presenter sharing their whole screen can keep it open; nothing in it can leak into a recording.
