# The deck format

A **deck** is Markdown read as cards and points (see [note-format.md](note-format.md) for cards,
points and what is kept but not shown); what the person calls a note is a deck without times.
Oversay shows one card at a time on its flashcard widget. A card with a time counts down and gives
way to the next by itself when the time is up; one without waits for Next. Each deck is a folder
in Oversay's **Decks** folder, named for people (the deck's name and the day it was made), holding
its `deck.md`; Oversay keeps the deck's runs beside it in `sessions.json`. A deck has no resources of
its own: the files and links the person keeps are in its workspace's `resources/` (workspace-format.md).
A deck folder from an older Oversay may still hold a `resources/` folder, which the person's Oversay moves up:

```text
Decks/
  Stand-up 23 Oct 2026-10-23/
    deck.md
    sessions.json     Oversay's; leave it alone
    resources/        only in an older deck's folder; the person's, read only when asked
```

`Decks/Stand-up 23 Oct 2026-10-23/deck.md`:

```markdown
---
title: Stand-up 23 Oct
audience: Platform team
tags: stand-up
made-with: Oversay skill 0.1.0
---

# Stand-up 23 Oct

## Intro [1m, intro]
- Who's here, who's out

## Atlas [3m]
1. Sync engine merged, behind a flag
2. **Blocked** on the auth review
```

## Cards

- `## Name [3m]` is a card of three minutes. `[3m, demo]` gives it a kind as well, which is its
  colour (the kinds are in note-format.md). `[~3m]` is about three minutes and still moves on.
- A card with no time, or `[open]`, is untimed: it counts up and waits for the person to press Next.
- Give a card a time only when the person gave one, and give each card the time they gave it;
  together they add up to what was asked. A meeting's length alone is not a time for each card.
- Keep points short: they are read at a glance while speaking. Numbered points (`1.`) suit a deck.

## Front matter

A deck the skill makes always has `title` and `made-with: Oversay skill <version>`; every other
key is optional: leave out what the person didn't ask for and Oversay uses its default. Decks have no `when` or
`length`: use `audience` for who it is for (older decks say `with`; leave theirs as it is).

| Key | What it does |
| - | - |
| `id` | What Oversay knows the deck by (`d_k3x9a2bq`). Oversay writes it when it first sees the deck: never write, change or copy one. |
| `title` | The deck's name, as the person said it; Oversay lists the deck by it. |
| `audience` | Who the deck is for, shown on the Decks list. |
| `project` | From before workspaces: older decks may have it, and Oversay put each such deck in a workspace of that name. Leave theirs as it is, and never write one: to group decks, [add them to a workspace](../SKILL.md#workspaces). |
| `tags` | Comma-separated words for finding decks: `stand-up, platform`. |
| `timing` | `off` keeps the times but runs every card untimed. |
| `auto-advance` | `off` keeps a card up when its time runs out, until Next. |
| `colour` | `one` draws everything in one colour instead of each card's kind. |
| `hide` | Parts the card leaves off: any of `position`, `bar`, `next`, `left`, `ends`. |

<!-- generated: make skills writes everything below this line from Oversay's code; don't edit it -->

## Generated from Oversay’s code

**Front matter keys:** `id`, `title`, `audience`, `with`, `project`, `tags`, `timing`, `auto-advance`, `colour`, `hide`, `record-on-start`, and `made-with` from the skill (`with` is read as `audience`, for decks written before it).

| Option | Values |
| - | - |
| `timing` | `on`, `off` |
| `auto-advance` | `on`, `off` |
| `colour` | `kinds`, `one` |
| `hide` | `position`, `bar`, `next`, `left`, `ends`, comma-separated |
| `record-on-start` | `on`, `off` |
<!-- end generated -->
