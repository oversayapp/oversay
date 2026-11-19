---
status: accepted; its edge strip is superseded by 0051 (the Timeline is gone; the deck widget's views keep a window each)
date: 2026-10-12
---

# Each Timeline style has its own window, and the edge strip docks to an edge

The Timeline has several styles (epic 007) that are different shapes: wide waves, a strip along an edge, two cards and a tall rail. One remembered window rectangle fits none of them, and a style chosen in Settings has to resize and move the overlay that is already open.

## Decision

- **A style names its window.** The plugin returns an `OverlayWindowSize` for the saved look (`windowFor`): a size, a minimum, a `place` (centre, a corner, the right rail, a bottom strip) and a `layout` (the style's id). Changing the style on an open overlay calls `set_overlay_layout`, which resizes and moves the window without reopening it.
- **Frames are remembered per layout by us.** Rust keeps the frame each overlay last had in each layout, in `overlay-layouts.json` in the app data folder (`overlay::Layouts`), and restores it when that layout is chosen again if it is still on a display. `tauri-plugin-window-state` is denied for `overlay-timeline`: it keeps one frame per window, which would put a strip's frame on a card.
- **The edge strip is always docked.** Whatever the user drags or resizes it to, once it has stopped moving for a quarter of a second it becomes the display's whole width and flush with its bottom edge (`overlay::dock_strip`). *Amended 2026-10-15 (John's request): it used to go to the nearer of the top and bottom edge; the top edge is gone, and with it the `overlay-dock` channel that told the strip to draw itself upside down.* It is not done while the drag is going on: that fights the drag. If the system won't put it there, it isn't asked again from the same place.
- **Against the screen's edge or above the Dock.** A setting (Settings › Overlays; default the edge of the screen) chooses the area the strip is docked to: the display's whole screen or its work area. With a full-screen slideshow the Dock is hidden, so the edge is right.
- **The manager owns the saved settings**, so the "next Timeline style" hotkey and menu item are an event to the manager, which saves and sends the new look like a choice in Settings.

## Consequences

- A Timeline position saved by the window-state plugin before this is ignored once; the first run of a style opens it in its place.
- `overlay-layouts.json` is a second place a window's position is kept, and it must stay readable by older builds: an unreadable file is ignored with a warning, not an error.
- Docking is a debounce, not a mouse-up: holding the strip still for a quarter of a second mid-drag docks it. Tauri gives no drag-end event.
- Anything that moves an overlay programmatically triggers the same docking; it is a no-op when already docked.
- A strip the system refuses to move to the bottom (it isn't asked again from the same place) is left where it is, drawn the bottom-edge way up.
- The hotkey and menu item for the style need the manager's page to be running (it is hidden, not closed, during a session).

*Changed by ADR 0036: the Blocks, Clock card, Side rail and One card styles went, leaving the Waveform and the Edge strip; and by ADR 0042: decks no longer open the Timeline.*
