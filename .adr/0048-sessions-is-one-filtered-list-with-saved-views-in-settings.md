---
status: accepted
date: 2026-11-18
---

# Sessions is one list narrowed by tabs and chips; saved views live in settings

Spec §11 grouped runs by day with a Filter popover. With hundreds of runs, and a person wanting one deck's or one workspace's runs, John chose option 3, "Filters over one list", of the Sessions v2 design (design#11, 18 Nov).

## Decision

- One full-width list of every run, newest first. **Tabs**: All, This week, Needs a review, then the person's saved views. **Chips**: Workspace, Deck (searchable, scoped to the chosen workspaces), Status (Needs a review, Review ready, Has recording, No note), When (Any time, This week, Last 30 days, Last 3 months), and Group by (Recent first, Day, Month, Deck, None). The list pages by 30 with Show more.
- With exactly one deck chosen, its **Record on start** (ADR 0047), stats and planned-against-actual trend sit above the list; with one workspace, a summary line.
- **Needs a review** is derived, never stored: a note or a transcript, no review, and not a test run. A **test run** is one that ran under a minute or reached fewer than half its cards.
- **Saved views** are named sets of chips, kept in `settings.json` as `sessionViews`, shown after the ready-made tabs; "+ Save this view" appears only when the chips match no tab. `sessions.json` is unchanged (ADR 0041); workspaces are joined by each deck's current membership.
- The one search bar finds sessions by deck, workspace and note.

## Consequences

- Replaces the Filter popover and the "between dates" range of spec §11.
- The page's chips and grouping are kept while a session is open, so the way back returns to the same list.

*Changed by epic 044 (#100): the way back from a session's page opened by a run ending, or by a deck's View last session, opens All with no filters (grouping kept), as that page wasn't opened from the list and the filters left may not hold the run.*
