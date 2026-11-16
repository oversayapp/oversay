---
status: accepted
date: 2026-10-21
---

# The Oversay skill writes quick notes into the Oversay folder, and the app need not be running

The skill epic planned a skill that makes and edits **projects** (`.oversay.json`). It was written before quick notes (ADR 0026) and quick talks (ADR 0027). John now wants the epic to cover the everyday ask, "create me a note for my meeting with X" or "add this Markdown to a note", in Claude Code, Claude desktop and Cowork, ChatGPT and Codex. Design: the AI skill concepts mockup; plan: `docs/proposals/ai-skill-epic.md`.

## Decision

- **Notes first.** The skill's first job is quick notes: make one, add topics and points to one, find one by name, open it or show it (ADR 0032). Quick talks follow in the same epic. Projects (adding a talk, fitting a talk to its time) are a later epic: they hold recorded sessions and have the most to lose.
- **The file is the hand-off.** The skill writes `Documents/Oversay/Quick notes/<name>.md` directly. Oversay doesn't have to be running, and nothing talks to the app to save a note. The app notices the file (ADR 0034).
- **The skill follows the app's rules for a note's file:**
  - its name is the note's name with the characters a file can't hold removed, as `folder_name` in `project_file.rs` does, with " 2", " 3" on a clash;
  - a new note never overwrites a file;
  - adding to a note appends topics or points and leaves every other line byte for byte (ADR 0026);
  - the skill never deletes, renames or moves a file.
- **No script for notes.** The format is plain Markdown and the reader keeps whatever it doesn't understand (ADR 0026), so a mistake costs a line that isn't shown, not a file Oversay refuses. The skill is instructions and examples only, so it runs in every harness, including those without a shell. Quick talks are JSON, so they get a schema generated from the app's code, and a check run by the app's own binary (`Oversay --check <file>`, which exits before any window opens). The binary needs no runtime of its own, where a bundled script would need Node.
- **The skill can't drift from the app:**
  - the format reference (`references/note-format.md`) takes its lists (time forms, segment kinds) from the app's code through `make skills`, and `make check` fails when it is stale;
  - every example note in the skill is parsed by `lib/notes/format.ts` in a test that checks its topics and points;
  - the skill carries the app's version, from `app/package.json`.
- **Where the folder is.** The installer writes the folders it found on this computer into the installed skill (`oversay-local.json`; ADR 0033), since Windows can redirect Documents (ADR 0013). Without that file, the skill uses `~/Documents/Oversay` on a Mac, or asks Windows for the Documents folder.

## Considered options

- **The skill talks to the running app** (a local server, or a command the app answers). This would need the app open, which John ruled out for writing. It also needs a server to secure, and gains nothing a file doesn't give.
- **Projects first,** as the epic planned. It is a bigger format, and it is easier to lose a person's sessions. It is not the ask John named.

## Consequences

- Where a harness can't write to this computer (Claude chat, ChatGPT Chat), the skill gives the person the note as Markdown. Oversay takes it in two ways (epic task 7):
  - **Paste as note**;
  - **dropping a `.md` file anywhere on the window**. The file is copied into Quick notes, never moved, so the original (often in Downloads) stays. A taken name gets " 2", as here.
- An AI can write a note Oversay shows badly: a topic without `##`, for example. The examples and the format reference are what prevent it; the reader never fails.
- The other planned tasks are reshaped or moved to a later epic (see the proposal); the old rule for projects still stands for that later epic.
