---
status: accepted
date: 2026-10-14
---

# Talking points' Markdown is parsed to text spans by our own small parser

Talking points and hints may use a little Markdown: a presenter wants to stress a word ("**never** read the slide") or break a point into steps. They come from talk files, which can be shared, so whatever they hold must never run as code on an overlay.

## Decision

- **The supported set is small:** bold (`**` or `__`), italic (`*` or `_`, `_` only at the start of a word, so snake_case stays as typed), inline code, and a bulleted (`-`, `*`, `+`) or numbered (`1.` or `1)`) sub-list one level deep, after the point's first line (a point that itself starts with `-` or `1)` reads as typed); deeper items join that level. A link shows its text alone: an overlay cannot be clicked into a browser mid-talk. A backslash keeps a mark literal. Everything else, headings and raw HTML included, is shown as typed.
- **Our own parser, no library** (`lib/markdown.ts`). The set is a few rules; a full CommonMark library brings a large surface, HTML output and a sanitiser to keep in step with it.
- **No HTML, so nothing to sanitise.** The parser returns styled text spans and blocks; Svelte components (`lib/markdown-ui/`) render each span as a text node inside `strong`, `em` or `code`. There is no `{@html}`: a `<script>` in a talk file is shown as the characters `<script>`.
- **One renderer for every place notes show:** the Talking Points overlay, E's card and the editor's side panel use `Note`; the short notes inside the Timeline use the point's first line (`firstLine`), never its sub-list.

## Consequences

- Text without Markdown looks exactly as before. Text that happens to contain `*word*` or `` `x` `` now shows styled; a backslash keeps it literal.
- Adding a rule (a link that opens, a heading) means changing the parser and its tests, not configuring a library; anything that would need HTML output needs a new ADR.
- Unclosed or mismatched marks are shown as typed rather than guessed at.
