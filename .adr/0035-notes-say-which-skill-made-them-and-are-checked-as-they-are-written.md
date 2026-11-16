---
status: accepted
date: 2026-10-22
---

# Notes say which skill made them, and are checked as they are written

The skill's version is the app's, and the app updates the copies it installs. But a skill uploaded to a Claude, Gemini or ChatGPT account is out of Oversay's reach: it can't see it or replace it. People keep using an old one, and miss what a newer Oversay can do. John also wants every note the skill writes checked against the format as it is written, so nothing made up gets through.

## Decision

- **A version line on every note the skill makes.** Its front matter carries `made-with: Oversay skill <version>`. Oversay keeps the line like any other and doesn't show it. Adding to a note leaves the line as it was. The ChatGPT instructions ask for the line too, with the version of the Oversay that copied them.
- **The note is how Oversay finds an old skill.** A note from a chat app reaches Oversay anyway, by drop, paste or Cowork. When one says an older version than this Oversay carries, the arrival line and the note editor offer **Update the skill**, which opens the AI page. A chat app marked added also remembers the version it was given, and its row then shows Update available.
- **A note checker, run by the skill.** `Oversay --check <note>.md` lists where Oversay would show the note differently from how it reads, each with its line:
  - front matter keys or values it doesn't read;
  - topic times and kinds it doesn't read;
  - headings that aren't shown;
  - points before the first topic;
  - sub-points nested too deep.
  It exits 1 when it lists anything. The skill runs it after every note it makes or changes, wherever it can run commands, and fixes what it lists. This changes ADR 0031's "no script for notes": the reader still never fails, but a note the reader shows badly is now caught before the person sees it.
- **One definition.** The rules and their messages are `lint.ts` in the app (ADR 0007). `make skills` writes the keys, kinds and messages into the skill (`references/note-rules.json`), and the Rust checker reads them from there. One set of cases (`skills/fixtures/note-lint.json`) runs in both test suites. The prompt fixtures' notes must pass the check too.
- **The app checks what arrives.** A note with a `made-with` line shows the same problems in the note editor. A note written by hand isn't checked: its headings and quotes are the person's choice.
- **Copies on this computer update themselves.** When Oversay starts on a newer version than a copy it installed (one with `oversay-local.json`), it replaces that copy, putting the old one in the Trash, and the AI page says so. A copy put there by hand still waits for Update.

## Considered options

- **A hosted plugin marketplace that updates itself.** It would need a public URL, which is ruled out (ADR 0030, 0033).
- **A checker written only in Rust, or only in the skill's instructions.** Rust alone would be a second definition of the format. Instructions alone can't check anything. A shared rules file plus shared cases keeps one definition, which both sides test.
- **Checking every note, including hand-written ones.** Too noisy: `###` headings and quotes are a person's choice, and they are kept.

## Consequences

- A note now has a front matter key that isn't edited in the app (`made-with`), next to with, when and length.
- The parsing the checker needs exists twice, in TypeScript and in Rust. The shared cases keep the two in step. A new rule needs a case in `note-lint.json`, or one side can drift.
- The prompt fixtures' goldens predate `made-with`. The next `make skill-try` run, which costs money, refreshes them.
