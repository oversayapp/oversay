---
status: accepted
date: 2026-10-25
---

# Workspaces hold collections, and collections list decks

People sort what they use Oversay for in ways Oversay can't predict: projects, conferences, meetings, clients. A conference workspace might hold "AppSec June 2026" and "Infrastructure 2026", each with a deck for a general audience and one for a panel on Zoom. A deck can belong to none of these, join one later, or be in several at once (John, 25 Oct). Projects today hold talks, not decks, and a deck's `project:` line only groups by a name. Since ADR 0037 a deck is a folder in `Decks/` known by the `d_` id in its front matter, so anything can point at it by id and survive a rename.

## Decision

- **Three words.** A **workspace** is a named group, named for what the person uses it for (Projects, Conferences, Meetings). A **collection** is an item in a workspace that holds decks ("AppSec June 2026", "Spring Keynote"). A **deck** is as before (ADR 0036, 0037). "Collection" reads the same in any workspace, where "project" would not ("a project in Projects").
- **Two levels, no more.** A workspace holds collections only: never decks directly, and a collection never holds another collection (John, 25 Oct).
- **Decks live once, in `Decks/`**, as folders known by their id (ADR 0037). A collection lists the ids of its decks; a deck can be in any number of collections or in none, and can be added to one later. All decks, the pool, is always one click away.
- **Workspaces and collections are folders** under `Documents/Oversay/Workspaces/`, so each has one home a person can see, back up and send:

  ```text
  Documents/Oversay/
    Decks/                        every deck, once (ADR 0037)
      Panel prep 2026-05-20/
        deck.md                   id: d_k3x9a2bq
    Workspaces/
      Conferences/                a workspace
        AppSec June 2026/         a collection
          collection.json         its id, its decks in order, when, where, notes
          resources/              material shared by its decks
      Projects/
        Spring Keynote/
  ```

  ```json
  { "version": 1, "id": "c_4hx8m2qa", "name": "AppSec June 2026",
    "decks": ["d_k3x9a2bq", "d_7mq2xw4f"],
    "when": "2026-06-02", "where": "Zoom", "notes": "Panel with Ana and Raj" }
  ```

  A collection's id is `c_` and 8 characters from `a–z0–9`, made by the same generator as a deck's (`ids.ts`, `ids.rs`; ADR 0037). It is what points at the collection, so renaming its folder or its workspace's loses nothing. As with decks, Oversay writes the id when it first sees a collection without one (the AI skill writes `collection.json` without an id), and when a copied folder brings a second collection with the same id, the one made later gets a new one.
- **Names are for people, as a deck's are.** A collection's name is `name` in `collection.json`, or its folder's name when there is none; renaming it in Oversay changes both, and a taken folder name gets a counter (` (2)`). A collection's folder has no date in its name: unlike a deck made every day, a collection is made once for one occasion. A workspace is only a folder, and its name is the folder's.
- **Removing a deck from a collection leaves the deck** in `Decks/`. Moving a deck to the Trash takes it out of every collection. A collection that lists a deck Oversay can't find shows it as gone, never as an error.
- **The deck's `project:` line goes.** Decks that have one are added, once, to a collection of that name in the Projects workspace, which Oversay makes on first start; the line is then kept as written and unused, and the skill stops writing it.
- **Today's projects become collections in the Projects workspace**, and their talks become decks, in a later epic that also replaces the talk editor, its Timeline and Get ready with decks. Until then projects stay as they are, beside workspaces.

## Considered options

- **Folders all the way down**: a deck lives inside its collection's folder. Finder shows the structure, but a deck can be in only one place, and John wants a deck in several or none.
- **A workspace as one JSON file** listing collections and decks. The same references, but a workspace's collections then have no folder for their shared resources, and one file holds everyone's edits.
- **Workspaces as saved tag filters**. A deck can be in many, but there is no place for a collection's own details or resources, and a typo in a tag drops a deck.
- **Workspaces directly in `Documents/Oversay/`**. Fewer levels, but they sit beside `Decks/` and the app's other folders and read as the same kind of thing (John, 25 Oct).
- **Collections listed in each deck's front matter** (`collections: c_4hx8m2qa`). The deck would carry its own memberships, but a collection's order would have no home, and adding a deck to a collection would rewrite the person's text.

## Consequences

- `collection.json` is checked as it is written, like a deck's front matter (ADR 0035). The AI skill makes collections and adds decks to them by id, and `oversay-local.json` lists the Workspaces folder beside Decks.
- Oversay watches `Workspaces/` two levels down (ADR 0034), so a collection made or changed by the skill or in Finder shows up while it runs.
- A collection's `resources/` works as a deck's does (ADR 0037): whatever is in the folder, opened only when clicked.
- Search and the Decks filters can be scoped to a workspace or a collection; the `project` filter becomes a collection filter.
- ADR 0036's "projects are out of scope", and its later way of grouping decks, is this ADR. ADR 0013 (a project's folder in `Documents/Oversay/Projects`) is changed by this one once projects move into the Projects workspace. Both say so.

*Changed by ADR 0039: workspaces replace projects now, with nothing converted; Workspaces takes Projects' place on the rail, and Decks is every deck again.*

*Changed by ADR 0040: collections go; a workspace is now a tagged group of decks, in `Workspaces/<name>/workspace.json`.*
