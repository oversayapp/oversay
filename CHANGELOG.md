# Changelog

Notable changes to Oversay, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

**0.4.0** is the first public release ([ADR 0044](.adr/0044-the-update-feed-is-a-redirect-to-the-public-repositorys-latest-release.md)); it holds everything built before it. Within a release, work is grouped by epic (linked to its issue), newest first, with the date it landed. Features that a later decision replaced are listed where they were added, and again where they went, so the story reads in order.

## [Unreleased]

## [0.6.0] · 2026-11-25

Reorder and take back changes in the deck editor, and a session page that puts the run beside your note and review. Everything below landed after 0.5.0.

### Session page: the run beside your note and review · 2026-11-25 ([epic 044 (#100)](https://github.com/oversayapp/oversay/issues/100))

#### Added
- With a transcript, each card shows how many lines were said on it and opens to show them; **Read it all** opens every card.
- A narrow window switches between **The run**, **Note** and **Review**, each showing where it stands.
- A session you have just finished says **Just finished**, **Open deck** sits beside its name, the page says when the recording's audio is in the Trash, and it warns you if you ask for a review before the transcript is ready.
- A **Copy** button beside the review request.

#### Changed
- The run is on the left, your note and the AI review on the right, and each side scrolls on its own. After a run, **‹ Sessions** opens the list of every run.

#### Fixed
- A replaced transcript or a rewritten review shows its new text without reopening the page.
- Running the same deck twice in a row could open the second session as missing.

### Deck editor: reorder, delete and undo · 2026-11-25 ([epic 041 (#94)](https://github.com/oversayapp/oversay/issues/94), [epic 042 (#96)](https://github.com/oversayapp/oversay/issues/96), [epic 043 (#98)](https://github.com/oversayapp/oversay/issues/98))

#### Added
- Drag a card by its grip to reorder it, or focus the grip and press Alt+↑ / Alt+↓ (⌥ on a Mac).
- Within a card, move a point by dragging it or with Alt+↑ / Alt+↓, and delete it with its button.
- **Undo and redo** for every change to a deck (⌘Z and ⇧⌘Z; Ctrl+Z and Ctrl+Shift+Z or Ctrl+Y on Windows). A run of typing is one step. On a Mac, Edit › Undo and Redo follow it too. Renaming a deck isn't undone.

### Fixes · 2026-11-23

#### Fixed
- The one-time move of a deck's resources into its workspace leaves an alias, or a folder that holds one, where it is instead of deleting it, and says how many items stayed ([#92](https://github.com/oversayapp/oversay/pull/92)). It doesn't bring back an alias 0.5.0 already removed.

#### Security
- Updated the `url` and `cookie` libraries for two published advisories (RUSTSEC-2026-0592, RUSTSEC-2026-0594).

## [0.5.0] · 2026-11-21

Cloud saving, a Library, a new deck editor and a simpler control panel. Everything below landed after 0.4.0.

### Account: optional cloud saving · 2026-11-19 ([epic 036](https://github.com/oversayapp/oversay/issues/54), [oversayapp/web-api#1](https://github.com/oversayapp/web-api/issues/1))

#### Added
- **Settings › Account**: create an account or sign in (Google, Apple, Microsoft or email) on a hosted page in your browser; Oversay never sees a password. Signed out, Oversay makes no request and works exactly as before. An account item sits on the rail above Settings.
- **Save decks to the cloud** (off until you turn it on): each deck's cards and sessions, and each workspace, are kept in step between computers. Edits upload within seconds, offline edits wait until you are back online, a deck edited on two computers keeps both versions (the second as "(conflict copy)"), and moving a deck to the Trash deletes it from the cloud and the other computer's Library. Audio, transcripts, reviews and resources stay on the computer.
- **Delete account** removes the account and its cloud copy; local decks stay.
- Signing in means agreeing to the Terms and the Privacy policy; `PRIVACY.md` summarises the policy.

### Library: decks and workspaces in one place · 2026-11-18 ([epic 036 (#54)](https://github.com/oversayapp/oversay/issues/54))

#### Added
- **Library** on the rail replaces Decks and Workspaces: Recent, Pinned and This week, Unsorted, each workspace, then All decks (workspaces A to Z). One **+ New** (⌘N) and a command bar (⌘K) that finds and acts.
- A calmer **Home**: welcome, four shortcuts, Pick up where you left off, Recent and Pinned.
- **Templates** start decks: their segments become cards with kinds and times.
- Four example decks and two example workspaces on the first run.

#### Changed
- A workspace's description is edited in place and searched. Deleting a template or deck says first whether it can be brought back.

#### Removed
- The Workspaces page's tag rename, merge, delete and colour screens, which have no place in the Library.

### Editors: resources in the workspace, a new deck editor · 2026-11-18 ([epic 037 (#59)](https://github.com/oversayapp/oversay/issues/59))

#### Added
- The **deck editor**: a plan bar across the middle over **Cards | Settings**, a slim left column with the preview and the deck's facts, and Settings in four groups.
- **Record on start**: a deck can switch recording on or off for itself, overriding **Auto record** (written to the deck's `deck.md`).
- Resources belong to the workspace, and **Add resource to workspace** is in the editor.

### Control panel: the Look card and a flat menu · 2026-11-20 ([epic 030 (#29)](https://github.com/oversayapp/oversay/issues/29))

#### Added
- The **Look card** at the right edge: opacity (See-through to Solid), dark or light panel, Card or Agenda view. The menu-bar and tray menu is one flat list: what is running, Start or Pause, Next, Previous, Stop, the look, Hide from screen sharing. The card's time shows beside the Mac menu-bar icon, and in the Windows tray tooltip.

#### Changed
- The 50% opacity floor is gone: opacity goes down to 40%. Quit asks first while a deck runs.

#### Removed
- The **Timeline** (Waveform, Edge strip and look-back), its shortcut ⌃⌥T and its settings. Saved values for the Timeline style, Buttons, Edge strip, text size and Shows are ignored and dropped the next time settings are saved, so going back to 0.4.0 forgets them.

### Sessions: one filtered list · 2026-11-18 ([epic 029 (#28)](https://github.com/oversayapp/oversay/issues/28))

#### Changed
- **Sessions** is one list, newest first, with tabs (All, This week, Needs a review) and saved views, chips for workspace, deck, status and date, and grouping by day or month. Rows show ran against planned as a bar. Choosing one deck shows its Record on start setting, run stats and a planned-versus-actual trend. Search also finds sessions by workspace and note.

### AI skill: installing and the Home banner · 2026-11-19 ([epic 038](https://github.com/oversayapp/design/issues/10))

#### Added
- The Oversay skill installs from a marketplace and a plugin that match the app's version, with copy buttons for the Claude app, Claude Code and Codex, and a zip to save. The Home banner offers it and, once installed, shows a Manage button and a prompt to copy.

### Install and update

#### Added
- `brew install oversayapp/tap/oversay` on a Mac; a release now updates the Homebrew cask.

#### Fixed
- The portable Windows build's **Open the release page** button now has a page to open when an update is found: the update feed names the release.

## [0.4.0] · 2026-11-17

The first public release. Installed builds before it (0.1.0 and the rolling builds of `main`) never learn of the update feed, so install 0.4.0 by hand once; later versions arrive through the app.

### Auto-update: Oversay keeps itself up to date · 2026-11-16 ([epic 015 (#16)](https://github.com/oversayapp/oversay/issues/16))

#### Added
- Oversay checks for a newer version each time it starts (**Settings › Updates**, on by default) and shows nothing when there is none or the check can't be made.
- When there is one, an **Update** item appears on the rail and a pill in the header; **Settings › Updates** shows the version and what changed, and **Update and restart** installs it (macOS, and both Windows installers). The portable Windows build links to the release page instead.
- **Check for updates** works with automatic checking off and says plainly when Oversay is up to date or the update server can't be reached.
- Updates are signed, and Oversay installs only a package signed with Oversay's own key. Nothing is checked or installed while a session is open.

### Fixed · 2026-11-17
- Saving no longer follows a link planted beside a deck or workspace file under the temporary file's name, which could have overwritten another file with the deck's text ([#42](https://github.com/oversayapp/oversay/pull/42); found by the security audit before this release, `docs/security/audit-2026-11-0.4.0.md`).

### Deck widget: one widget, a Card view and an Agenda view · 2026-11-07

#### Added
- One widget for a running deck with two views of the same run: the **Card view** (the current card, upper left) and the **Agenda view** (every card as a bar along the bottom, with its title and never its points). An icon beside ✕ switches between them, and **V** does too.
- Previous, Start or Pause, and Next in a tab that slides out from under the widget's edge, on both views, bigger for use during a meeting.
- A record button in the widget's corner on every running deck.
- Preview shows the view you last used.

#### Changed
- Recording is one setting for every deck: **Settings › Recordings** with **Auto record**, off by default.
- After a deck runs, Oversay opens that run's session page instead of the deck editor.
- The deck bar is always at the bottom.

#### Removed
- The separate flashcard and timeline widgets, and a deck's `timeline:`, `record:` and `deck-bar:` options. Older decks that have them still open; the options are kept as written and ignored.

### App icon · 2026-11-07

#### Added
- Oversay's own app icon, a card over the call on green, in place of the default, with a one-colour version for the macOS menu bar and the Windows tray.

### Sessions: look back on every run, note it, and have your AI review it · 2026-11-07

#### Added
- **Sessions** on the rail: every run of every deck, newest first, grouped by day, with filters by workspace, deck and dates, and search.
- A session's page: each card's planned and actual time, overruns and pauses, your notes on how it went, and a way to delete a test run. Sessions with a note are kept.
- Import a Zoom or Teams transcript into a session, split by card.
- Record your own voice while a deck runs, and have it transcribed on your computer (Whisper, downloaded only after you agree). Only your microphone is recorded, never the call.
- Your AI app reviews a session through the Oversay skill, and Oversay shows the review on the session's page.

### Workspaces: decks grouped the way you work · 2026-10-27

#### Added
- **Workspaces** on the rail: a workspace is a group of decks, named for what you use Oversay for (a project, a course, a set of meetings), with its own date, place, notes and files. Tags group workspaces.
- The Workspaces page has a sidebar of All, Pinned, Recent and each tag, and remembers your choice.
- Search and New deck know about workspaces. The Oversay skill can make a workspace and add decks to it.

#### Removed
- **Projects and talks**, their screens and the talk editor: decks in workspaces replace them.

### Decks as folders · 2026-10-25

#### Added
- A deck is a folder holding its cards, its sessions and its resources. It is known by an id inside it, so renaming or moving it, in Oversay, in Finder or Explorer, by an AI or a sync tool, loses nothing: sessions, pins, Recent and links all follow it.
- Two decks can share a title. Each day's "Daily team meeting" is its own dated folder.
- Drop files or links on a deck to keep them in its resources, and open them with a click.
- Example decks on first run.

### Decks and flashcards · 2026-10-24

#### Added
- A **deck** is a Markdown file of **flashcards**, each with points and an optional time like `[3m]`, written by hand or by your AI app.
- The **flashcard widget** shows one card at a time. Timed cards move on by themselves (**Auto-advance**), turn amber in their last 10 seconds, and the last card counts over in red. Previous, Pause and Next steer by hand.
- The deck editor, with times, kinds, each deck's options, and a live preview of the deck on screen.
- Every run of a deck is recorded, with an **After the deck** view.
- The Decks list, with Recent, pins and favourites, grouped by date and filtered by tag, audience and date.
- One search bar for the whole app.

#### Changed
- The Oversay skill writes every note as a deck.

#### Removed
- Quick notes and quick talks, which became decks, and the earlier Timeline styles and Talking Points options.

### The Oversay skill: notes from any AI chat · 2026-10-22

#### Added
- One Oversay skill for Claude Code, Codex, Gemini CLI, the Claude app (chat and Cowork), ChatGPT and the Gemini app, installed and updated from the new **AI** page in Oversay. Nothing is hosted.
- Ask your AI app to make a note or add to one, and it appears in Oversay, whether or not Oversay is open.
- `oversay://` links open a note or put it on screen.
- Drop a note file anywhere on the window, or paste Markdown as a note.
- Oversay notices notes added or changed outside it.
- Notes record which version of the skill made them, and are checked as they are written.

### Waveform · 2026-10-21

#### Added
- **Waveform**, a Timeline style and the new default: one colour on its opposite in a thick rounded frame, with a sine wave whose pattern differs by kind of segment, cancelled to a flat line as the talk goes. Hold the wave to look back at any point already passed.
- Waveform and Blocks come in a dark and a light look; Talking Points takes the same look.

### Control panel · 2026-10-20

#### Added
- A control panel docked to the right edge of the screen, never shown in a screen share, holding what is running, which overlays are up and how they look. It opens from the menu-bar icon, the Dock menu, the Windows tray and taskbar menus, or ⌃⌥P.

#### Changed
- Overlays lose their ⋯ menus; the look is set in the control panel and on Get ready.

### Quick talks · 2026-10-20

#### Added
- Quick talks: an agenda with points and times, outside any project, run through Get ready like any talk. A quick note can become a quick talk, and a quick talk can move into a project and back out.
- Recent and pins on the Talks and Projects pages.

### Quick notes · 2026-10-20

#### Added
- Quick notes: Markdown files for a meeting, edited as topics and points or as Markdown, and shown on screen during a call with Previous and Next topic and a clock. A note edited elsewhere and saved unchanged stays byte for byte the same.
- Recent, pins and Favourites for notes.

### Talking Points · 2026-10-15

#### Added
- The **Talking Points** overlay: the current segment's points and hints, in one minimalist style, opening with every session away from the Timeline.
- Choose whether talking points show as their own overlay, inside the Timeline, or not at all.
- A little Markdown in points and hints, shown formatted on the overlays and in the editor.
- An opacity setting for every overlay, and live opacity from the overlay itself.

### Settings sections and About · 2026-10-14

#### Added
- Settings is one page with its sections listed down the side; the list follows as you scroll, and becomes a menu on a narrow window.
- **About**: the version, build, platform, licence and third-party notices.

### Timeline · 2026-10-10 to 2026-10-24

#### Added
- The **Timeline** overlay: a glance shows where you are in the segment and the talk, and whether you are running early or late.
- Five Timeline styles, chosen in **Settings › Overlays**: the square wave (the default), an edge strip along the bottom of the screen, a clock card, a side rail, and one card with the talking points. The overlay window follows the chosen style.
- Previous, Pause or Resume, and Next on the overlay itself, shown always, on hover or never.
- The talk's plan as a bar in the talk editor.

### Project workflow: a sidebar, a way back, and a Get ready page · 2026-10-11

#### Added
- It is always clear which project is open. Its talks sit in a sidebar, each with ▶, and their segments can be copied into the talk being edited.
- Open another talk to copy from it, with a way back.
- **Get ready**: pressing ▶ opens a page to check the overlays before you start; **Ready to start** puts the manager away and the overlays up.

#### Removed
- The Control Panel window of epic 006; Start and End moved onto the Timeline.

### Quick start and a streamlined talk editor · 2026-10-10

#### Added
- Favourite talks in the rail, ready to start.
- Starting a session puts the manager out of the way.
- Drag a segment's length on the plan bar, in 30-second steps.

#### Changed
- The talk editor takes the clean plan-table look, with adding, deleting, reordering, points and hints in place.

### Session control · 2026-10-09

#### Added
- Run a talk live: Start, Next, Previous, Pause and Resume, and End, from global hotkeys while your slides have focus.
- Open-ended segments (a demo) pause the plan and count up until Next.
- The session is recorded in the project file: planned against actual.
- **Settings › Shortcuts**, with clashes shown.

### Create project · 2026-10-08

#### Added
- A project has a description.
- New project gives a project its own folder in `Documents/Oversay`.
- Every save keeps earlier versions beside the file, so a project can be restored. Deleting a project moves it to the Trash.
- A demo project.

### Templates · 2026-10-08

#### Added
- 24 starter templates in seven categories, with search and a preview.
- Start a talk from a template, save your own talks as templates, and organise them in your own categories.
- Delete starter templates and restore them.

### Appearance · 2026-10-07

#### Added
- Light, Dark or System appearance inside Oversay, remembered across restarts.

### Manager · 2026-10-07

#### Added
- The main window for planning: an icon rail, Home, projects and the talk editor.
- Talks made of segments with durations, talking points and hints; drag to reorder; copy a segment to another talk.
- Unsaved changes are never lost without a warning.

### Projects and the file format · 2026-10-07

#### Added
- Projects saved as readable `*.oversay.json` files that diff cleanly and keep fields the app doesn't know.
- A clear message for a broken, invalid or too-new file, never a blank window.
- Recent projects.

### App foundation · 2026-10-06

#### Added
- Oversay for macOS (universal) and Windows, as a manager window and overlay windows.
- Overlays are translucent, frameless and always on top, stay above full-screen slideshows, reopen where you left them, and are hidden from screen capture by default.

### Overlay proof of concept · 2026-10-06

#### Added
- A first floating overlay showing a list of topics, on macOS and Windows from one codebase.

### Development

Work on how Oversay is built, checked and tracked, newest first.

- 2026-11-17: The first release, 0.4.0, is tagged. The repository is public and its releases are the update feed, at `https://updates.oversay.app/latest.json` (ADR 0044). The macOS build is signed and notarized.
- 2026-11-17: A security audit before the release; its summary is in `docs/security/`.
- 2026-11-09: The repository moved to the `oversayapp` organisation, with its issues and their numbers kept. Designs moved to their own repository.
- 2026-11-08: Dependency audit passes again.
- 2026-10-24: Security checks: every commit is checked for secrets and linted; dependencies are audited; one command runs the heavier checks before a pull request; every branch gets a security review.
- 2026-10-24: Hardening from a security review: a Content Security Policy in every window, and note names handled safely by the skill. The rest of that review is being worked through.
- 2026-10-22: Installers are built for a version tag or by hand.
- 2026-10-21: Versions are set in one place; a release is built for each version tag, with signed update packages. The in-app updater is built and waits for a public update feed.
- 2026-10-21: Each decision record states the current decision.
- 2026-10-16: Text files check out with LF line endings on every platform.
- 2026-10-13: Links open only through an allowlist; third-party notices are generated.
- 2026-10-12: Work is tracked in GitHub Issues, with the history of the earlier tickets kept.
- 2026-10-06: Builds for macOS and Windows in CI; checks on every pull request; actions logged without their content in development builds.

[Unreleased]: https://github.com/oversayapp/oversay/compare/v0.6.0...main
[0.6.0]: https://github.com/oversayapp/oversay/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/oversayapp/oversay/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/oversayapp/oversay/releases/tag/v0.4.0
