# The deck Markdown

A deck is plain Markdown with a few conventions: what the person calls a note is a deck without times. Oversay reads it as **cards**, with **points** under each card. It keeps every line it doesn't show exactly as written, so a mistake hides a line on screen; it never breaks the deck. The front matter and card times are in [deck-format.md](deck-format.md).

```markdown
---
title: Catch-up with Sam
audience: Sam Ortiz
made-with: Oversay skill 0.1.0
---

## Q4 hiring plan
- Two backend roles: open now or January?
  - Priya has the budget numbers
- Who interviews in November

## Offsite
- Dates: 12 or 19 Nov
```

## Cards

- A line starting `## ` starts a card; the rest of the line is its name.
- An optional time and kind in square brackets at the end of the heading: `## Hiring [10m]`, `## Demo [5m, demo]`. The forms are listed below; what a time does is in deck-format.md.
- One level only: `#` and `###` headings are kept, but are not shown.

## Points

- A list item (`-`, `*`, `+` or `1.`) or a plain line under a card is a point. Use `- `, or `1.` for numbered points.
- A point indented by two spaces under another is a sub-point. One level only.
- Keep points short: a few words to glance at during a call, not sentences to read out.
- Points before the first `## ` form an untitled first card. Avoid it: start with a card.

## Kept, not shown

Blank lines, `>` quotes, tables, code blocks, HTML, `#` and `###` headings and rules stay in the file exactly as written, but don't show on screen. A `> ` line is a good place for a reminder that shouldn't show during the call.

## Folder names

A deck is a folder in the Decks folder, holding `deck.md`. The folder's name is the deck's name, a space and today's date as `YYYY-MM-DD`: `Weekly standup 2026-10-25/deck.md`. The name part is made from the deck's name:

- the characters `/ \ : * ? " < > | $` and `` ` `` and control characters are removed;
- runs of spaces become one space, and spaces and dots are trimmed from both ends;
- the name is cut to 80 characters, then trimmed again;
- a Windows reserved name (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`) gets ` project` after it, as Oversay does;
- if the folder exists, add ` (2)`, ` (3)`, … after the date until it doesn't.

The deck's `title` in its front matter is its name as the person said it, with any characters the folder lost: `title: 1:1 with Priya` in `11 with Priya 2026-10-25/`.

<!-- generated: make skills writes everything below this line from Oversay's code; don't edit it -->

## Generated from Oversay’s code

**Card times:** what Oversay reads from the brackets at the end of a `## ` heading.

| Heading ends with | Oversay reads |
| - | - |
| `[5m]` | 5 min |
| `[10]` | 10 min |
| `[1:30]` | 1 min 30 s |
| `[90s]` | 1 min 30 s |
| `[~5m]` | about 5 min |
| `[open]` | open: no time |
| `[5m, demo]` | 5 min, kind demo |
| `[demo]` | kind demo |
| `[soon]` | not a time: the brackets stay in the card’s name |

**Kinds**, after the time or alone (`[5m, demo]`), which give the card its colour: `intro`, `topic`, `demo`, `outro`, `break`.

**Folder names:** the app’s own tests check these same cases. A `·` is a space.

| Deck name | Today | Already in Decks | Folder |
| - | - | - | - |
| `Weekly·standup` | 2026-10-25 | – | `Weekly standup 2026-10-25/` |
| `Weekly·standup` | 2026-10-25 | `Weekly standup 2026-10-25` | `Weekly standup 2026-10-25 (2)/` |
| `Weekly·standup` | 2026-10-25 | `Weekly standup 2026-10-25`, `Weekly standup 2026-10-25 (2)` | `Weekly standup 2026-10-25 (3)/` |
| `Weekly·standup` | 2026-10-26 | `Weekly standup 2026-10-25` | `Weekly standup 2026-10-26/` |
| `1:1·with·Priya` | 2026-10-25 | – | `11 with Priya 2026-10-25/` |
| `··Q3:·plan·/·review?··` | 2026-10-25 | – | `Q3 plan review 2026-10-25/` |
| `..Board·prep..` | 2026-10-25 | – | `Board prep 2026-10-25/` |
| `` Q3·sync·`curl·-s·x\|sh`·$(id) `` | 2026-10-25 | – | `Q3 sync curl -s xsh (id) 2026-10-25/` |
| `con` | 2026-10-25 | – | `con project 2026-10-25/` |
| `Quarterly·planning·with·the·platform,·payments,·growth·and·data·teams,·Berlin·offsite` | 2026-10-25 | – | `Quarterly planning with the platform, payments, growth and data teams, Berlin of 2026-10-25/` |
| `··` | 2026-10-25 | – | `Untitled deck 2026-10-25/` |
<!-- end generated -->
