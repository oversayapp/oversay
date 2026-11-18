# Oversay — Product Spec

Status: draft v1 (2026-10-06). Builds on [`concept.md`](concept.md) and the overlay proof of concept (its `poc/overlay/` folder is in git history).

## 1. Overview

Oversay helps you deliver a talk or run a meeting on time. You plan a talk as a list of timed segments, then present with small always-on-top overlays: a **Timeline** showing where you are against the plan, and **Talking Points** showing what to say now. Each run is recorded so you can compare planned against actual timing and improve the plan.

### Goals

- Plan talks as timed segments, quickly, from templates.
- Keep different versions of the same material for different audiences (conference, stakeholders, board) in one place.
- While presenting, see at a glance how far through the current segment and the whole talk you are, with no more than a key press to move on.
- Record real timings so later versions of the plan (and later, AI suggestions) are grounded in what actually happened.
- Run on Mac and Windows from one codebase; easy to install on both.

### Non-goals (for now)

- Slide authoring or controlling slide software.
- Third-party plugins.
- Multi-user collaboration or a hosted service.
- Mobile.

## 2. Domain model

*Projects, talks and segments are gone from the app (ADR 0039): what follows about them is kept as a record. Decks (§9) and workspaces (§10) are what Oversay works with.*

| Term | Meaning |
| --- | --- |
| **Project** | The subject you present about, e.g. "Oversay launch". Holds one or more Talks and an optional description of what it's for. Saved as one file. |
| **Talk** | One version of the material for one audience or occasion, e.g. "DevConf 20 min", "Board update 10 min". An ordered list of Segments, with an optional description (who it's for, what it's about) and target length. |
| **Segment** | One block of a talk: name, kind, planned duration (or open-ended), talking points, hints. |
| **Segment kind** | `intro`, `topic`, `demo`, `outro`, `break`. Affects colour and default behaviour only; `demo` defaults to open-ended. |
| **Open-ended segment** | A segment with no fixed length (typically a demo or Q&A). The plan pauses while it runs and resumes when you press Next. It may carry an *estimate* used only for totals. |
| **Talking point** | A short line you intend to say within a segment. Ordered. |
| **Hint** | A short reminder shown less prominently (a stat, a name, "slow down"). |
| **Template** | A reusable Talk skeleton: segments with kinds, durations and placeholder names, no content. Built-in (24 starter templates) or user-saved. Each belongs to one **template category**. |
| **Template category** | A coloured grouping of templates. Seven starter categories (Conferences & talks, Product & demos, Meetings, Workshops & training, Pitches & proposals, Teaching & study, Speeches & occasions) with fixed names and colours; **My templates**, the default for templates you save; and any you create. Yours can be renamed and recoloured; any category except My templates can be deleted, with its templates. Deleted starter categories and templates can be restored from Settings. |
| **Session** | One live run of a Talk: when it started and ended, and the log of Next/Previous/Pause events, from which actual segment timings are derived. |
| **Deck**, **flashcard** | A deck is a folder holding a Markdown file of flashcards, each a title, points and an optional time, shown on the deck widget (§9). Decks replace quick notes and quick talks. A deck lives once, in `Decks/`, and can be in any number of workspaces or none. |
| **Workspace** | A group of decks for one project, course day or talk, e.g. "AppSec June 2026": a list of deck ids in order, with tags (research, tutorials) and its own when, where, notes and resources (§10). |
| **Plugin** | A built-in overlay module (Timeline, Talking Points) that shows session information in its own window. |

```
Project ─┬─ Talk "DevConf 20 min" ─┬─ Segment "Intro" (intro, 2:00)
         │                         ├─ Segment "Why timers fail" (topic, 4:00)
         │                         ├─ Segment "Live demo" (demo, open-ended, est. 5:00)
         │                         ├─ Segment "Wrap-up" (outro, 3:00)
         │                         └─ Sessions [ run 1, run 2, … ]
         └─ Talk "Board update 10 min" ─ …

Templates (app-wide, by category) ── Meetings: "Stand-up 15", "Board update 10", … · Product & demos: "Stakeholder demo 15", …
```

### Rules

- Segments belong to exactly one Talk. **Copying** a segment to another Talk creates an independent copy; editing one does not change the other.
- A Talk's planned length is the sum of fixed durations plus estimates of open-ended segments. If a target length is set, the editor shows the difference.
- Sessions are kept with their Talk. Editing the Talk after a session does not rewrite the session; each session stores a snapshot of the segment ids, names and planned durations it ran against.

## 3. File format

*Oversay no longer makes or opens project files (ADR 0039); the format is kept as a record, and quick talks in it still move into Decks once (§9).*

One file per Project: `<name>.oversay.json`. A new project gets its own folder, `Documents/Oversay/Projects/<name>/`, with the file inside; the folder can later hold the project's other documents (ADR 0013). Projects saved elsewhere (synced folder, git) still open with Open file…, and Save As… can put a copy anywhere. UTF-8 JSON, human-readable, stable key order. Durations are in whole seconds; timestamps are ISO 8601 UTC; ids are short random strings.

```json
{
  "schemaVersion": 1,
  "id": "p_7k2m",
  "name": "Oversay launch",
  "description": "Launch talks for Oversay, a presenter timer for Mac and Windows. Keep every version under time and leave room for questions.",
  "talks": [
    {
      "id": "t_a91c",
      "name": "DevConf 20 min",
      "audience": "Conference",
      "targetSeconds": 1200,
      "segments": [
        {
          "id": "s_01",
          "name": "Intro",
          "kind": "intro",
          "plannedSeconds": 120,
          "openEnded": false,
          "points": ["Who I am", "Why timing matters"],
          "hints": ["Smile, slow down"]
        },
        {
          "id": "s_02",
          "name": "Live demo",
          "kind": "demo",
          "plannedSeconds": 300,
          "openEnded": true,
          "points": ["Create a talk from a template", "Run it with the overlay"],
          "hints": []
        }
      ],
      "sessions": [
        {
          "id": "r_5d0e",
          "startedAt": "2026-10-20T14:00:03Z",
          "endedAt": "2026-10-20T14:21:40Z",
          "plan": [
            { "segmentId": "s_01", "name": "Intro", "plannedSeconds": 120, "openEnded": false }
          ],
          "events": [
            { "at": "2026-10-20T14:00:03Z", "type": "start" },
            { "at": "2026-10-20T14:02:31Z", "type": "next" },
            { "at": "2026-10-20T14:02:35Z", "type": "previous" },
            { "at": "2026-10-20T14:02:50Z", "type": "next" },
            { "at": "2026-10-20T14:21:40Z", "type": "end" }
          ]
        }
      ]
    }
  ]
}
```

- `description` is optional: what the project is for, in the person's own words (a few lines of plain text). It is meant to be read as context, by people and later by an AI agent the person connects; the app imposes no structure on it. Absent when blank.
- **Earlier versions:** each save first copies the file it replaces to `Versions/<name> <YYYY-MM-DD HH-MM-SS.mmm> UTC.oversay.json` beside it (when that version was saved; the name is the only record of it, and a kept version is never overwritten); the newest 10 are kept. "Earlier versions…" lists them and restores one as unsaved changes.
- `plannedSeconds` on an open-ended segment is its estimate.
- The **event log is the source of truth** for a session; per-segment actual durations are derived from it (a `previous` returns to the earlier segment, and time then continues to count against it; if the visit it leaves lasted 10 seconds or less, that Next was a mistake and its time goes back to the earlier segment, while a longer visit keeps its time).
- `schemaVersion` is bumped on breaking changes; the app migrates older files on open and never silently drops unknown fields.
- User templates are stored in the app's config folder (not in project files), in the same segment shape without points, hints or sessions.

## 4. Manager app

The main window. A normal (non-overlay) window used to write decks and sort them, and to start them. A rail on the left goes to Home, Library, Templates, Sessions, AI and Settings, with the one search bar (§9), now a command bar with a **+ New** button beside it, above every page. A page with a way back (a deck to the Library group or workspace it was opened from, Settings' licences to About) shows it at the left of the search bar's row, lined up with the page's text, never above the page's heading (John, 26 Oct). **Projects, talks and their screens are gone** (ADR 0039): workspaces replace them, and nothing was converted. Files already in `Documents/Oversay/Projects` are left where they are, and Oversay no longer reads them.

### Screens

1. **Home:** the welcome heading and line, round shortcuts (New deck, From a template, New workspace, Library) and the AI card; once there is something to pick up, **Pick up where you left off** (the deck last opened, with Edit and Show), **Recent** and **Pinned**, at most four tiles each, decks and workspaces together, however much the Library holds. On a first run Recent already holds the three example decks that are not pinned (Welcome to Oversay newest), put there once, never again. With one deck and no workspace a line suggests a first workspace. There is no calendar, so no What's next.
2. **Library:** decks and workspaces in one place (§9, §10; epic 036 (#54)). Its left pane lists the smart groups first: **Recent**, **Pinned** and **This week** (decks and workspaces together; This week is decks changed in the last seven days and workspaces opened in them) and **Unsorted** (the decks in no workspace, only while there are some and at least one workspace exists), then the workspaces (A–Z, case-insensitive, and in that order whatever is opened, so only Recent orders by use; six shown, the open one always among them, with All N workspaces for the rest), then **All decks**. The main pane lists the one picked, or is a workspace's page. When Recent, Pinned or This week holds both, it shows a quiet **Decks** heading and a **Workspaces** heading over their two parts, each newest first; Unsorted is only decks, so has none. A group with nothing in it is not listed.
3. **Sessions:** every run of every deck, and each session's page (§11).
4. **Templates:** laid out as the picker: the categories down the left (All, the seven starter categories and My templates, each with its colour and count; ⋯ renames, recolours and deletes your own, and deletes a starter category; My templates cannot be deleted), the templates of the one picked, and the chosen template's cards with their kinds and times, with **Start a deck**. The picker (+ New › Deck from a template…) is this page in a dialog, one component, with Use template and Cancel in place of the page's managing. Your own templates can be renamed and moved to another category. There are no category chips, no search box on the page (the command bar finds templates by name) and no mini plan bar. **Deleting a template or a category always asks first**, with a trash icon, and says whether it can be brought back: a starter template or category comes back from Settings › Templates, your own does not; decks already made from it do not change. **A template starts a deck**: its segments become the deck's cards with their kinds and times, an open segment an untimed card; the deck opens in the editor, in the workspace being looked at if there is one (ADR 0039's step for later).
5. **Settings:** one scrolling page with a list of its sections down the left (Appearance, Overlays, Screen sharing, Links from other apps, Sessions, Shortcuts, Templates, Example deck, Updates, Developer tools, About; Updates only in a build that has an update feed; Developer tools is a collapsed block that its entry opens, and stays only until the tools are removed). Clicking an entry scrolls the page to that section (instantly with reduced motion) and moves focus to its heading; as the page is scrolled by hand the entry for the section in view is highlighted, and the last entry is highlighted once the page is at its end. The list stays in place while the page scrolls, and each section is a card of its own with its heading, so where one ends and the next begins is clear. At 760 px of page width or less it becomes a menu across the top that shows the current section. Another screen can open Settings at a named section. The sections: Appearance (System, Light or Dark; System follows the operating system), **Overlays** (the Timeline style, the talk indicator, whether the overlay buttons are always shown, shown on hover or hidden, and which edge their tab sits on, where the talking points go, and the overlay opacity (40% to 100%, default 78% for see-through; with the waveform, the default style, the panels start solid and go no lower than 50%: only the panels' fill fades, the text stays solid; every overlay's ⋯ beside its × also offers See-through, Solid, and Darker and Lighter with their hotkeys, ⌃⌥↑ and ⌃⌥↓ by default, 5% a step, rebindable in Shortcuts); an open overlay follows a change straight away), screen-capture hiding, restoring deleted starter categories and templates (additive: your own are untouched), and restoring the demo project if it was deleted. **Updates** (ADR 0030, epic 015 (#16); only in a build given a feed) has Check for updates automatically (on by default; every time Oversay starts) and Check for updates by hand, and when a newer release is found its version and notes with Update and restart, which downloads, checks the signature, installs and restarts; a copy that can't update itself (the portable `.exe`) shows an Open the release page button instead. The same find puts an Update item in the rail and a pill in the header, both leading here; never a dialog. While a session is open nothing is checked and nothing restarts. **About** is the last section: the app's name and version (read from the app, so it matches the installer), the build (short commit and its date; `-dirty` marks a build with uncommitted changes), the operating system and architecture, the licence Oversay is released under (GPL-3.0, with the copyright line; the text is the `LICENSE` file, and `Cargo.toml`, `package.json` and About agree, which a test checks), and the third-party components it ships with: a count by licence and a page listing each component with its version, licence and a link to its crates.io or npm page, a component that declares no licence flagged and listed first. That list is generated from `Cargo.lock` and `package-lock.json` whenever the app is run, built, tested or type-checked (`scripts/third-party.mjs`), never written by hand. App settings are stored in `settings.json`, templates and categories in `templates.json`, both in the app config folder.

### Behaviour

- Decks save as they are typed, so closing or quitting never asks about unsaved changes (the project's explicit Save went with projects, ADR 0039).
- Invalid or unreadable files open with a clear error, never a blank screen.
- **Quick notes and quick talks** are replaced by decks (§9, ADR 0036).
- **Files written outside Oversay** (an AI, another editor) in Quick notes and Quick talks show up while it runs: New until opened, one banner on Home and Notes for the newest; an open note is read again, or, when typing was waiting, the other version is kept as "<name> (outside)" and you choose Keep both or Use theirs instead (ADR 0034).
- **The AI page** (rail: AI, New until first opened) lists one row per AI app, one app at a time: its name, a line on what it does (writes notes straight into Oversay, or gives you a file), one button, and its details (where, steps, limits) when the row is opened. It installs the Oversay skill that comes with the app into Claude Code (`~/.claude/skills/oversay`), and Codex and Gemini CLI (`~/.agents/skills/oversay`, one copy both read), with this computer's Oversay folders written beside it: Install, then Ready with Remove, or Update available when the app is newer. For the Claude app it saves the plugin, for the Gemini app the skill, and for ChatGPT it copies instructions; the row opens on the steps and the person says "I've added it", which marks it Ready (Undo takes it back). Apps on this computer come first, and the ones not found fold into one line; with no command-line app here the chat apps come first, and with no AI app at all a notice says to get Claude, ChatGPT or Gemini first (a chat in a browser works too). Once an app is Ready, Try it sits at the top with prompts to copy and watches for the first note; before then it is at the bottom. When Oversay starts on a newer version, it updates the copies it installed and says so. A chat app remembers which version of the skill it was given, and shows Update available when Oversay is newer. Home has a card with the three steps and Install until a skill is installed, then a prompt to try; × hides it for good. The empty Notes list links to the page (ADR 0033).
- **Notes from any chat:** a `.md` file dropped anywhere on the window is copied into Quick notes (the file stays where it was; a taken name gets " 2"; Undo moves the copy to the Trash; other files are named and left out; a project file dropped on its own opens as Open file… does; nothing is added during a session). **Paste as note** on Notes (⌘⇧V / Ctrl+Shift+V) makes a note from Markdown on the clipboard, named after its `# ` title or first topic. The AI page's ChatGPT card copies instructions that teach a chat the note format (ADR 0031).
- **Skill notes are checked** (ADR 0035): every note the skill makes says `made-with: Oversay skill <version>`. The skill checks each note it writes with `Oversay --check`, which lists, by line, what Oversay would show differently. The note editor shows the same list for a note with that line, and a note from an older skill offers **Update the skill**.
- **`oversay://` links** open Oversay on Notes, a note or a quick talk by name (`oversay://notes/<name>`, `oversay://talks/<name>`), show a note (`…/show`) or open a quick talk's Get ready page (`…/ready`). Showing and Get ready ask once unless Settings › Links from other apps says Allow or Never; during a session they are refused. A link never writes, deletes or starts a talk (ADR 0032).

## 5. Session control

### State machine

```
ready ──start──▶ running(i) ──next──▶ running(i+1) … ──next on last──▶ finished
                   ▲   │
              previous │ next   (any time)
                       ▼
          running(i) on an open-ended segment = "plan paused": the remaining plan
          does not move; the segment counts up until next.
end (any time) ──▶ finished
```

- **Next:** ends the current segment and starts the next. Early or late is fine; actual time is recorded.
- **Previous:** returns to the previous segment (for an accidental Next). Logged, not erased. If you spent 10 seconds or less in the segment you left, that time counts towards the segment you return to; a longer visit was really presented and keeps its time.
- **Pause / Resume:** stops the clock entirely (interruption, technical problem). Logged.
- **End:** finishes the session and writes it to the project file.
- **Overrun:** when a fixed segment passes its planned time it keeps running; it is shown as overrun and the projected end of the talk moves later. Nothing advances automatically. *A deck does advance by itself (§9, ADR 0036).*
- **Early finish:** pressing Next before the planned time pulls the rest of the plan earlier.

### Controls

- Global hotkeys, working while another app (slides, browser, Zoom) has focus. Defaults, all configurable:

  | Action | Mac | Windows |
  | --- | --- | --- |
  | Start / Next | `⌃⌥→` | `Ctrl+Alt+Shift+→` |
  | Previous | `⌃⌥←` | `Ctrl+Alt+Shift+←` |
  | Pause / Resume | `⌃⌥Space` | `Ctrl+Alt+Shift+Space` |
  | End | `⌃⌥E` | `Ctrl+Alt+Shift+E` |
  | Open Oversay window | `⌃⌥O` | `Ctrl+Alt+Shift+O` |
  | Next Timeline style | `⌃⌥T` | `Ctrl+Alt+Shift+T` |

  (Windows defaults avoid `Ctrl+Alt+arrow`, which some graphics drivers use to rotate the screen.)
- Overlay buttons for the same actions on the Timeline: Previous, Start (then Pause / Resume), Next, and End. End asks for a second click, since a talk may stop before its last segment and a stray click must not end it.
- The session opens in `ready` and the clock starts on the first Start or Next, so the overlays can be arranged ahead of time.
- Presentation clickers are not supported in phase 1.

### Menu-bar icon

The Timeline has the session's buttons (ADR 0020). The **Control Panel** (ADR 0028) is a window docked to the right edge of the display, never shown in a screen share, for how the overlays look and what is on screen; which overlays open and hiding from screen sharing are chosen on the **Get ready** page. For the whole session a menu-bar (Mac) / system-tray (Windows) icon shows the clock beside it, and its menu has Open Oversay window (also a hotkey; brings the main window back, maximised, from minimised or hidden, for changing Settings › Overlays in the middle of a run; Settings is on the left rail as ever, and an open overlay follows a change straight away), then Next Timeline style (also a hotkey; cycles through the Timeline styles and round, saved like a choice in Settings), then Start / Next, Previous, Pause / Resume and End session, each with its hotkey, so the session can be driven when every overlay is hidden.

### Screen sharing and displays

- Overlays are **hidden from screen capture by default** (Zoom, Teams, Meet, recordings), using `NSWindow.sharingType = .none` on Mac and `WDA_EXCLUDEFROMCAPTURE` on Windows. A per-session switch can make them visible, e.g. when demoing Oversay itself.
- Overlays remember the display and position you last put them on. The first time, they open on the built-in (laptop) display; where there is none, the primary display.
- **Known gaps** (as of 2026-10-07, see [`platform/fullscreen-results.md`](platform/fullscreen-results.md)): overlays are confirmed above a full-screen PowerPoint slideshow on Windows and full-screen Chrome on the Mac, and hidden from screenshots on both. Not yet verified: Keynote and PowerPoint slideshows on the Mac, a full-screen browser on Windows, and hiding from Zoom/Teams shares and screen recordings.

### Where state lives

The session engine runs in the Rust core of the app: it owns the clock, the event log and the global hotkeys, and broadcasts state to all windows. Windows are views; closing an overlay never stops a session.

## 6. Plugin interface

Plugins are built-in modules (no third-party loading). Each one declares:

```ts
interface OverlayPlugin {
  id: string;                      // "timeline", "talking-points"
  name: string;
  window: {                        // proven settings from the POC
    width: number; height: number;
    transparent: true; decorations: false; alwaysOnTop: true;
    resizable: boolean;
  };
  mount(target: HTMLElement, ctx: PluginContext): () => void;  // returns unmount
}

interface PluginContext {
  talk: Readable<Talk>;            // the Talk being presented
  session: Readable<SessionState>; // index, state, elapsed, projected end, …
  now: Readable<number>;           // ticking clock (~10 Hz, 60 fps when animating)
  commands: { next(): void; previous(): void; togglePause(): void; end(): void };
  settings: Readable<OverlaySettings>; // Settings › Overlays: Timeline style, buttons, panel, opacity
}
```

- Each plugin gets its own overlay window. Every plugin opens when a session starts (011/03: choosing them per talk was dropped), and each can be shown or hidden from the manager's live view during it; window positions and sizes are remembered per plugin (the Timeline per style).
- All plugins share the same session state; none of them owns it.
- Adding a new overlay later (e.g. teleprompter, clock) means adding one module that implements this interface.

## 7. Timeline plugin (main focus)

*A project's talks have two Timeline styles, the **Waveform** (the default) and the **Edge strip**; Blocks, Clock card, Side rail and One card went, with the talk indicator, the buttons' edge and the choice of where talking points go (ADR 0036). Decks show every card on the deck widget's Agenda view instead (§9). A saved removed choice reads as the default.*

### v1

- The talk drawn across the overlay, every segment at its **planned** width so the picture keeps still, with a **playhead** that moves in real time; whether the talk will end early or late is said in text, not by markers on the timeline.
- **Overrun:** the playhead holds at the segment's end and pulses; the segment's time turns to `+0:26`. Later segments keep their planned time: the talk ends late.
- A **ruler** under the steps marks the talk minutes at the end of each segment (0 · 3 · 8 · … · 20 min). No clock times: the talk is planned in minutes, whatever time it starts.
- **Plan paused** (open-ended segment): a clear paused state with a count-up of demo time.
- The top row: the segment's name on the left; its countdown centred, in a pill that fills as the segment goes (demo time counts up; `+` time over); the time into the talk on the right, by a clock symbol. How late or early the talk is running sits in the pill.
- **The Waveform** (the default style; ADR 0029) is white on black, or black on white with the Light panel (where every white below is black and every black white): the talk is drawn as one line, each segment in its kind's pattern at its planned width and as whole cycles (the intro a half-height, high-frequency sine, solid; topics a full-height sine at one frequency, every other topic dashed; a demo a half-height square wave, dashed; the outro and a break one long, slow, full-height sine). As the talk goes the wave's inverse is added up to the playhead and cancels it: what has been said is a flat line with a faint shadow of the pattern behind it, what is ahead is fainter, and a finished talk is flat end to end. The playhead is a dot on the line; over its time it holds at the segment's end and pulses. The ruler gives each segment's start minute and name. Holding the wave and dragging along it **looks back** at any point already passed (never ahead): a marker and "Looking at Revenue · 2:53" show on the wave and Talking Points shows that segment's notes, headed "Looking at"; it only looks (the session, the playhead and every time stay as they are), letting go comes back to now, and the window still moves by its frame and top row. The pill is a white outline that fills with white, and carries how late or early the talk is (late black on white); it rings in a signal colour in the last 30 seconds and fills with it when over, the only colour in the look. There is **no talk bar, ring or gauge**, and the clock turns black on white once the planned time has gone. The buttons sit in a white-outlined capsule just off the panel with the talk's name first; its Start is a bare play glyph in Pause's place, and Next is the one filled button once the talk runs. Before the talk starts, a large white **Start** sits over the middle of the wave where Paused does, and starts the talk (unless the buttons are hidden, when the top line says "press Start"); it moves to the top with the buttons' edge, fades with On hover, and keeps the name alone when the buttons are hidden or the talk has finished (when a finished talk's top line says how late or early it ended). In the waveform and the blocks the top row says **Topic** before the segment's name.
- **Style and buttons** (Settings › Overlays): **Waveform** (the default) or **Edge strip**, each with its own window, size and place; choosing one resizes and moves an open overlay. The edge strip is always the display's whole width, flush with its bottom edge, against the very edge of the screen (the default) or above the Dock or taskbar. Previous / Pause / Next are always shown (the default), shown on hover, or hidden; on the waveform they sit in the capsule below it with the talk's name. The Talking Points overlay always opens beside the Timeline.
- While presenting, the talk is measured against its **plan**, not its target: "late" is drift from the plan (you plan your talk and talk your plan). A plan that doesn't fit its target is shown in the editor, and the finished summary compares the talk with its target. The manager's live view, the Control Panel and every overlay say the same.
- Times are shown in whole seconds **rounded up**: 9.2 seconds over is `+0:10`, and a countdown shows `3:00` until a whole second has gone.

### To evolve

The timeline is expected to change through use. Questions to answer in later iterations:

- How much text belongs on the overlay versus the shape alone?
- Should the next segment be previewed?
- Compact (thin strip) versus expanded mode, and switching between them.
- Colour scheme and accessibility (not relying on colour alone for overrun).
- Horizontal versus vertical layouts for different screen positions.
- What controls belong on the overlay itself.

## 8. Talking Points plugin

*The deck widget's Card view, built from this overlay, shows every deck (§9, ADR 0036, ADR 0042). For a project's talk, Talking Points is always its own overlay: the notes inside the Timeline and Not shown went with the Timeline styles.*

Evolves the POC overlay. One minimalist style.

- Shows the **current segment's** name, its position ("2 of 5"), talking points (numbered) and hints (smaller, muted). Before the start it shows the first segment ("Starts with"); after the last, the talk's name and "Finished". A segment with nothing in it says so quietly.
- No clock, no buttons and no next-segment peek: the Timeline shows those.
- Points and hints may use a little Markdown (ADR 0025): **bold**, *italic*, `code` and a bulleted or numbered sub-list one level deep. A link shows its text alone and raw HTML is shown as typed. The overlay and the editor's side panel render it the same way.
- Updates instantly on Next/Previous.
- Opens with every session at the top left of the display (360 × 290), where the Timeline doesn't sit: the waveform opens at the bottom centre and the edge strip along the bottom.
- Its panel is chosen in How it looks (the control panel, Get ready, Settings › Overlays): **Dark** (the POC's translucent dark panel, white text), the default, or **Light** (for a dark slide); the waveform follows the same choice. With the waveform style it takes the waveform's look: white on black (black on white when Light) inside a 4 px frame with 20 px corners (ADR 0029). Everyone is moved to the waveform once, keeping their panel; a panel saved as Minimal, this epic's first try, is read as Dark. It is draggable anywhere, resizable, closable with ✕ until the next session; its place is remembered, and stays the same whichever Timeline style is chosen. If a session starts with it over or under the Timeline, it goes back to the top left. A Timeline style just chosen comes in front of it. Never takes focus and is hidden from screen sharing, like every overlay.

## 9. Decks and flashcards

ADR 0036; the deck widget: ADR 0042. Decks replace quick notes, quick talks and the Timeline styles. A **deck** of **flashcards** runs on the **deck widget**, which has two views of the same run: the **Card view** (one card) and the **Agenda view** (every card along the bottom).

### The deck file

Each deck is a folder in `Documents/Oversay/Decks/` (ADR 0037): `<title> <date made>/deck.md`, numbered ` (2)` when that folder is taken, with its `sessions.json` beside it. `deck.md` is in the quick-note format (ADR 0026) with times; in a folder without one, the folder's only `.md` file is the deck. The same reader, line-keeping, save-as-you-type and skill checks (ADR 0035) apply. Its front matter's `id` (`d_` and 8 of `a–z0–9`, written when the deck is made, never changed) is what Oversay knows it by; its name is `title`, or the folder's name without its date. New deck always makes a new folder, whatever the title. Renaming a deck in Oversay changes `title` and the folder's name, keeping the date; the Trash takes the whole folder. A lone `.md` that lands in `Decks/` (written by an AI or by hand) is moved into `<name> <day the file was made>/deck.md` within a moment, with an id and a title and otherwise unchanged; a deck without an id or title gets them; a copied deck folder, sharing its original's id, gets a new one, keeping its copied sessions. Pins, Recent and `oversay://decks/<id>` links go by the id, so a deck renamed in Oversay or in Finder keeps its place; a link with the deck's name still works. A deck's `resources/` holds whatever the person keeps with it: a file dropped on the open deck is copied in (up to 200 MB; a folder or a larger file is refused with what to do instead), a link dragged onto its Resources or added with Add link becomes a web link file (`.webloc` on a Mac, `.url` on Windows), and anything put there in Finder or Explorer counts too. The deck editor lists them (name, kind, size), opens one with a click through the system, and has Open folder. Oversay never reads a resource or follows a link in it otherwise.

```markdown
---
id: d_k3x9a2bq
title: Stand-up
audience: Platform team
tags: weekly, platform
auto-advance: on
colour: kinds
made-with: Oversay skill 0.1.0
---

# Stand-up · 23 Oct

## Intro [1m, intro]
- Goal for today

## Atlas [3m]
1. Shipped the importer
2. **Blocked** on review
```

- `## Card [3m]` is one flashcard; `[3m, demo]` gives it a kind (`intro`, `topic`, `demo`, `outro`, `break`; `topic` when none); `[~3m]` is about three minutes and still moves on; `[open]` or no time makes it untimed.
- Front matter, all optional and per deck: `audience` (who it's for; `with`, as decks first wrote it, is read the same, and the editor writes `audience` in its place), `project` (a plain name for grouping decks; replaced by workspaces, §10: a deck with one is added once to a workspace of that name, tagged `projects`, and the line is then kept as written, unused; the AI skill no longer writes it), `tags` (comma-separated: shown on the Decks list, searched and filtered by), `timing` (`on` the default; `off` keeps the cards' times in the file and on the plan bar but runs the deck untimed: every card counts up and waits for Next, with no countdown, warning or Auto-advance), `auto-advance` (`on` the default, `off`), `colour` (`kinds` the default, `one`), `hide` (what the card leaves off, any of `position`, `bar`, `next`, `left`, `ends`; nothing by default, so a deck that says nothing shows everything; the editor's "The card shows" ticks them), `made-with`. There is no global default in Settings. A deck has no `when`: a deck is not a meeting (John, 23 Oct); a `when` line is kept as written, unused. `timeline` is retired (ADR 0042): every deck has the Agenda view, so a deck that has the line keeps it as written, unused, and nothing flags it. `deck-bar` is retired the same way: the card's deck bar is always at the bottom, and the editor has no Deck bar choice. So is `record`: every deck can record, from Settings › Recordings' Auto record or the deck widget's record button (§11).
- **The deck editor** has Audience and Tags at the top, the workspaces the deck is in (each a chip that opens it, with × to take the deck out) and Add to workspace, and, when any card is timed, the talk editor's plan bar: one block per card, as wide as its time and coloured by kind, untimed cards hatched; dragging a card's right edge (or ← → on a selected card) changes its time in 30-second steps, and selecting a block goes to that card.

### The deck widget

One overlay for every deck, with two views of the same run (ADR 0042): the **Card view** and the **Agenda view**.

- **The switch**, a small glyph of the other view left of ✕, shown while pointed at, moves the widget to the other view's own remembered place and size; nothing about the run changes. Show and Preview on screen always start in the **Card view** (John, 7 Nov); the switch then goes to the Agenda view. The Card view first opens in the upper left, in from the corner (near the camera); the Agenda view along the bottom, in the middle, 960 px wide.
- **The tab:** Previous, Start / Pause / Resume (Stop once the last card is over) and Next, then a Stop square apart at the end (the first click turns it into a red "Stop?" for 3 seconds, the second stops the deck; a preview or a deck not yet started closes at once), with the deck's name, in a tab that slides out from under the panel's bottom edge while the pointer is over the widget, on both views; 40 × 34 px, Previous and Next 52 px wide, Next filled once the deck runs.
- **Recording:** on every deck, the record button sits left of the switch on both views, always shown once the deck runs (never in a preview): a red dot in a ring while recording, dimmed while paused, a grey dot when not recording, struck through when the microphone was refused (its tooltip says how to allow it). A click toggles it; recording again adds to the run's recording (§11).
- Both views start see-through at 75%, with the other overlays (Dark / Light, opacity, hiding from screen sharing).

### The Card view

- The minimal Talking Points overlay in the waveform's look (4 px frame, 20 px corners, Dark or Light), title first. It shows the card's title and countdown, "2/4", the numbered points (Markdown as in ADR 0025), a thin deck bar with one segment per card, the current one filling (always at the bottom: John, 7 Nov, task 318), the next card ("Next: Beacon · 4m", muted), the time left in the deck and the clock time it ends. Its buttons are in the deck widget's tab.
- **Show** opens it on the first card, **Ready**, paused at the card's full time, until Start (the button) or Space. Every deck has Start, timed or not.
- **Timed card:** counts down; amber in its last 10 seconds; at 0:00 the next card shows, with no sound (Auto-advance). The last card stays and counts on in red (`+0:23`) until **Stop**. With `auto-advance: off`, every timed card stays at 0:00, counts on in red and the foot says "Press Next for <next card>".
- **Untimed card:** counts up, muted, and waits for Next.
- **Previous / Next** carry the card on from where it was left: its clock is all the time it has been shown. A card gone back to after its time ran out comes back over, counting on in red, and waits for Next; the extra time is on that card in the look back. **Pause** stops the clock and says Paused.
- The widget never jumps in size: it is as tall as the deck's longest card needs at its width, so it keeps one size from card to card (John, 7 Nov), and the new card's words fade in. Its width is the person's: dragging its edge resizes it, and its height follows.
- Colour (`colour`): **By kind**, the app's segment colours as in the editor's plan bar, on the deck bar and the countdown; **One colour**, the waveform's ink only.
- **Preview** (the deck editor): the editor shows the deck widget itself, the same component as on screen, in the view it shows, on a made-up slide, live, on the card being edited: close on the card for the Card view, the whole screen for the Agenda view. **Preview on screen** opens the real widget in preview: the card at its full time, never counting or moving on, marked Preview; it follows the edits and the card being edited, and its Previous / Next move the editor too. Nothing is recorded and no hotkeys are taken; Show replaces it, and its ✕, Stop preview or leaving the editor ends it.

### The Agenda view

Every card as a rounded bar as wide as its time (the editor's plan bar, live): done cards faded, a playhead walking across the current one, and each card's title and start minute under its bar, never its points. The top row has the card's kind, name and the next card; its clock in a pill that fills as its time goes (amber in its last 10 seconds, red when over); and the time into the deck out of the whole. An untimed deck, or one with Timing off, has bars of equal width (Timing off keeps the planned widths), no minutes, a clock counting up and the card's position. It follows the deck's colour (by kind, or one colour), Dark or Light.

### Sessions

Every Start is a session: the time on each card is recorded, timed or not, over every visit and without pauses. Nothing about a run is written into the deck file: a deck's sessions are kept in `sessions.json` in its folder: the newest 20, plus any with a note, a transcript or a review (ADR 0036, ADR 0037, ADR 0041), so a rename or move of the folder, in Oversay or outside it, takes them along (a lone deck from before keeps them in `Decks/.sessions/<deck name>.json`). A preview is never recorded.

**After the deck:** when a deck is stopped, the manager comes back on that session's page (§11; John, 7 Nov): its times straight away, and its recording being transcribed when the deck recorded; the deck's name opens the deck editor. The editor shows After the deck at the top, marked Just now: each card's planned time, actual time and the difference ("+0:12 over", "0:09 under", "on time"; in words as well as colour), and the totals. Done moves it to the bottom of the editor, where the latest run and the earlier runs (when, how long, over or under) stay; each opens that session's page (§11).

### Around the app

- The rail shows **Library** (epic 036 (#54), §4). Each deck in it is a card, as favourite talks once were: a pin, its name with who it is for and when it changed, its tags as chips, its cards as a mini timeline in their kinds' colours (untimed cards dashed) with its length, **Show**, and a ⋯ menu with Rename, Add to workspace and Delete; clicking the card opens the deck in the deck editor: the quick-notes editor with a time and kind on each card and the deck's options beside it. **Pinned** and **Recent** are one list each for decks and workspaces together (a workspace marked as one), newest first, in the Library's left pane; there is no separate Recent above the decks. **All decks** is grouped by when they last changed (Today, Yesterday, This week, Last week, Earlier this month, then by month) once there are more than twelve, and has a **Filter** button, with a badge counting the filters on, that narrows the list by **tags** (any of those picked), **audience**, **workspace** and **when** it last changed (any time, this week, this month, the last 3 months), with a count and Clear all; the filters that are on show under the header as chips, each with × to take it off. There are no favourites: a deck starred before is pinned instead.
- **One search bar for the whole app, now a command bar** (task 253, epic 036 (#54)), above every page, filled and rounded as Zoom's, with "Search or type a command (⌘K)" in its middle while empty; ⌘K and ⌘F (Ctrl+K, Ctrl+F) go to it from anywhere. It stays on its own row, with the way back at its left; it is not in the title bar. It finds, grouped, Decks (by name, audience, tags and the workspaces they are in), Workspaces (by name, tag and description), Sessions (by their deck's name, newest first), Templates, Settings sections and pages, best matches first and at most five of each; arrow keys and Enter or a click go to the result (a deck opens in its editor, a session its page, a template opens the picker on it, a section its place in Settings). It also acts: **New deck**, **Deck from a template…** and **New workspace** (typing "new deck Retro" names it), and, on a deck open in the editor, **Show**, **Add to …** and **Take out of …**. **+ New** beside it, filled so it draws the eye, and ⌘N (Ctrl+N), open the bar on what you can make: Blank deck (opens in the editor), Deck from a template… (the picker) and Workspace… (a dialog with a name, a description and tags); what you type first names the new deck or workspace. Looking at a workspace, a new deck goes in it. There is no New button in the Library's pane.
- The AI skill writes every note as a deck, straight into Decks (task 229): untimed unless the person gives times, `audience` for who it is for, and the deck's own keys (`references/deck-format.md`, `note-format.md`); its quick-talk guidance is gone. `oversay-local.json` lists only the Decks folder. Each deck is checked as the app reads it (ADR 0035): `Oversay --check` checks a `.md` file in a `Decks` folder as a deck, with its own keys and the values each option takes, and the deck editor shows the same findings for a deck the skill made. `oversay://decks` opens Decks, `oversay://decks/<name>` opens one and `…/show` shows it, asking once as notes do and refused during a session (ADR 0032).
- **Notes and Talks are gone from the rail**. Each quick note and quick talk moves into Decks once, automatically: copied, read back, then the original to the Trash (Put Back works), with a one-line notice of what moved. A note moves as it is, with `timing: off` when its topics have times (a note's times were only a guide and its clock counted up; the Decks list says "timing off"). A quick talk becomes a deck with its segments' times, kinds, points and hints (as `>` lines), an open-ended segment untimed with its estimate as a `>` line, and its sessions kept as the deck's. The move runs at start and whenever a file lands in the old folders, so an older AI skill that still writes there keeps working. Pins, Favourites and Recent follow the moved files. A dropped Markdown file and **Paste as deck** (⌘⇧V on Decks) make decks; `oversay://notes/…` and `oversay://talks/…` links open the deck of that name.
- Projects are gone (ADR 0039); decks are grouped in workspaces (§10).
- **Example decks and workspaces** (first run; Settings restores any that were deleted, by name): *Welcome to Oversay* (a tour of the features, the Library, + New and templates), *Notes on screen, not in your way* (a 20-minute conference talk about Oversay), *Why bees matter* (a student's seminar) and *Interview talking points* (untimed notes to keep in front of an interviewer on a call). They carry fixed ids so two workspaces can list them: **Oversay talk** (tag Talks: the conference talk and the welcome deck) and **Biology seminar** (tag Study: the seminar). The interview deck is in no workspace, so Unsorted shows on a first run, and it is pinned so Pinned has an item. The other three are put in Recent on the first run, once, Welcome to Oversay first; restoring examples from Settings never adds to Recent.

## 10. Workspaces

ADR 0040 (which replaced ADR 0038's workspaces of collections). A **workspace** is a group of decks: one for a project, a day of a course, or a talk someone is preparing, with its own date, place, notes and files. **Tags** group workspaces: `research`, `tutorials`, `projects`.

### The rules

- A workspace lists decks by id; it holds nothing else but its own files, and never another workspace.
- A deck lives once, in `Decks/` (§9), so it can be in any number of workspaces, or none, and can be added to one later.
- A workspace can have any number of tags, or none.

### On disk

Each workspace is a folder in `Documents/Oversay/Workspaces/`, named for it (numbered ` (2)` when that folder is taken, with characters a file system refuses replaced as for a deck's folder):

```text
Documents/Oversay/
  Decks/                          every deck, once (§9)
  Workspaces/
    Prompt injection in AI agents/
      workspace.json
      resources/
```

```json
{
  "version": 1,
  "id": "w_4hx8m2qa",
  "name": "Prompt injection in AI agents",
  "tags": ["research", "talks"],
  "decks": ["d_k3x9a2bq", "d_7mq2xw4f"],
  "when": "2026-12-02",
  "where": "AppSec Dublin",
  "notes": "30 minutes plus questions"
}
```

- `id` (`w_` and 8 of `a–z0–9`, made as a deck's id is) is what Oversay knows the workspace by, written when Oversay first sees it and never changed. A copied workspace folder, sharing its original's id, gets a new one, as a copied deck does.
- `name` is its name, or the folder's name when there is none. Renaming a workspace in Oversay changes `name` and its folder's name; renaming the folder in Finder or Explorer loses nothing.
- `tags` are words, each once (ignoring case), trimmed, with an initial capital: Oversay capitalises a tag when it reads or writes one.
- `decks` is the deck ids in the order the workspace shows them.
- `when` (a date, `YYYY-MM-DD`), `where` (a place or a link, as written) and `notes` (a few lines of plain text) are optional, and absent when blank.
- `version` is 1. The file is read leniently: unknown fields are kept, written in a stable order, and a file Oversay can't read is reported by name and left as it is, never overwritten. It is checked as it is written, as a deck's front matter is (ADR 0035).
- A folder in `Workspaces/` without `workspace.json` is not a workspace and is left alone (the two-level folders made before ADR 0040 are not converted).
- A workspace's `resources/` holds whatever material its decks share, as a deck's does (§9): files dropped on the workspace's page are copied in, links become web link files, anything put there in Finder counts, and Oversay opens one only when it is clicked.
- Oversay watches `Workspaces/` while it runs, so a workspace made or changed by the AI skill or in Finder shows up.

### Decks in workspaces

- **Add to workspace** on a deck (its ⋯ menu in the Library, its editor, and the command bar's Add to …) ticks workspaces; a workspace's page adds decks with **Add decks**. A deck already in a workspace is not added twice.
- A workspace's decks can be dragged into another order (or moved with Alt+↑/↓). × takes the deck out of that workspace only: it stays in All decks and in any other workspace.
- Renaming a deck or a workspace, in Oversay or in Finder, keeps every deck in its workspaces, since a workspace lists ids.
- Moving a deck to the Trash in Oversay takes it out of every workspace. A workspace that lists a deck Oversay can't find (trashed in Finder, or not yet synced) shows it as gone, with ×, and keeps its id until then; it is never an error.
- A new deck made while looking at a workspace (its New deck, + New, a template) is made in `Decks/` and added to that workspace.
- A deck's `project:` line gives way to workspaces: once, each deck with one is added to a workspace of that name, tagged `projects`, made if needed.

### In the app

- **Workspaces** are in the Library (epic 036 (#54)): in its left pane, after the smart groups, each with its colour (from its first tag) and its number of decks, and as rows in Recent and Pinned (a pin, its name, how many decks, its tags as chips; Open). A workspace's pin is the same one on its page. Pinned and Recent are kept in this computer's settings (`workspaceNav` in `settings.json`), by workspace id; a workspace moved to the Trash leaves them; opening a workspace puts it first in Recent (12 are kept). **Workspace…** in + New makes one with a name, a description and tags. A workspace's **when** and **where** stay in `workspace.json`; the page neither shows nor asks for them.
- **Tags** show as chips and are added and taken off on a workspace's page. Tag colours, and renaming, merging and deleting a tag across workspaces, have no screen in the Library yet (the rules stay in `lib/workspaces`).
- **A workspace's description** is its `notes` field, shown under its name, edited in place (click it, click away to save) and found by search. No key or file changes.
- **Adding a tag** (a workspace's page, New workspace) lists the tags already in use that it hasn't got, with how many workspaces use each, narrowed by what is typed, and offers **New tag “…”** when what is typed is new; Enter takes the first choice, × takes a tag off, and Backspace in the empty box takes off the last.
- **A workspace's page** has its name, its tags, its description (editable in place), its decks in order as Decks shows them (Show, open in the editor, drag to reorder, × to take out), Add decks, New deck, and its **Resources**: its own files first (dropped on the page or added as links; Open folder), then **From its decks**, each of its decks' own resources under the deck's name, opened with a click, with Open deck; a deck's resources are added or taken away in the deck. A deck opened from it goes back there. Its way back sits at the left of the search bar's row, as for a deck.
- **All decks**, in the Library, is every deck whether in a workspace or not (§9), and filters by workspace; **Unsorted** lists the decks in none. A deck can be in several workspaces.
- **Search** (§9) finds workspaces by name, tag and description, and a deck by the workspaces it is in; a deck's result names them.
- **The AI skill** lists workspaces (by tag when asked), makes a workspace with its tags, tags one, and adds a deck to one or takes it out, by writing `workspace.json` as Oversay does, without an id, and checking it with `Oversay --check`; asked for a workspace whose name is taken, it asks before making another (task 280). `oversay-local.json` lists the Workspaces folder beside Decks.
- **Projects** are gone (ADR 0039); a project is a workspace tagged `projects`, if the person wants one.

## 11. Sessions

ADR 0041. A **session** is one Start of a deck, kept in the deck's `sessions.json` (§9). Projects and talks are gone (ADR 0039), so a session is always a deck's. Looking back on sessions, writing about them and having an AI review them is how a person gets better at a deck.

### On disk

```text
Decks/Weekly standup 2026-10-25/
  deck.md
  sessions.json                    each session may have "note"
  transcripts/2026-10-28 09-00.md  split by card
  reviews/2026-10-28 09-00.md      written by the skill
  recordings/2026-10-28 09-00.wav  only until it is transcribed
  resources/
```

```json
{
  "version": 1,
  "sessions": [
    {
      "startedAt": "2026-10-28T09:00:04.120Z",
      "endedAt": "2026-10-28T09:14:51.002Z",
      "cards": [{ "name": "Intro", "kind": "intro", "plannedSeconds": 60, "seconds": 74 }],
      "visits": [{ "card": 0, "from": "2026-10-28T09:00:04.120Z", "to": "2026-10-28T09:01:18.400Z" }],
      "pausedSeconds": 35,
      "note": "Ran over on Atlas again: cut the importer detail."
    }
  ]
}
```

- A session is known by its `startedAt`. `cards` is what each card was planned and how long it was up, as now (§9). `visits` says when each card was on screen, a visit ending at a move or a pause, so a transcript can be lined up with the cards; `pausedSeconds` is the time spent paused. Sessions recorded before these were added have neither, and their transcripts are lined up by each card's time in order.
- `note` is the person's own text about the run, a few lines of plain text, absent when blank. `sessions.json` is Oversay's: the skill reads it but never writes it.
- **Keeping:** a deck keeps its newest 20 sessions, plus any with a note, a transcript or a review; the limit only drops sessions nobody wrote about. Deleting a session (after asking) takes its transcript, review and recording to the Trash with it.
- **A session's name** for its files is its start in local time, `YYYY-MM-DD HH-mm`; a second session of the deck that started in the same minute is ` -2`, then ` -3` (John, 28 Oct). Its transcript, review and recording share that name.
- The file is read leniently, unknown fields kept, as `workspace.json` is (§10).

### The Sessions screen

**Sessions** on the rail (no longer "Soon") lists every session of every deck, newest first, **grouped by day** as Decks is (Today, Yesterday, This week, …). Each row has the deck's name and its workspaces as chips, when it ran and for how long, actual against planned (`+1:20 over`, `0:40 under`, `on time`, in words as well as colour), a bar of each card's time in its kind's colour with overruns marked, and small marks for a note, a transcript and a review. A **Filter** button, as on Decks, narrows the list by **workspace**, **deck** and **dates** (this week, this month, the last 3 months, or a range), with chips and Clear all. The app's one search bar finds sessions by their deck's name (§9). With no sessions yet, the screen says how one is made: Show a deck and Start it.

### A session's page

Opened from the Sessions screen, search, or a deck's earlier runs (§9). It shows:

- The deck's name (it opens the deck), when it ran, how long against planned, paused time, and **Show again**.
- **Cards against plan:** each card's planned and actual time and the difference, overruns in words and colour, untimed cards marked, and a card visited more than once says so.
- **Note:** what went wrong, what to improve; saved as it is typed.
- **Transcript:** under each card, what was said while it was up, with the time. **Add a transcript…** (or a file dropped on the page) imports one from the call app.
- **Review:** the AI review when there is one (its sections, with the skill that wrote it), or **Review with your AI**, which copies a request for the person's agent ("Review my Weekly standup session of Wed 28 Oct 09:00 in Oversay."), shows it to copy by hand when the clipboard can't be written, says where to paste it, and links the AI page (§4).
- **Delete session** in its ⋯ menu, after asking.

### Transcripts

A transcript is Markdown in the deck's `transcripts/`, split by card, each card a `## ` heading with its planned and actual time, and its lines under it with their time from the session's start:

```markdown
---
session: 2026-10-28T09:00:04.120Z
source: zoom (GMT20261028-090001_Recording.transcript.vtt)
---

# Stand-up · 28 Oct 09:00

## Intro · 1:00 planned, 1:14 actual
- 0:02 John: Morning all, three things today.

## Atlas · 3:00 planned, 4:20 actual
- 1:16 John: The importer shipped on Monday.
```

- **From the call app:** a Zoom, Teams or Meet `.vtt`, an `.srt`, or a `.txt` with a time on each line, dropped on a session's page or given to the skill. Its times are matched to the session's: by the clock time when the file has one, otherwise by its start lining up with the session's Start (the page shows the match, and lets it be moved by a few seconds). Each line goes to the card that was up then; lines from before Start or after Stop, or during a pause, are left out, and `source` says where it came from. Speakers are kept as the call app named them. A file that isn't a transcript is refused with what it was taken for; one that doesn't overlap the session asks first. A transcript already there is replaced only after asking.
- **From the person's voice:** below.

### Recording my voice

- One setting for every deck, not a per-deck choice (John, 7 Nov). **Settings › Recordings** has **Auto record** (off by default), which says what it does: only this computer's default microphone, never the call's audio or anyone else's, and transcribed on this computer. It also shows whether Oversay may use the microphone (and how to allow it when refused), **where recordings go** (`Documents/Oversay/Decks/<deck>/recordings/<session>.wav`, shown as information and not changeable), Keep recordings and the speech model.
- With Auto record on, every deck records from Start; off, it records once the deck widget's record button is pressed (§9). Either way it records until the button stops it or the deck stops, pausing with the deck, into the deck's `recordings/` as 16 kHz mono WAV: red while recording, grey when not; recording again adds to the run's recording. A preview never records.
- The first recording asks for microphone permission, with the reason ("Oversay records your voice while a deck runs, for a transcript made on this computer"). If it is refused, the deck runs anyway, the record button is struck through and says how to allow it in System Settings (or Windows' privacy settings), and so does Settings › Recordings.
- Until something records, no permission is asked.

### Transcribing on the device

- After the run, a recording becomes a transcript split by card, with Whisper (`whisper.cpp`, the same on a Mac and Windows), lined up by the session's own clock. The session's page shows its progress, and it carries on in the background.
- Whisper's model is downloaded once, the first time it is needed, after the person says yes to a prompt that shows its size and where it is from; it is kept in the app's data folder, checked against a known hash, and can be removed in Settings. Saying no keeps the recording, and the page offers it again.
- Nothing leaves the computer. The recording is moved to the Trash once it is transcribed, unless Settings › Recordings › **Keep recordings** is on (off by default).

### The AI review

- The Oversay skill reviews a session in the person's agent (ADR 0033, 0041): asked to "review my last stand-up" or a session by date, it reads the deck, the session (from `sessions.json`), its note and its transcript, and writes `reviews/<session name>.md`: what ran over, what was rushed, skipped or wandered from, and what to change in the deck. It changes the deck only when asked. Given a transcript file, it makes the session's transcript as Oversay would.
- A review says which skill made it (`made-with`, ADR 0035) and which session it is of, and is checked with `Oversay --check`.
- Oversay watches `transcripts/` and `reviews/` as it watches decks (ADR 0034), so one written by the skill shows on the session's page.

## 12. Phases

### Phase 1: plan and present (ticketed)

| Feature | Epic |
| --- | --- |
| App foundation: new Tauri + Svelte app, multi-window, plugin host, CI | epic 002 |
| Project model and file format | epic 003 |
| Manager UI | epic 004 |
| Templates | epic 005 |
| Session control | epic 006 |
| Timeline plugin v1 | epic 007 |
| Talking Points plugin v1 | epic 008 |

### Later phases

What might come after phase 1, and the ideas for later, are kept in the private `oversayapp/design` repository (`roadmap/`). When one is picked up, it becomes an epic here.

## 13. Decisions and open questions

### Decided (2026-10-06)

1. **Hotkeys:** the §5 defaults stand. Clicker support is for a later phase.
2. **No full script in phase 1:** points and hints only; scripts may come later, with an AI breakdown.
3. **Templates** live in the app config folder only; export may come later.
4. **Sessions are kept forever** in the project file; they're small and a later review needs the history. *(Projects are gone; a deck keeps its newest 20 sessions plus those written about, §11.)*
5. **Hidden from screen capture by default**, with a per-session switch (ticket `002/07`).
6. **Full-screen slideshows** are checked early (ticket `002/05`).
7. **Displays:** overlays remember their display; first open is on the built-in/primary display.
8. **Driving a session:** the Timeline has Start, Pause, Next, Previous and End (ADR 0020), and the menu-bar/tray icon has the same in its menu. The Control Panel is a window docked at the right edge, never captured (ADR 0028), for how the overlays look and what is on screen.

### Open

1. How the AI is hooked up for analysis and timing suggestions: for a session's review, the person's own agent through the Oversay skill (ADR 0041, §11); timing suggestions are still open.
2. ~~Recording format and storage~~: decided by ADR 0041 (§11): audio lives with the session in the deck's folder until it is transcribed.
