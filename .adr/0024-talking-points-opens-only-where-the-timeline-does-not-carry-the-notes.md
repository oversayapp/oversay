---
status: superseded by 0051
date: 2026-10-14
---

# Talking Points opens only where the Timeline does not carry the notes

Every overlay opens with every session (ADR 0018), from the Get ready page (ADR 0019). Talking Points shows the current segment's points and hints, and the one card Timeline style already shows them. Opening both would put the same words on the screen twice.

## Decision

- **A plugin can say whether it opens for a look** (`opensWith(look)`, beside `windowFor`); it always does when it doesn't say. Talking Points does not open with the one card style. Ready to start opens, and the Get ready page lists, the same answer (`overlaysFor`), so the list and what opens cannot disagree.
- **The answer is derived from the look, not stored.** ADR 0018 says that someone who wants a plugin off for good gets "a setting for the plugin". The one card style is not that setting: it is a Timeline that carries the notes. The setting itself (Talking points: own overlay, in the Timeline, not shown) feeds the same `opensWith`.
- **An open session follows a change of look.** Choosing one card (in Settings or with the next-style hotkey) hides Talking Points at once and leaving it shows it again, where it was: windows are hidden, never destroyed (ADR 0002). Only overlays whose answer changed are touched, so an overlay the presenter closed with ✕ stays closed while the style moves between styles that all open it.
- **The Get ready page says where the notes will be** (`shownAs(look)`): "Talking Points · its own overlay, top left" or "· on the Timeline card".

## Consequences

- The manager follows the look while a session is open (`followLook`), so the manager's page must be running, as it already must for the next-style hotkey (ADR 0021).
- An overlay closed with ✕ comes back if the look moves from one that hides it to one that shows it. That is a change the presenter asked for.
- A future plugin that should open only for some looks adds `opensWith`; nothing else changes.

*Changed by ADR 0036: decks of flashcards replace the Talking Points placement; one flashcard widget shows every deck.*
