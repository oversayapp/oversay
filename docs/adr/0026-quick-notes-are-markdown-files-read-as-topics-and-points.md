---
status: accepted
date: 2026-10-19
---

# Quick notes are Markdown files read as topics and points

A quick note is what someone keeps for a person or a recurring meeting: a few topics with points under each, shown on screen during a call. People already keep such notes in Markdown, edit them in other editors and sync them. A talk is a planned, timed thing with sessions inside a project file; a note is not.

## Decision

- **One Markdown file per note**, in `Documents/Oversay/Quick notes/`, named after the note. Not a project file, not JSON: the file reads well in any editor, and Oversay is one of the things that edit it.
- **The format is plain Markdown with a few conventions:** optional front matter with `with`, `when` and `length`; `## Topic` starts a topic, with an optional time in brackets (`[5m]`, `[~5m]` about five minutes, `[open]`, and a segment kind such as `[5m, demo]`); list items (`-`, `*`, `+`, `1.`) and plain lines are points; an indented item is a sub-point, one level deep. Lines before the first `##` that are points form an untitled first topic.
- **Lines the editor doesn't show are kept as written:** blank lines, `>` quotes, tables, HTML, code blocks, `#` and `###` headings, rules. A note has no hints; a `>` line is just kept.
- **The note is kept as its lines.** An edit rewrites only the lines it touches (a point's line keeps its marker and indent; a new point copies its neighbour's marker), and everything else, line endings included, stays byte for byte. An unchanged file is written back exactly as it was read; kept lines stay where they were.
- **Our own reader, no Markdown library** (`lib/notes/format.ts`), as ADR 0025 chose for talking points. Point text is shown through that same small inline parser, so a note can never run HTML.
- **Shown through the Talk model.** Showing a note builds topics as segments and points as talking points (sub-points as the point's sub-list) for the Talking Points overlay; nothing about a showing is written to the note.
- **Notes save as you type** (shortly after typing stops and on leaving the note), unlike projects' explicit Save (ADR 0008): a note is a small text file with no Versions and no session data to lose.

## Consequences

- Topic times are kept and shown in the editor, but showing a note counts up and has no Timeline; they matter when a note becomes a quick talk.
- A note edited in another app while open in Oversay is read again when Oversay next opens it; the last write wins, as for any text file. *Changed by ADR 0034: Oversay now watches the folder and reloads an open note.*
- Markdown the reader doesn't understand is never lost, but it is not shown on screen either. Supporting more (a link that opens) means changing the reader and its tests.

*Changed by ADR 0036: decks of flashcards replace quick notes; a deck is a quick note with times, in Decks/.*
