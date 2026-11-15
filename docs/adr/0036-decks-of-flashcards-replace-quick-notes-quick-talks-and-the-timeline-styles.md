---
status: accepted
date: 2026-10-23
---

# Decks of flashcards replace quick notes, quick talks and the Timeline styles

Oversay grew too many ways to show the same thing: six Timeline styles, a Talking Points overlay that could be its own window, inside the Timeline or not shown, quick notes that count up with no timeline, quick talks that are one-talk project files, and projects. John wants Oversay centred on the card people see during a call, written by an AI as often as by hand (the deck mockup).

## Decision

- **Words.** A **flashcard** is one card: a title, points and an optional time. A **deck** is an ordered list of flashcards. The **flashcard widget** is the one overlay that shows a deck, and the **timeline widget** is its timeline popped out into a window of its own. These are working names; the user-facing name is still open, so the words live in one place in the UI and can be swapped.
- **A deck is a quick note with times** (ADR 0026), one Markdown file in `Documents/Oversay/Decks/`. `## Card [3m]` is a card; `[3m, demo]` gives it a kind; `[~3m]` is about three minutes and still moves on; `[open]` or no time makes it untimed. The same reader, the same line-keeping and save-as-you-type, and the same skill checks (ADR 0035) apply. Front matter, all optional:

  | Key | Values | Default |
  | - | - | - |
  | `audience` | who it's for (`with` is read the same; John, 23 Oct) | |
  | `tags` | comma-separated tags, for finding and grouping decks | |
  | `timeline` | `off`, `waveform`, `blocks`, `strip` | `off` |
  | `timing` | `on` \| `off`: off keeps the times but runs every card untimed (John, 23 Oct) | `on` |
  | `auto-advance` | `on`, `off` | `on` |
  | `deck-bar` | `bottom`, `top` | `bottom` |
  | `colour` | `kinds`, `one` | `kinds` |
  | `hide` | what the card leaves off: `position`, `bar`, `next`, `left`, `ends` | none |
  | `made-with` | `Oversay skill <version>` (ADR 0035) | |

  Every option is per deck. There is no global default in Settings: the AI sets them by writing the file.
- **One flashcard widget for every deck.** It is the minimal Talking Points overlay in the waveform's look (ADR 0029: 4 px frame, 20 px corners, Dark or Light) with the One card's timing, laid out title first (layout A): the card's title and its countdown, "2/4", the numbered points with the Markdown of ADR 0025, a thin deck bar with one segment per card (at the bottom or the top), the next card, time left in the deck, and the clock time it ends. Previous / Pause / Next show on hover. Which of these show is per deck (`hide`).
- **The widget never jumps in size.** When a card needs more or less room the window grows or shrinks over about a third of a second, and the new card's words fade in.
- **Show opens the first card Ready**, paused at its full time, until Start or Space. Every deck has Start, timed or not.
- **Auto-advance** (on by default): a timed card turns amber in its last 10 seconds, then the next card shows, with no sound. The last card stays and counts on in red (`+0:23`) until Stop. With Auto-advance off every timed card does that, and the widget says "Press Next for …". An untimed card counts up and waits for Next. A card's clock is all the time it has been shown, over every visit: Previous and Next carry a card on from where it was left, and a card gone back to after its time ran out comes back over its time, counting on in red and waiting for Next, so the time spent on it adds up for the look back after the deck (John, 23 Oct; first decided as a restart at full time). Pause stops the clock. This changes the session rule "Nothing advances automatically" (spec §5) for decks.
- **Colour** is per deck and shared by every widget: **By kind**, the app's segment colours as in the editor's plan bar, or **One colour**, the waveform's ink.
- **The timeline widget** is per deck: Off, Waveform (ADR 0029), Blocks (the plan bar, live) or Edge strip. An untimed deck has none.
- **Every Start is a session.** The time spent on each card is recorded, timed or not, for an After the deck view of planned against actual. Nothing about a run is written into the deck file, as ADR 0026 has it for notes.
- **What goes.** Quick notes and quick talks move into decks in this epic, and their pages leave the rail for **Decks**. The Timeline styles Blocks-as-a-style, Clock card, Side rail and One card go, with the Talking Points placement (ADR 0024) and its indicator and button-edge options. Kept: Dark / Light, opacity, hiding from screen sharing, and the remembered place and size.
- **The AI skill writes decks** when times are asked for (ADR 0031, 0035), and `oversay://decks/<name>` and `oversay://decks/<name>/show` open and show one (ADR 0032).
- **Projects are out of scope.** A way of grouping decks (by product, or by week such as "week 42") will replace them later. A deck can already say who it is for in `audience`, and carry `tags`. Adding a deck to a project is a later ticket.

## Considered options

- **Decks beside quick notes and quick talks, migrated in a later epic.** Two ways to write a meeting's notes for longer. John chose to replace both now.
- **A new file format.** JSON, like quick talks, carries sessions and kinds but doesn't read well in other editors or come easily from a chat. The quick-note format already parses times and kinds.
- **A global timeline setting with a per-deck override.** One more place to look. Per deck only, set by whoever writes the deck.
- **Layouts B (countdown first) and C (bar on top).** C survives as the `deck-bar: top` option; B was dropped.
- **No warning at 0:00, or a "Next in…" bar to cancel.** Amber for 10 seconds is enough warning, and Pause stops the move.

## Consequences

- A deck's sessions are kept beside the decks, in `Decks/.sessions/<deck name>.json`, the newest 20 (John, 23 Oct): they sync with the decks, an AI can read them for a look back, and the deck file stays the person's text. Renaming a deck in Oversay renames its sessions, and moving it to the Trash takes them too; a rename outside Oversay leaves the old sessions behind under the old name. Considered: Oversay's app data (stays on one computer, and an AI can't see it) and one file for every deck (grows with every run).
- The session engine (spec §5) gains automatic moves and a clock per card that adds up over its visits, which talks never had. Quick talks' sessions are kept when they are converted.
- Until the migration task, the old pages and styles stay. Decks are added beside them and then replace them, so nothing disappears before it has somewhere to go.
- ADR 0024 (Talking Points placement), 0026 (quick notes), 0027 (quick talks), 0029 (the waveform as a Timeline style) and 0032 (links) are changed by this one, and say so.

*Changed by ADR 0037: a deck is a folder holding `deck.md`, its sessions as `sessions.json` (not `Decks/.sessions/<name>.json`) and its `resources/`, known by an id in its front matter, not its name.*

*Changed by ADR 0038: the way of grouping decks that replaces projects is workspaces holding collections, in `Documents/Oversay/Workspaces/`; a collection lists decks by id, and a deck's `project:` line becomes a collection.*

*Changed by ADR 0041: a deck keeps its newest 20 sessions plus any with a note, a transcript or a review, and a session's look back moves to the Sessions screen as well as After the deck.*

*Changed by ADR 0042: one deck widget, with a Card view and an Agenda view, replaces the flashcard and timeline widgets; `timeline:`, `record:` and `deck-bar:` are retired, and decks that have them still open.*
