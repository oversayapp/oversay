---
status: accepted
date: 2026-11-18
---

# Resources belong to the workspace, and the deck editor has a plan bar and two tabs

ADR 0037 gave a deck a `resources/` folder; ADR 0040 gave a workspace one too, and listed each deck's under it as "From its decks". In use the two lists were confusing: material is kept for a talk or a course day, not for one card deck, and a deck in several workspaces showed its resources in all of them. The deck editor had grown to a long page with its preview and options crowded into a side column. John shaped two designs (oversayapp/design#9: deck-v3 and workspace-v2) and decided on 18 Nov.

## Decision

- **Resources belong to a workspace only, never to a deck.** "From its decks" goes. A deck in no workspace holds no resources. This changes ADR 0037's "a deck's resources" and ADR 0040's "From its decks"; the rest of both stands.
- **The workspace page** shows them as a tab, **Decks | Files and links**, with a count. The 200 MB limit and `.webloc` / `.url` link files carry over unchanged. (John left the layout open; this was the proposed one, option 2.)
- **Existing per-deck resources move up once**, on the first launch after the update: a deck in one workspace moves its `resources/` into that workspace's; in several, copies them into each; in none, leaves them in the deck's folder. A taken name gets ` (2)`. A one-time note, with Undo, says what moved. (Proposed call; John can overrule.)
- **Add resource to workspace**, in the deck editor: a deck in one workspace goes straight to it; in several, straight to the one it was opened from, and it asks only when opened from outside (the Library); in none, it offers to put the deck in a workspace first.
- **The deck editor** has no Library pane. Its left column holds the preview, the deck's facts and Add resource to workspace; across the middle the plan bar over two tabs, **Cards** and **Settings** (About, Timing, Recording, Look). The way back, at the left of the search bar's row, returns to the place the editor was opened from.

## Considered options

- **Keep resources in decks and show them in workspaces.** What was built; rejected by John: two places for one thing.
- **Delete the old per-deck resources.** Loses files; moving them up loses nothing.
- **Always ask which workspace.** One click too many in the common case.
- **A side column or a pinned shelf for the workspace's resources.** Drawn in workspace-v2; the tab leaves room for a drop zone when empty and a filtered grid when full.

## Consequences

- The Rust `Owner::Deck` stays only for the migration; the deck editor stops calling it.
- A deck copied or moved between workspaces carries no files; they stay with the workspace.
- An AI skill that wrote into a deck's `resources/` has nowhere to now; the skill never did.
