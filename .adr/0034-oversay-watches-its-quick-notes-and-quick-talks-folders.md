---
status: accepted
date: 2026-10-21
---

# Oversay watches its Quick notes and Quick talks folders

Once an AI writes notes while Oversay runs, two rules stop being enough: lists read only when a page opens, and "a note edited elsewhere is read again when next opened, last write wins" (ADR 0026). task 153 chose "no background watcher" for projects, which are saved explicitly. Notes save as you type, so the next autosave of an open note would silently overwrite what the AI just added.

## Decision

- **The Rust side watches `Documents/Oversay/Quick notes` and `Quick talks`** (the `notify` crate, events debounced) while the app runs, and tells the frontend which files changed.
- **Lists refresh.** A note or quick talk not yet opened in Oversay shows **New** until it is. Home and Notes show one calm banner for the newest arrival, with Open and Show. Oversay can't tell who wrote a file, so it says "added outside Oversay". Nothing is shown on the overlays or during a session.
- **An open note reloads** when its file changes and nothing typed is waiting to be saved. It then says what changed.
- **If something typed *is* waiting**, the outside version is kept straight away as its own note, "<name> (outside)", and what was typed is saved in the note. Then it asks:
  - **Keep both** leaves it so;
  - **Use theirs instead** puts the outside version back in the note and moves the copy to the Trash.

  Keeping the copy before asking means a quit or a crash while the question is open loses neither side.
- **Every autosave checks first.** Before writing, the note's file is read: if it isn't what Oversay last read or wrote, the same rule applies. So a save that runs before the watcher's event arrives can't overwrite the outside change.
- **Our own writes are told apart by contents.** Oversay keeps the text it last read or wrote. A change event whose file holds that text, or exactly what is typed, is ours and is ignored. Modified times were considered, but a save can land within one tick of the clock.
- **New is kept in settings** (`quickSeen`): the files each folder held at the last listing, and those that appeared since and haven't been opened. The first listing only learns what is there, so existing notes are never New. Files Oversay makes or renames itself are known straight away.
- **Projects are unchanged**: task 153's check when the window regains focus still applies to them, in their later epic.

## Considered options

- **Re-read when the window regains focus, as planned for projects.** It is enough for the open note, but a list on screen would stay stale while the person watches their AI work, and the AI page's "Try it" couldn't see the note arrive.

## Consequences

- A watcher on a synced folder (iCloud Drive, OneDrive) sees the sync tool's writes too. They are handled the same way.
- The Try it panel (design A) and the first-run hand-off use the same events.

*Changed by ADR 0037: Decks is watched one level down too, since each deck is a folder; changes to a deck's sessions and resources are not reported.*
