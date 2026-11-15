---
status: accepted
date: 2026-10-25
---

# A deck is a folder, with an id, its sessions and its resources

A deck is one Markdown file, `Decks/<name>.md`, and its name is its identity: its sessions live in `Decks/.sessions/<name>.json` and pins, Recent and `oversay://` links all go by the name (ADR 0036). A rename in Finder, by an AI or by a sync tool leaves the sessions behind, and a new deck given an old deck's name can pick up its sessions. John wants a deck's name to be free to change without losing anything, a folder a person can still find their way around, and a place for a deck's documents and links (John, 25 Oct; the epic).

## Decision

- **A deck is a folder** in `Documents/Oversay/Decks/`. Everything about the deck is inside it, so a rename, move, copy or sync in Finder takes all of it along:

  ```text
  Decks/
    Weekly standup 2026-10-25/
      deck.md            the cards; front matter has id and title
      sessions.json      every Start, the newest 20
      resources/         files copied into the deck
  ```

- **Its identity is an `id` in the front matter of `deck.md`**, never the folder's name: a short random id like a project's (`id: d_k3x9a2bq`; spec §3), 8 characters from `a–z0–9` after the `d_` prefix. It is written once, when Oversay first sees the deck, and never changed. Pins, Recent, links and anything else that points at a deck use the id. The generator draws each character uniformly (rejection sampling, not a byte modulo 36, which favoured `a`–`d`), and the Rust side makes ids the same way (John, 25 Oct).
- **Making a deck always makes a new one**, whatever its name: New deck in Oversay never opens or overwrites another deck with the same title, it makes another folder. The AI skill, asked for a deck whose title is already taken, asks whether to add to that deck or make a new one; the person decides (John, 25 Oct).
- **Its name is `title` in the front matter**, or the folder's name without its date when there is none. Renaming a deck in Oversay changes `title` and renames the folder to match, keeping the date.
- **The folder's name is for people**: the title, a space and the day it was made (`Weekly standup 2026-10-25`), so Finder lists it readably and two decks with one name rarely meet. When the name is taken, a counter is added: `Weekly standup 2026-10-25 (2)`. Nothing depends on the folder's name, so a person can rename it.
- **The deck's file is `deck.md`**; in a folder without one, the folder's only `.md` file is the deck. A folder with neither is not a deck.
- **A lone `.md` dropped into `Decks/`** (by an AI, by hand, or imported) is moved into a folder of its own and given an id, so "write a Markdown file" still works.
- **A copied folder keeps its id until Oversay sees two decks with one id**: then the one whose folder was made later gets a new id, and keeps its copied sessions as they are.
- **Resources are whatever is in the deck's `resources/` folder**, and nothing else: there is no list of them to keep (John, 25 Oct). A file dropped on the deck in Oversay is copied in; a URL dropped on it becomes a web link file there (`.webloc` on a Mac, `.url` on Windows), as a browser makes when a link is dragged to Finder. Anything a person puts there in Finder counts too, including a web link, an alias or shortcut to a document or folder kept elsewhere, or a symlink. The deck editor shows the folder's contents and can open the folder.

  Oversay opens a resource only when the person clicks it, handing it to the system as Finder would; it never reads a resource or follows a link inside the folder while reading decks (ADR 0023).

## Considered options

- **An id in a file's front matter, decks still one file each, sessions keyed by id in `.sessions/`.** The smallest change, but a deck's sessions and documents stay apart from it, and a copy or move outside Oversay can still part them.
- **The id in the file or folder name** (`Weekly standup a1b2c3`, or the time to the millisecond). Unique without work, but every name reads as machine output, and a rename that drops the suffix loses the identity.
- **The creation time as the id** (`2026-10-25T11:42:07.123Z`). It repeats the date already in the folder's name; a random id says nothing and so never disagrees with anything.
- **A folder named by the title alone**, with a counter on a clash. A deck made every day would become `Daily team meeting (2)` to `(365)`; the date tells them apart.
- **A `resources:` list in the front matter** (URLs and paths of documents kept elsewhere). One more thing to keep in step with the folder; a web link or alias file in `resources/` does the same job and is made by dragging (John, 25 Oct).
- **Oversay making symlinks** for documents kept elsewhere. Sync services copy, drop or break them, and Windows needs admin rights or Developer Mode to make one. Oversay makes web link files and copies; a link a person makes is theirs, and only ever opened by the system.

## Consequences

- ADR 0036's sessions in `Decks/.sessions/<name>.json` are replaced by `sessions.json` in the deck's folder, and its "a rename outside Oversay leaves the old sessions behind" goes away. ADR 0034's watcher looks one level down. ADR 0032's `oversay://decks/<name>/show` takes an id as well as a name.
- Existing decks are not migrated as such: there are none to keep before Oversay is public, so they are started again with the example deck (John, 25 Oct). A lone `.md` left in `Decks/` is wrapped like any other, sessions included.
- The AI skill writes a folder with `deck.md` in it, with a title and no id: Oversay gives it its id when it first sees it, since a model's "random" ids are not (John, 25 Oct). An older skill's lone file is wrapped as above.
- Epic 017 (project resources) is replaced: resources belong to decks, since projects are out of scope (ADR 0036).

*Changed by ADR 0041: a session in `sessions.json` may have a `note`, the newest 20 are kept plus any with a note, a transcript or a review, and the deck's folder also holds `transcripts/` and `reviews/`.*
