---
name: oversay
description: Make, add to and find Oversay decks, the Markdown cards Oversay shows on screen one at a time during a call or a talk, each with points and an optional time, and group them into Oversay's workspaces. Use when the person asks for a note, talking points (timed or not), cards or a deck in Oversay (for a meeting, a 1:1, a call, a stand-up, a demo, a short talk), asks to add points or pasted Markdown to an Oversay deck or note, asks which Oversay decks or notes they have, asks to make a workspace in Oversay, tag one, or add a deck to one or take it out, asks which workspaces a deck is in, asks to review a session or run of a deck ("review my last stand-up", "how did my talk go"), gives a call's transcript for an Oversay session, or asks what the Oversay skill or plugin can do.
metadata:
  version: 0.1.0
---

# Oversay decks

Oversay shows a **deck** beside a call or a talk: a few **cards**, each with points under it, one card at a time. A card can have a time: then Oversay counts it down and moves to the next card when it runs out; without one the card waits for the person to press Next. What the person calls a note is a deck without times. Each deck is a folder in Oversay's **Decks** folder, holding the deck's Markdown as `deck.md`. You write that file directly; Oversay doesn't need to be open, and lists the deck the next time it looks.

**Every time you write a deck:**
- a deck you make is a new folder, and its `deck.md` starts with front matter holding its `title` and `made-with: Oversay skill <version>` (the `version` at the top of this file);
- once it is written, made or changed, [check it](#check-it) and fix what the check lists, before you say it is done.

Read [references/deck-format.md](references/deck-format.md) and [references/note-format.md](references/note-format.md) before writing a deck. [examples/decks/](examples/decks/) has finished decks, and [examples/decks/adding/](examples/decks/adding/) shows a deck before and after an addition.

## What it can do

When the person asks what this skill or the Oversay plugin can do, or to be walked through it, give them [what-it-can-do.md](what-it-can-do.md) as it is written. Leave out a part only when it doesn't apply where you are, and don't add things it doesn't say.

## Where decks live

1. If `oversay-local.json` is next to this file, its `decks` value is the folder. Oversay writes it when it installs the skill.
2. Otherwise:
   - macOS: `~/Documents/Oversay/Decks`
   - Windows: `Oversay\Decks` inside the Documents folder. Documents can be moved, so ask Windows where it is: `powershell -NoProfile -Command "[Environment]::GetFolderPath('MyDocuments')"`.
3. In Cowork, use the Decks folder inside the folder the person let the task work in (`Oversay/Decks`, or `Decks` when that folder is `Oversay` itself).
4. Create the folder if it is missing. In it, only ever make a new deck's folder and write a deck's `deck.md`, or, when [reviewing a session](#review-a-session), a file in a deck's `reviews/` or `transcripts/`. Leave the rest alone: each deck's `sessions.json` (Oversay keeps its runs there; read it to review one), its `recordings/`, its `resources/` (read them only when asked, below) and any `.sessions` folder.

If you can't write files on this computer (a chat in a browser, for example), give the person the whole deck as one Markdown block named `<name>.md`. Tell them to drop the file on Oversay's window, or to copy it and use **Decks › Paste as deck**.

## Make a deck

1. Pick a short name for the meeting or talk, as the person would say it: "Catch-up with Sam", "Weekly standup". It is the deck's name in Oversay.
2. [Find the decks](#find-decks). If one already has this name (ignoring case), **ask the person** whether to add to that deck or make a new one, and do what they say: adding is [Add to a deck](#add-to-a-deck); a new one carries on here. Never decide for them, and make nothing until they answer.
3. Turn the name and today's date into a folder name exactly as the reference says (characters removed, ` (2)` when taken): `Weekly standup 2026-10-25`. Make that folder. **Never use a folder that is already there, and never overwrite a file.**
4. Write `deck.md` in it: front matter with
   - `title:` the name as the person said it, with characters the folder lost (`title: 1:1 with Priya`);
   - `made-with: Oversay skill <version>` (the `version` at the top of this file);
   - and, only when the person said who it is for, `audience` (never guess it from the name);

   Write no `id`: Oversay gives the deck one when it first sees it.

   then one `## ` card per subject, in the order asked; short points under each. Use only the keys and card times the references list. Use the person's words, and don't invent facts. A card the person gave nothing more on gets no points: never add placeholder points ("Next steps", "Discuss", "Confirm dates") they didn't ask for.
5. **Times only when asked.** Give a card a time only when the person gave one ("timed 3, 4 and 5 minutes", "a 1-minute intro"): a card with a time moves on by itself when it runs out. A meeting's length ("about 30 minutes") is not a time for each card. Every deck can show all its cards along the bottom (the deck widget's Agenda view), so a deck needs nothing for a timeline: write no `timeline` key.
6. [Check it](#check-it), and fix what the check lists.
7. Say where it is and what is in it: its cards (with their times, and the total when it is timed) and points. Oversay lists it under **Decks**; **Show** puts it on screen, waiting on the first card until Start.

## Add to a deck

1. Find the deck by name ([Find decks](#find-decks)). If two names are close, or two decks have the name, ask which one.
2. Read its file: `deck.md` in its folder. Add only what was asked:
   - a new card goes at the end of the deck;
   - new points go after the last point of their card, with the same marker and indent as the points around them.
3. **Every other line stays exactly as it was**: wording, blank lines, quotes, tables, line endings (keep `\r\n` if the file uses it). Make the change as an edit, not a rewrite of the file.
4. Pasted Markdown becomes cards and points: its headings become `## ` cards and its list items become points. Say how its shape changed.
5. Leave `made-with` as it is, or leave it out if the deck has none: it says which skill made the deck.
6. [Check it](#check-it).
7. If the deck may be open in Oversay, say that Oversay may save over the change. The person should close the deck in Oversay first, or add the lines again after.

## Use a deck's resources

A deck's folder can hold a `resources/` folder: documents, web links and other files the person keeps with the deck. When they ask you to use them ("use the files in this deck's resources", "from the docs in the deck"), read the files in that deck's `resources/` and use what they say. A web link file (`.webloc` on a Mac, `.url` on Windows) holds a URL: read it from the file, and open it only if you can browse and the person asked. Only read: never add, change, move or delete anything in `resources/`, and never read it unless asked.

## Review a session

Every time the person presses Start on a deck, Oversay keeps a **session**: each card's time against its plan, the pauses, and the person's own note on it. A session can also have a **transcript**, what was said, split by card. Asked to review one ("review my last stand-up", "how did Tuesday's talk go?"), you read all of it and write what to do better. Read [references/session-format.md](references/session-format.md) first.

1. [Find the deck](#find-decks). Read its `sessions.json`: the last session is the newest. Pick the one asked for: the latest, or the one on the day and time the person said. If none matches, or the deck has none, say so and stop.
2. Work out the session's name from its `startedAt`, in local time, as the reference says (`2026-10-28 09-00`, ` -2` when an earlier session of the deck started the same minute).
3. Read the deck (`deck.md`), the session (each card's planned and actual time, `pausedSeconds`, `visits`), its `note`, and its transcript, `transcripts/<name>.md`, when it has one.
4. Write `reviews/<name>.md` in the deck's folder (make `reviews/` if it is missing), as the reference shows: front matter with `session` (its `startedAt`) and `made-with: Oversay skill <version>`, a `# ` title, then only these sections, in this order:
   - **What ran over:** cards that took longer than planned, by how much, and why when the note or transcript says.
   - **What was rushed or skipped:** cards cut short, never reached, or with points not covered.
   - **Where it wandered:** time spent off the card's points. Only with a transcript: never guess what was said.
   - **What to change in the deck:** concrete edits: a card's time, a point to add, cut or move.

   Use the person's note: it says what they felt went wrong. Quote times as the session gives them (`4:20 for 3:00`). Keep each section to a few short points, and leave out a section with nothing in it. If a review is already there for this session, ask before replacing it.
5. [Check it](#check-it), and fix what the check lists.
6. Tell the person the main points, and that Oversay shows the review on the session's page (**Sessions** on the rail).
7. **Never change the deck** unless they then ask you to make the changes: that is [Add to a deck](#add-to-a-deck), or editing its cards' times as they say.

**A call's transcript file** (Zoom, Teams or Meet: `.vtt`, `.srt` or `.txt`) given for a session: if the session has no transcript, write `transcripts/<name>.md` as the reference says, lining each line up with the card that was up then. Never replace a transcript that is there. Oversay can also do this when the person drops the file on the session's page.

## Workspaces

Oversay groups decks into **workspaces**: one for a project, a day of a course, or a talk someone is preparing ("AppSec June 2026"). A workspace lists decks by their `id`; the decks themselves stay in Decks, so adding a deck to a workspace never moves or copies it, and a deck can be in several. **Tags** group workspaces (`research`, `tutorials`). Read [references/workspace-format.md](references/workspace-format.md) before writing a workspace.

**Where they live:** the `workspaces` value in `oversay-local.json` next to this file; otherwise `Workspaces` beside the Decks folder (`~/Documents/Oversay/Workspaces` on a Mac). Each folder in it holding `workspace.json` is a workspace. In Workspaces, only ever make a workspace's folder and write its `workspace.json`. Leave everything else alone, `resources/` and any folder without a `workspace.json` included.

**List them** when asked: each workspace's name, its tags, `when` and `where` when it has them, and how many decks it lists; grouped by tag when the person asks for a tag ("my research workspaces"). A deck is in a workspace when that deck's `id:` is in its `decks`.

**Make a workspace:**
1. If a workspace with that name (ignoring case) is already there, **ask** the person before making anything: add to that one, or make another. Do what they say.
2. Make its folder as the reference says (no date; ` (2)` when taken), and write `workspace.json` in it: `"version": 1`, `name`, `tags` (the words the person gave, or `[]`), `decks` (`[]`, or the ids asked for), and `when`, `where`, `notes` only when the person gave them. Write no `id`: Oversay gives the workspace one.
3. [Check it](#check-it).

**Tag a workspace:** edit only its `tags` list; keep every other key and line as it was.

**Add a deck to a workspace, or take it out:** [find the deck](#find-decks) and read the `id:` in its front matter. Edit only the `decks` list in `workspace.json`: add the id at the end (once: never twice), or remove it. Keep every other key and line as it was. A deck the person just asked you to make has no `id` until Oversay has seen it: make the deck, then tell the person to open Oversay (or wait a moment if it is running) and ask again, rather than writing anything else in its place. Taking a deck out of a workspace leaves the deck in Decks.

**Which workspaces is a deck in:** read its `id:`, then every `workspace.json`; name each workspace whose `decks` holds it.

## Check it

Check every deck you make or change, before saying it is done. Oversay checks it with the same rules it reads decks with, so whatever it lists is something Oversay would show differently from what you meant.

1. Find the app: `oversay` in `oversay-local.json` next to this file; otherwise, on a Mac, `/Applications/Oversay.app/Contents/MacOS/Oversay` if it is there.
2. Run it on the deck's `deck.md` (it checks a file in a deck's folder in `Decks` as a deck), on a workspace's `workspace.json`, or on a review or transcript you wrote in a deck's `reviews/` or `transcripts/`:
   - macOS: `'<oversay>' --check '<file>'`, in single quotes, never double: a name from a calendar or an email can hold `$( )` or backticks, which run inside double quotes. Write each `'` in a path as `'\''`.
   - Windows (PowerShell): `& '<oversay>' --check '<file>' | Out-Host`, in single quotes too, with each `'` in a path written as `''` *(unverified)*
3. It prints `OK` with the cards and points Oversay shows (for a workspace, its name and how many decks it lists; for a review, its sections) and exits 0, or lists each problem and exits 1. Fix what it lists and check again. When adding to a deck, fix only lines you added; tell the person about the others.

Where you can't run the app (a chat, or Oversay isn't installed), check the deck against the references yourself: only the front matter keys and values listed, card times in the forms listed, `## ` for every card, `- ` for points, one level of sub-points. Oversay checks the deck again when it arrives.

## Open it, show it

When the person asks to open a deck in Oversay, or to show it (put it on screen for a call), open an `oversay://` link. Oversay starts if it isn't running. Name the deck by the `id:` in its front matter when it has one (Oversay adds it soon after the deck is made): that link finds the deck even after a rename, and tells apart two decks with one name. Otherwise use its name, its `title:`, URL-encoded (a space is `%20`):

| Asked for | Link |
| - | - |
| Open the deck | `oversay://decks/Catch-up%20with%20Sam` |
| Show it on screen | `oversay://decks/Catch-up%20with%20Sam/show` |
| Show it, by its id | `oversay://decks/d_k3x9a2bq/show` |
| Open Decks | `oversay://decks` |

- macOS: `open "oversay://decks/Catch-up%20with%20Sam/show"`
- Windows (PowerShell): `Start-Process "oversay://decks/Catch-up%20with%20Sam/show"`

Showing asks the person in Oversay the first time unless they allowed it, and is refused during a session. Open a link only when asked; making a deck doesn't need one. If you can't run commands, tell the person to open the deck from Decks in Oversay, where **Show** puts it on screen.

## Find decks

List the folders in the Decks folder; leave out names that start with `.`. A folder's deck is its `deck.md`, or its only `.md` file when it has no `deck.md`; a folder with neither is not a deck. A `.md` file straight in Decks, from an older skill, is a deck too (Oversay moves it into a folder of its own). Each deck's name is the `title:` in its front matter, or else its folder's name without the date. Give the name, the `audience:` value from its front matter when there is one (or `with:` in an older deck), and when it was last changed. Two decks can have the same name: tell them apart by their dates.

## Never

- Delete, rename or move a deck or its folder, or touch any other file or folder.
- Write or change `sessions.json`, or anything in `recordings/`: they are Oversay's.
- Write a deck into a folder that is already there, or overwrite a file.
- Write, change or copy a deck's or a workspace's `id`: it is Oversay's.
- Put a deck's folder in a workspace, or a workspace in a workspace: a workspace lists decks by id.
- Write a `project:` line in a deck: workspaces took its place.
- Change lines you weren't asked to change.
