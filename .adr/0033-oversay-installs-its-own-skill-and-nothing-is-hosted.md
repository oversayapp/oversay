---
status: accepted
date: 2026-10-21
---

# Oversay installs its own skill, and nothing is hosted

task 154 planned a public source for `npx skills add` and a public mirror. John ruled out anything public on 16 Oct (ADR 0030). So the skill reaches people the way the app does: inside the app.

## Decision

- **The skill ships inside the app** as a bundled resource (`skills/oversay/`, copied in by the build). Its version is always the app's. A CI test checks that the bundled copy equals the source.
- **Install is a copy, made by the app** (the AI page, design A of the AI skill concepts mockup):
  - Claude Code: to `~/.claude/skills/oversay/`, a personal skill.
  - Codex: to `~/.agents/skills/oversay/`. The path is checked hands-on first; older guides say `~/.codex/skills`.
  - Each copy gets `oversay-local.json` with this computer's Oversay folders (ADR 0031).
  - An existing copy is replaced only after asking. Remove takes it out. A row shows Installed, or Update available when the app is newer than the copy.
- **For apps that keep skills on an account, the app saves a file for the person to upload:**
  - Claude (chat, desktop, Cowork): a plugin `.zip` (`.claude-plugin/plugin.json` and the skill), uploaded at Customize › Plugins. The upload stays on the person's own account and is not public; Claude also syncs it to Claude Code.
  - ChatGPT: a skill `.zip`, and **Copy instructions**, a short text to paste where a plan has no skills.
  - The app can't see what was uploaded, so it never shows those as installed.
- **No marketplace repository, no `npx skills add` from a public source, no download page,** until Oversay goes public. The written steps in `skills/oversay/README.md` use the files the app saves.

## Considered options

- **A Claude Code plugin from a local marketplace** (`claude plugin install oversay --marketplace <dir in the app bundle>`). It updates when the app does, but it needs the `claude` command on the PATH, and the plugin name prefixes the skill (`/oversay:notes`). A plain copy needs nothing. It can be added later.
- **A private GitHub repository as the marketplace.** Every person would need access to it. That is the same problem as the private update feed in ADR 0030.

## Consequences

- The app is not sandboxed today, so it can write to `~/.claude` and `~/.agents`. A Mac App Store build would lose this (as noted earlier).
- After an app update, installed copies are older until the person presses Update. The AI page says so, and the skill names its version, so a mismatch can be seen.
- Someone with the Claude plugin uploaded *and* the personal Claude Code copy has the skill twice in Claude Code. For Claude Code, Oversay suggests the copy: it needs no account and always matches the app. The README says to turn off the synced plugin in Claude Code (`/plugin`, Installed) when both are there.
