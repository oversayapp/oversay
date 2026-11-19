---
status: accepted; its menu is superseded by 0051
date: 2026-10-11
---

# The Timeline has Start and End, and the menu-bar icon drives the session

The Timeline is what you present with, so it holds the session's buttons, and two places to start and stop a talk is one too many. Which overlays open and whether they are hidden from screen sharing are chosen at the start, on the Get ready page (ADR 0019); keep on top is a way of using the app, not a setting. The Control Panel (ADR 0028) is for how the overlays look and what is on screen, and is never shared.

## Decision

- **The Timeline has the buttons.** In Ready the middle button is a labelled **▶ Start**; once running it is Pause / Resume, with Previous and Next either side. **End** is on the Timeline too: a talk may stop before its last segment, so it must be possible to end it there. Because it throws the session away, the first click asks ("End?") and a second click within a few seconds ends it.
- **The menu-bar/tray icon has the session's menu** (Start / Next, Previous, Pause / Resume, End session) and the clock beside it. It is the way to drive the session when every overlay is hidden (`tray.rs`).
- **Ready to start opens the overlays only.** The manager's compact session page has no controls but End session.

## Consequences

- Recording, when it arrives (phase 3), is started and checked from the Get ready page and the Timeline.
- A future plugin gets no switch in a panel: showing and hiding overlays mid-session stays in the manager's live view and the Control Panel.
- Overlay buttons are small and work without taking focus from the slideshow (ADR 0002); End's confirmation is on the button itself, so it needs no dialog.

*Changed by ADR 0039 and ADR 0042: talks and their live sessions went with projects, and decks don't open the Timeline; a running deck is steered from the deck widget's tab (Previous, Start or Pause, Next).*
