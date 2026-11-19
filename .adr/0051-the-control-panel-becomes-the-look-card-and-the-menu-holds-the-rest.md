---
status: accepted
date: 2026-11-19
---

# The Control Panel becomes the Look card, and the menu holds the rest

Supersedes: 0028, 0024 and 0029; and in part 0020 (its menu), 0021 (the edge strip) and 0042 (keeping the Timeline plugin).

The Control Panel (ADR 0028) was a 330 px window down the whole right edge: the run with its buttons, which overlays were on screen, the Timeline's styles and Talking Points' text size and Shows, sharing, and the keys. Since then a deck has had only the deck widget (ADR 0036, 0042), which carries its own buttons on its tab, so most of the panel repeated something or set something nothing read. John asked for it to be much slimmer, with the keys in the menu-bar / tray menu (19 Nov), and chose Panel A (the Look card) with Menu 1 (the flat menu) from the design (oversayapp/design PR #13).

## Decision

- **The Look card** replaces the panel: a 286 px card at the top of the right edge, as tall as what it shows, with Opacity (a slider) and See-through / Solid, Dark / Light, and Hide from screen sharing. It keeps the panel's window, label and rules: never captured, non-activating, hidden rather than closed. It opens from Look panel in the menu, ⌃⌥P (Ctrl+Alt+Shift+P), the Dock and jump-list item, and a left-click on the Windows tray icon. With nothing running it puts a sample deck (the "Why bees matter" example) on the deck widget while it is open; that preview ends when it closes.
- **The menu is flat** (Menu 1): the greyed status lines, the run (Start or Pause / Resume, Next, Previous, Stop deck; with nothing running, Show a deck ▸ with the pinned decks and Open Library…), the look (See-through / Solid, Opacity ▸ with five steps and More solid / More see-through, Dark / Light panel), Hide from screen sharing, then Look panel, Open Oversay, Settings… and Quit Oversay. Each item shows its registered key as its accelerator. It is built in Rust from a model (`tray_menu.rs`) and rebuilt when the run, the look, sharing, the card or the pinned decks change.
- **The icon** shows the card's time beside it on a Mac (`set_title`, Mac only); on Windows the time is in the tooltip and the icon has a dot while a deck runs. Both have an amber dot while the deck widget is visible in screen shares.
- **Gone for good:** the run and the keys list from the panel; the deck widget's on/off (it is the only overlay); everything left from the Timeline (its plugin, Waveform, Edge strip, Next Timeline style and ⌃⌥T, Buttons, Edge strip sits against, the Waveform's 50% opacity floor); On screen, Talking Points' text size and Shows; the full-height dock and the code that pushed overlays out from under it. Saved values for them are ignored when read and dropped the next time the look is written.

## Why

A slider is the one thing a menu can't draw (Tauri's menu has no slider, custom view, radio item or section header), and John wanted opacity in pride of place while watching the widget over a real slide, so a small window stays for the look; everything triggered or set once is one click away in the menu, which works with every window hidden. Panel B (no window, a popover from the icon) would take focus from the slides to close on an outside click and lose the idle preview. Menu 2 (the look in one Look ▸ submenu) is shorter but puts the look two steps away.

## Consequences

- Ticks are check items the app keeps to one, and the menu is rebuilt rather than updated in place; a Windows menu does not change while it is open, so its status line is as of opening.
- With nothing running only the Look card's key is registered (as ADR 0028 decided), so the idle menu shows no other keys.
- A coloured dot means the Mac icon is not a template image while it shows; its glyph is drawn white on a dark menu bar.
- Card / Agenda view and Record are not in the menu (they are on the widget), keeping it short.
