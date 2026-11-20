---
status: accepted; its keeping of the Timeline plugin is superseded by 0051
date: 2026-11-07
---

# One deck widget with a Card view and an Agenda view

A running deck is shown today by two overlay widgets: the flashcard widget (upper left, the current card's points) and a timeline widget chosen by the deck's `timeline:` front matter (Blocks, Waveform or Edge strip). They have their own windows, places and buttons, and a deck shows the timeline only if it asks for one. John wants one widget whose two views show the same run, switched while presenting, with buttons big enough to hit during a meeting (task 307; the deck widget mockup).

## Decision

- **The deck widget** is the one overlay for a running deck. It has two views of the same run:
  - **the Card view**: today's flashcard widget, unchanged except that its text buttons go;
  - **the Agenda view**: today's Blocks timeline, widened from 640 to 960 px, with each card's title and start minute under its bar and never its points. An untimed deck shows bars of equal width, titles only, and a clock counting up.
- **The switch** is a small glyph of the other view, left of ✕, shown while pointed at like ✕. Switching moves the widget to the other view's place and size and changes nothing about the run.
- **Each view remembers its own place and size** (the Card view upper left, the Agenda view bottom centre). Show always opens the Card view (John, 7 Nov, after trying it: at first it opened the view last used); the menu's Agenda view then goes to the Agenda view (the widget's switch became the Look button, 0051).
- **The buttons are in a tab** that slides out from under the bottom edge on both views while pointed at: the deck's name, Previous, Start / Pause / Resume (Stop once the last card is over) and Next, then Stop apart at the end, which asks again ("Stop?") before it stops the deck, at 40 × 34 px, Previous and Next 52 px wide.
- **The record button** (ADR 0041) moves from beside the card's title to the corner, left of the switch and ✕, and is always shown on a deck that records: a red dot in a ring while recording (dimmed while paused), a grey dot in the ring when stopped. A click toggles it; recording again after a stop adds a second recording to the same run. Red means recording, as in every recording app; green is avoided, since macOS uses it for the camera in use.
- **Recording is for every deck** (John, 7 Nov, after trying it, the recordings mockup): the record button is on every running deck, not only those with `record: on`, grey until pressed. Settings › Sessions becomes **Settings › Recordings**, with **Auto record** (off by default) to record every deck from Start, the microphone's state, and where recordings go, shown and not changeable. The deck editor loses its Record my voice switch, and `record:` is retired like `timeline:`. This replaces ADR 0041's per-deck choice. The card's deck bar is likewise always at the bottom, and `deck-bar:` retired.
- **Both views start at 75% opacity.** It stays the one opacity every overlay shares, and where it is changed is this change's: the default becomes see-through at 75%, and everyone's saved look is moved there once, as the Waveform move was (John, 7 Nov); a choice made after that stays.
- **Preview on screen** opens the deck widget in the Card view, marked Preview, with the switch working; the editor's own preview is the same component, showing the same view.
- **For decks, the Waveform and the Edge strip go**, and `timeline:` no longer opens anything: a deck that has the line keeps it as written, unused. The editor loses its Timeline option, the skill stops writing it, and `--check` stops offering its values. The Timeline plugin's Waveform and Edge strip (spec §7) are untouched.

## Considered options

- **The large view as the Waveform.** It was the first proposal; John put the wave on the back burner (7 Nov) for today's coloured bars. It can come back later as a look for the Agenda view.
- **A per-deck choice of the opening view** (`view: card|agenda`, reading `timeline:` as `view: agenda`). It keeps the deck file in charge, but John wanted every deck to start the same way, on its card.
- **The buttons in the Waveform's capsule**, a pill 6 px below the panel. It floats free of the panel and fades in; the tab, joined to the edge, reads as part of the widget on both views.
- **Names.** "Plan view" clashes with the editor's plan bar, "Strip view" with the Edge strip, and "Bar view" with the Card view's deck bar.

## Consequences

- The flashcard plugin becomes the deck widget, one window with a layout per view; the Card view keeps the flashcard's saved place, and the Agenda view starts afresh at the bottom centre (it is wider than Blocks was). The view showing is kept with the overlays' look (`deckView`), set back to the Card view by Show. The deck timeline window no longer opens.
- Spec §9 replaces "flashcard widget" and "timeline widget" with the deck widget, Card view and Agenda view; the plugins' names, tooltips and the README follow.
- The editor, the Oversay skill and `--check` lose `timeline:`; decks that have it still open.
- Stopping a recording is no longer final for the run (ADR 0041 said "can stop it for that run").
