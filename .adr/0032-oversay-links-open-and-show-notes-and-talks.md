---
status: accepted
date: 2026-10-21
---

# oversay:// links open and show notes and talks

An AI that has written a note should be able to say "it's open in Oversay" or put it on screen for a call that is starting. The first plan left this out (decision D6 in the old research: print a path to open by hand). John now wants the skill to open Oversay, show the note, and start the overlays.

## Decision

- **Oversay registers the `oversay` URL scheme** (Tauri's deep-link plugin, set in the bundle: Info.plist on a Mac, the registry by the NSIS and `.msi` installers on Windows).
  - A link starts Oversay if it isn't running.
  - If Oversay is running, the link goes to that copy. On a Mac the system does this. On Windows, `tauri-plugin-single-instance` (already used for the jump list, ADR 0028) gets the deep-link feature.
- **The links** (names, never paths: a link can only reach files directly in Oversay's own folders):

  | Link | Does |
  | - | - |
  | `oversay://notes` | opens Notes |
  | `oversay://notes/<name>` | opens the note in the editor |
  | `oversay://notes/<name>/show` | shows it, as the Show button does |
  | `oversay://talks/<name>` | opens the quick talk |
  | `oversay://talks/<name>/ready` | opens its Get ready page (ADR 0019) |

- **A link never writes, renames or deletes, and never starts a talk's clock.** "Start the overlays" means: a note is shown, and a talk gets its Get ready page. A person still starts the talk from the overlays, as for every talk.
- **Showing asks once.** Any app or web page can open a link. So the first link that would change the screen (`show`, `ready`) asks "Show … on screen?", with "Don't ask again". The answer is a setting: Ask, Allow or Never, in Settings. Opening something in the manager never asks.
- **During a session**, a link that would show something else is refused, and the manager says why. A link that only opens something waits behind the leave guard (ADR 0008), as opening by hand does.
- **How an agent opens a link:** `open "oversay://…"` on a Mac, `start "" "oversay://…"` (or `Start-Process`) on Windows. The skill says so for each platform.
- Each link handled is logged without the note's name, like other actions (ADR 0011).

## Considered options

- **Command-line arguments** (`Oversay --show <path>`). The skill would need to know where the app is installed on each platform, and a path argument can name any file. The URL scheme is found by the system wherever the app is. Arguments stay what the jump list uses.
- **A file association for `.md`.** It would take Markdown away from the person's editor. Not done.
- **A link that starts the talk.** It would let a web page start a timed talk. Not done.

## Consequences

- A Mac registers the scheme only for a bundled app. `make dev` doesn't register it, so links are tested with a built app (a `make` target can register a debug bundle).
- On a Mac with several dev copies, the system picks one to receive links. That is accepted.
  - The copy `make dev` runs isn't a bundle, so a link may not reach it: the system can start a registered bundle as a second Oversay beside it (seen 2026-10-21). To test links by hand, quit other copies or run the built bundle.
- An AI in a sandbox (Claude chat, ChatGPT Chat, and possibly Cowork) can't run `open`. There the skill tells the person what to click instead. Whether those chats let a person click an `oversay://` link is unverified.

*Changed by ADR 0036: decks of flashcards replace the notes and talks links with oversay://decks/<name> and …/show.*

*Changed by ADR 0037: a deck link names the deck by its id (oversay://decks/d_k3x9a2bq/show) as well as by its name, so it outlives a rename.*

*Changed by ADR 0050: `oversay://auth` finishes a sign-in Oversay started, and so stores tokens: the one link that writes. It is refused unless its `state` matches the attempt in progress.*
