---
status: accepted
date: 2026-10-28
---

# Sessions are reviewed from notes, a transcript and the AI skill

Every Start of a deck is kept as a session in the deck's `sessions.json` (ADR 0036, 0037), but there is nowhere to see them together, say what went wrong, or learn from them: the rail has shown "Sessions · Soon" since epic 012. John wants a Sessions screen, notes on a session, and an AI review after it, run by the Oversay skill in the person's own agent, since the analysis needs a model (John, 28 Oct). Projects and talks are gone (ADR 0039), so a session is always a deck's.

## Decision

- **A Sessions screen** on the rail lists every session of every deck, newest first, grouped by day, filtered by workspace (ADR 0040), deck and date, and found by search. A session's page shows each card's planned and actual time, overruns and pauses, the person's note, the transcript and the review, and goes to the deck.
- **A note on a session** is the person's own text (what went wrong, what to improve), written on the session's page and kept as `note` on that session in `sessions.json`, which Oversay owns. A session can be deleted.
- **A deck keeps its newest 20 sessions, plus any with a note, a transcript or a review**: the limit only drops sessions nobody wrote about.
- **A transcript** is kept beside the session, in the deck's folder, as Markdown split by card: `transcripts/<YYYY-MM-DD HH-mm>.md`, named by the session's start in local time (a second Start of the deck in the same minute gets ` -2`, then ` -3`, John, 28 Oct; its review takes the same name), each card a heading with its planned and actual time. It comes from either:
  - **a transcript file from the call app** (Zoom, Teams, Meet), dropped on the session's page or given to the skill, lined up with the cards by time; or
  - **the person's own voice, recorded by Oversay** during the run: only the default microphone, never the call's audio. Recording is off by default; a deck turns it on with `record: on` in its front matter (or the editor's switch), and the flashcard widget shows a red dot while it records and can stop it for that run. The first recording asks for microphone permission. *(Changed by ADR 0042, 7 Nov: every deck can record, with Auto record in Settings › Recordings in place of `record: on`.)*
- **Speech becomes text on the device** with Whisper (`whisper.cpp`), the same on a Mac and Windows; its model is downloaded once, with the person's go-ahead, the first time a recording is transcribed. Audio never leaves the computer, and it is deleted once transcribed unless Settings says to keep it.
- **The AI review is written by the Oversay skill**, in the person's agent (Claude Code, Codex, Cowork…): asked to "review my last stand-up", it reads the deck, the session, its note and its transcript, and writes `reviews/<YYYY-MM-DD HH-mm>.md` in the deck's folder: what ran over, what was rushed, skipped or wandered from, and what to change in the deck. It never changes the deck itself unless asked. A session's page shows the review, and, until there is one, a Review with your AI button that copies the request.

  ```text
  Decks/Weekly standup 2026-10-25/
    deck.md
    sessions.json                    each session may have "note"
    transcripts/2026-10-28 09-00.md  split by card
    reviews/2026-10-28 09-00.md      written by the skill
    resources/
  ```

## Considered options

- **Recording the call's audio as well** (ScreenCaptureKit on a Mac, WASAPI loopback on Windows). It hears the questions too, but needs the Screen Recording permission and records other people, who in many places must all consent. The call app's own transcript gives the same with its consent already handled.
- **Apple's speech recognition on a Mac.** Free and with no download, but Windows would still need Whisper, and two engines give two kinds of transcript.
- **The review in `sessions.json`.** One file, but an agent writing a review while Oversay saves a note could lose one of them; a file of its own can't clash, and reads well in Finder.
- **A review run by Oversay itself.** It would need a model and an account of its own; the person's agent already has both (ADR 0033).

## Consequences

- The skill gains a review, reads transcripts, and can take a transcript file it is given; the session format (`note`) and the transcript and review files are checked like a deck's front matter (ADR 0035) and kept in step by `make skills`.
- Microphone permission and its reason are added to the app; Whisper's model and `whisper.cpp` add to the download and the third-party notices (ADR 0023).
- The idea of an AI review from a recording or transcript is taken up by this.

*Changed by ADR 0042: stopping a recording is no longer final for the run; recording again adds a second recording to the same run.*
