---
status: accepted
date: 2026-11-18
---

# The Library holds decks and workspaces, and one + New makes anything

ADR 0039 and 0040 gave the rail a Decks item and a Workspaces item. In use, a new person had to wonder which to open, Pinned and Recent were kept twice, the pane had a New button that offered the same choices as the rest of the app, and templates could not start anything. John chose the Library design (oversayapp/design#8, 17 Nov) and asked that the search bar stay where it is (18 Nov).

## Decision

- **One rail item, Library**, replaces Decks and Workspaces. A workspace is still a tagged group of decks and a deck can be in several (ADR 0040 is unchanged); only where they are shown changes.
- **The Library's left pane** lists smart groups first: Recent, Pinned and This week (decks and workspaces together), then Unsorted (decks in no workspace, only while there are some), then the workspaces, then All decks. Pinned and Recent become one list each.
- **One way to make things:** a filled **+ New** beside the search bar, and ⌘N, open the bar on Blank deck, Deck from a template… and Workspace…. Looking at a workspace, a new deck goes in it. The pane has no New button.
- **The search bar becomes a command bar** (⌘K, ⌘F): it finds decks, workspaces, templates and settings, and acts (New deck, From a template, New workspace; on an open deck Show, Add to …, Take out of …). It stays on its own row, not in the title bar.
- **A workspace's description** is its existing `notes` field, shown and searched as Description. Its when and where stay in the file and are no longer shown.
- **Templates start decks** (the step ADR 0039 left for later): a template's segments become a deck's cards with kinds and times, an open segment an untimed card. The Templates page and the picker are one component. Deleting a template or a category always asks first and says whether it can be brought back.

## Considered options

- **Keep Decks and Workspaces and add Library on top.** Three places for the same things.
- **Move the search bar into the title bar.** Rejected by John (18 Nov): it stays where it is.
- **A separate New button in the pane.** It offered nothing the bar cannot do.

## Consequences

- Spec §4, §9 and §10 describe the Library, the command bar and the picker; ADR 0039's notes on Templates point here.
- The old Workspaces page's tag rename, merge, delete and colour screens are gone; the rules stay in `lib/workspaces` and a later epic can give them a place (John, 18 Nov: leave it out for now).
- Template category chips, the page's search box and the mini plan bar are gone.
