---
status: accepted
date: 2026-11-18
---

# A deck may override the global Auto record setting with `record-on-start`

Spec §11 said "one setting for every deck, not a per-deck choice" (John, 7 Nov): Settings › Recordings › Auto record. A weekly stand-up should record and an interview deck on a call should never, whatever the switch says; John asked for a per-deck choice in the deck editor (design#9, deck-v3, 18 Nov).

## Decision

- A deck's `deck.md` front matter may carry **`record-on-start: on` or `off`**. Absent, the deck follows Settings › Recordings › Auto record, which stays where it is.
- A deck records at Start when its key is `on`, or when it has none and Auto record is on. With `off`, or none and Auto record off, it records only once the widget's record button is pressed. A preview never records, and the first recording still asks for microphone consent.
- The editor's **Record on start** shows *Use global setting*, **On** and **Off**, and a way back to the global setting that removes the key.
- It is a **new key**. The retired `record` (spec §9) is never read: old files may still carry it, with an old meaning, and reading it would wake old lines.
- It lives in `deck.md`, not `sessions.json`: it is a deck option, like `timing`, and travels with the deck folder; `sessions.json` is a record of runs.

## Considered options

- **Reuse `record`.** Old files would change behaviour.
- **Store it in `sessions.json`.** That file is rewritten by runs and holds history, not choices.
- **Keep one global switch.** Reversed: John wants a deck to differ.

## Consequences

- Reverses the 7 Nov "one setting for every deck"; spec §11 and §9 are updated in the same change.
- `Oversay --check` and the AI skill's deck format accept the new key and values `on` / `off`.
