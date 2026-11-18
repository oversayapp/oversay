# The Oversay skill

Lets an AI app make, add to and find Oversay **decks**: cards with points and an optional time, which Oversay shows one at a time (a note is a deck without times; ADR 0036). Each deck is a folder written straight into Oversay's Decks folder, `<name> <date>/deck.md` with a title; Oversay gives it its id (ADR 0037), so Oversay doesn't need to be open. The decisions are in ADRs 0031–0034 and 0037.

- `SKILL.md`: what the AI reads first.
- `what-it-can-do.md`: the walkthrough the AI gives, as written, when asked what the skill can do.
- `references/note-rules.json`: the keys, values, kinds and messages `Oversay --check` checks a deck with (ADR 0035), written by `make skills` from the app's code.
- `references/note-format.md` (cards, points, folder names) and `references/deck-format.md` (front matter and times): the format. Their last parts are written by `make skills` from the app's code; don't edit those parts by hand.
- `examples/decks/`: finished decks, each a dated folder with its `deck.md`, and a deck before and after an addition. `make check` reads each through the app's own reader and checker.
- `Oversay --check <file>` checks a deck; the installer writes the app's path into `oversay-local.json` as `oversay`, with the Decks folder as `decks`.

The skill's version is the app's (`app/package.json`). Every deck the skill makes says `made-with: Oversay skill <version>`, so Oversay can tell when a skill in a chat app's account is out of date. Oversay updates the copies it installed itself. `make check` fails when the version or the generated part is stale; `make skills` brings them up to date.

## Install from the marketplace

This repository is a Claude Code and Codex plugin marketplace (ADR 0049). `.claude-plugin/marketplace.json` lists one plugin, `plugins/oversay/`, which `make skills` makes from this folder; never edit it, `make check` fails if it differs.

- **Claude Code**: `claude plugin marketplace add oversayapp/oversay`, then `claude plugin install oversay@oversay`, then start a new session. Or paste the install prompt from Oversay's AI page. Auto-update is off for a marketplace that isn't Anthropic's: turn it on in `/plugin` › Marketplaces, or run `claude plugin update oversay@oversay`. The skill is `/oversay:oversay`.
- **Claude app and Cowork**: **Customize › Plugins › Add › Add marketplace**, enter `oversayapp/oversay`, install Oversay. A prompt in chat can't do it (*not tried*). Whether a plugin added here reaches Claude Code as `oversay@synced` is *not verified*; treat each app as its own install.
- **Codex**: `codex plugin marketplace add oversayapp/oversay`, then `codex plugin add oversay@oversay`; update with `codex plugin marketplace upgrade`. Both installed and listed the skill from a local checkout (2026-11-18). Layout matters: Codex skips a skill that sits at the plugin's root, so the plugin is a generated folder with `skills/oversay/` inside.
- **Gemini CLI**: not tested here, so no command is given. Use Install from Oversay.
- **Gemini app, ChatGPT**: take an upload only. Each release page has `oversay-skill.zip` and `oversay-plugin.zip`.

Remove: `claude plugin uninstall oversay@oversay`, `codex plugin remove oversay@oversay` (both *not tried*). Your decks are untouched. A skill from the marketplace has no `oversay-local.json`: it uses `Documents/Oversay/Decks`, the only place Oversay keeps decks, and finds the app at its usual path to check a deck. Having the skill from Install and from the marketplace gives two copies in Claude Code (`/oversay` and `/oversay:oversay`): keep one.

## Install from Oversay

Open **AI** in Oversay's rail. **Install** puts the skill into Claude Code, Codex or Gemini CLI; **Copy marketplace address** is for the Claude app (the plugin can still be saved as a file), and **Save skill…** is for the Gemini app. Claude Code's and Codex's rows also have **Copy the install prompt**.

## Install by hand

From a checkout of this repository, copy this folder.

### Claude Code

```sh
mkdir -p ~/.claude/skills
cp -R skills/oversay ~/.claude/skills/
```

Start a new Claude Code session. `/skills` lists `oversay`. Ask, for example: "Create an Oversay note for my catch-up with Sam tomorrow: the hiring plan and the offsite."

On Windows (PowerShell): `Copy-Item -Recurse skills\oversay "$HOME\.claude\skills\"`.

### Codex

```sh
mkdir -p ~/.agents/skills
cp -R skills/oversay ~/.agents/skills/
```

Start a new Codex session. *Unverified:* older guides use `~/.codex/skills`. A hands-on check will show which folder current Codex reads.

### Gemini CLI and Antigravity CLI

Gemini CLI reads personal skills from `~/.gemini/skills` or `~/.agents/skills` (its docs, 2026-04-30), so the Codex copy above serves it too; installing for either from Oversay installs for both. Start a new session; `/skills` lists it.

Google replaced Gemini CLI with Antigravity CLI (`agy`) for personal Google accounts on 2026-06-18. It reads `.agents/skills` in a project; whether it reads `~/.agents/skills` is *unverified*. If it doesn't, copy the skill into the project's `.agents/skills`.

### Gemini app (gemini.google.com, the Mac app)

1. In Oversay, AI › Gemini app › **Save skill…** saves `oversay-skill.zip`: the `oversay` folder with SKILL.md in it, no hidden files.
2. In Gemini, **Customize › Skills › Create › Upload**, and choose the zip. It needs a personal Google account, age 18 or over, with Keep Activity on; skills are rolling out from 2026-10-13. *Unverified:* that Gemini accepts the folder inside the zip rather than SKILL.md at its top.
3. Chat can't write to this computer: it gives you the deck to download. Drop it on Oversay's window.
4. Gemini Spark in the Mac app (Ultra plan, US, beta) can work in folders you link, so it may write notes straight into Oversay. Not tried.

### Claude app (claude.ai, the desktop app, Cowork)

1. In Oversay, AI › Claude app and Cowork › **Save plugin…** saves `oversay-plugin.zip`: `.claude-plugin/plugin.json` and the skill (`claude plugin validate` passes on the same layout).
2. In Claude, **Customize › Plugins › Add › Upload plugin**, and choose the zip. It stays on your own account.
3. **Chat** runs the skill in Anthropic's sandbox: it can make the note but not put it on your computer, so it gives you the file. Drop it on Oversay's window.
4. **Cowork** writes the note straight into Oversay when the task may work in `Documents/Oversay`. Whether it can open `oversay://` links is unverified.
5. The plugin also syncs to Claude Code as `oversay@synced`. If you installed the skill for Claude Code from Oversay too, turn one off with `/plugin`.

*Save the skill alone* (the link under the steps) gives `oversay-skill.zip` for **Customize › Skills** instead.

### ChatGPT

What ChatGPT can do differs by view and plan (researched 2026-10-21; see the design page):

- **Chat** (web and desktop) can't reach this computer, and local tools don't reach Chat today (openai/codex#38162). In Oversay, AI › ChatGPT › **Copy instructions**, and paste them into a Project's instructions or your own. ChatGPT then writes notes in Oversay's format; copy one and use **Notes › Paste as note** (⌘⇧V / Ctrl+Shift+V), or save it as a `.md` file and drop it anywhere on Oversay's window.
- **Skills**: if your plan has personal skills (reported for Business, Enterprise and Edu), **Save the skill** gives `oversay-skill.zip` to add there. It still can't write to this computer from Chat.
- **Codex** in the ChatGPT desktop app: install for Codex from Oversay's AI page; it writes notes straight into Oversay.
- **Work** (desktop) may use local files when enabled for the account: not tried yet.

## Any chat: drop or paste

A note file from any chat, say one it saved to Downloads, can be dropped anywhere on Oversay's window: each `.md` is copied into Quick notes (the file stays where it was), a taken name gets " 2", and Undo moves the copy to the Trash. Markdown on the clipboard becomes a note with **Paste as note**, named after its `# ` title or first topic.

## Trying it without touching your notes

Put an `oversay-local.json` next to `SKILL.md` in the installed copy, pointing at a scratch folder:

```json
{ "notes": "/tmp/oversay-try/Quick notes" }
```

Oversay's installer writes this file with the real folders. Delete it to go back to the default folder.

## Prompt fixtures

`skills/fixtures/prompts/<case>/` holds a request (`prompt.md`), any files there before it (`before/`), what a real run made (`golden/`) and what must be true of it (`case.json`): the file it makes (a `*` where the name is the AI's choice), its topics (each name containing the word given), at most how many points (more means made-up ones), what it must mention, that a new note says `made-with`, that it passes `Oversay --check`, that earlier lines are kept, and for a quick talk that its times add up. A new deck must be a dated folder with a title and no id. A case with `asks` (a title already taken) must make nothing and ask: its reply is kept as `reply.md` beside the golden.

- `make check` runs the assertions on the committed goldens (`app/src/lib/notes/skill-fixtures.test.ts`).
- `make skill-try` (or `CASE=<name>`) runs the requests through Claude Code in scratch folders and checks what it made. It is a paid model run, so it is manual. `SKILL_TRY_SAVE=1` copies the results over the goldens; review the diff.

## Hands-on checklist

One row per app, filled in when someone tries it. Each covers: install, "create a note for…", "add this Markdown to my … note", "open it" and "show it", and "make me a 10-minute … talk".

| App | Date | Version | Who | Result |
| - | - | - | - | - |
| Claude Code, headless (`make skill-try`) | 2026-10-21 | Claude Code 2.1.306 | Claude | All four fixtures pass. Open and show were not tried headless |
| Claude Code, headless (`make skill-try`) | 2026-10-22 | Claude Code 2.1.308 | Claude | All four pass after two fixes: a skill installed for Claude Code was used instead of the one under test (runs now leave user skills out), and a new note had made-up placeholder points (SKILL.md now forbids them; the case caps points). Each note ran `Oversay --check` |
| Claude Code, headless (`make skill-try`) | 2026-10-25 | Claude Code 2.1.310 | Claude | All six pass with decks as folders (ADR 0037): new decks are dated folders with a title (re-run without ids the same day: the skill leaves them to Oversay); with the title taken it asked add or new and made nothing; it used a deck's `resources/` when asked. Each deck ran `Oversay --check` |
| Claude Code, marketplace from a local checkout (`claude plugin marketplace add`, `install oversay@oversay`) | 2026-11-18 | Claude Code 2.1.325 | Claude | Installs, `claude plugin validate` passes, the skill loads as `<plugin>:oversay`. Not tried from GitHub, or in a session making a deck |
| Claude Code, in a session | | | | |
| Codex, marketplace from a local checkout | 2026-11-18 | codex-cli 0.169.0-alpha | Claude | Reads `.claude-plugin/marketplace.json`; `plugin add` installs; the app-server skill list shows `oversay:oversay`, but only with the generated `plugins/oversay/skills/oversay/` layout (a plugin whose root holds `SKILL.md` installs and lists nothing). No session made a deck |
| Codex | | | | |
| Gemini CLI | | | | |
| Antigravity CLI | | | | |
| Claude chat (claude.ai, desktop) | | | | |
| Cowork | | | | |
| Gemini app (web, Mac) | | | | |
| ChatGPT Chat | | | | |
| ChatGPT Work | | | | |
| ChatGPT desktop, Codex view | | | | |
