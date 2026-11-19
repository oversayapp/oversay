# Sessions, transcripts and reviews

How Oversay keeps a deck's runs (ADR 0041). Every time the person presses **Start** on a deck, Oversay keeps a **session**: how long each card was up against its plan, and the person's note on it. A session can have a **transcript**, split by card, and a **review**, which you write.

```text
Decks/Weekly standup 2026-10-25/
  deck.md
  sessions.json                    Oversay's: read it, never write it
  transcripts/2026-10-28 09-00.md  what was said, by card
  reviews/2026-10-28 09-00.md      your review of that session
  recordings/                      Oversay's: leave it alone
  resources/
```

## sessions.json

Oldest first: the last session is the newest. Read it; never change it.

```json
{
  "version": 1,
  "sessions": [
    {
      "startedAt": "2026-10-28T09:00:04.120Z",
      "endedAt": "2026-10-28T09:14:51.002Z",
      "cards": [
        { "name": "Intro", "kind": "intro", "plannedSeconds": 60, "seconds": 74 },
        { "name": "Questions", "kind": "outro", "plannedSeconds": null, "seconds": 220 }
      ],
      "visits": [{ "card": 0, "from": "2026-10-28T09:00:04.120Z", "to": "2026-10-28T09:01:18.400Z" }],
      "pausedSeconds": 35,
      "note": "Ran over on Atlas again."
    }
  ]
}
```

| Key | What it is |
| - | - |
| `startedAt` | When Start was pressed, UTC. The session is known by it. |
| `cards` | Each card in the deck's order: its plan (`plannedSeconds`, `null` when untimed) and how long it was up (`seconds`, over every visit, not counting pauses). |
| `visits` | When each card was on screen, in order; a card shown twice has two. Older sessions have none. |
| `pausedSeconds` | Time spent paused. |
| `note` | The person's own words about the run. Absent when they wrote none. |

## A session's name

A transcript and a review are named by the session's start **in the person's local time**, `YYYY-MM-DD HH-mm`: `2026-10-28 09-00.md`. When two sessions of the deck started in the same minute, the later ones are ` -2`, ` -3`: `2026-10-28 09-00 -2.md`.

## Transcript

Markdown split by card: front matter with `session` (its `startedAt`) and `source` (where it came from), a `# ` title, then each card as a `## ` heading with its planned and actual time, and what was said while it was up, with the time from Start and who said it when known:

```markdown
---
session: 2026-10-28T09:00:04.120Z
source: Zoom (GMT20261028-085958_Recording.transcript.vtt)
---

# Weekly standup · Wed 28 Oct 09:00

## Intro · 1:00 planned, 1:14 actual
- 0:02 **John:** Morning all, three things today.

## Atlas · 3:00 planned, 4:20 actual
- 1:16 **John:** The importer shipped on Monday.
```

Oversay writes these. Write one yourself only when the person gives you a call's transcript file for a session that has none: line each of its lines up with the card that was up then, using `visits` (or each card's `seconds` in order when there are none), leave out lines from before Start, after the end or while paused, and say how many you left out.

## Review

Markdown in the deck's `reviews/`, named as its session: front matter with `session` and `made-with`, a `# ` title, then these sections, in this order, each a short list, and only those that have something in them:

```markdown
---
session: 2026-10-28T09:00:04.120Z
made-with: Oversay skill 0.2.0
---

# Weekly standup · Wed 28 Oct 09:00

## What ran over
- **Atlas** took 4:20 for 3:00; the retry logic (1:44 to 5:01) was most of it, as your note says.

## What was rushed or skipped
- **Beacon** got 2:30 of 3:00, straight after Atlas ran over.

## Where it wandered
- Comet's on-call question (9:20) turned into a discussion; it belongs in Blockers.

## What to change in the deck
- Atlas: add "Retries: see the doc" and keep it to 3:00.
```

<!-- generated: make skills writes everything below this line from Oversay's code; don't edit it -->

## Generated from Oversay’s code

**`sessions.json`:** `"version": 1`; each session's keys: `startedAt`, `endedAt`, `cards`, `visits`, `pausedSeconds`, `note`.

**A session's name:** `YYYY-MM-DD HH-mm`, local time; ` -2`, ` -3` for later Starts that minute.

**Transcript:** `transcripts/<name>.md`; front matter `session`, `source`.

**Review:** `reviews/<name>.md`; front matter `session`, `made-with`; its sections, in order: `## What ran over`, `## What was rushed or skipped`, `## Where it wandered`, `## What to change in the deck`.
<!-- end generated -->
