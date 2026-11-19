---
status: accepted
date: 2026-11-18
---

# The skill folder is the source, and this repository is its marketplace

Supersedes the marketplace parts of [ADR 0033](0033-oversay-installs-its-own-skill-and-nothing-is-hosted.md): its "no marketplace repository … until Oversay goes public" and its set-aside option of a plugin from a marketplace. The rest of 0033 stands: the app installs its own copy, writes `oversay-local.json`, and saves a file for apps that keep skills on an account. (Epic 038, oversayapp/design#10.)

0033 held the marketplace back because nothing could be public. [ADR 0044](0044-the-update-feed-is-a-redirect-to-the-public-repositorys-latest-release.md) made this repository public.

## Decision

- **One hand-written source: `skills/oversay/`.** Everything else a person installs is derived from it, the plugin description in `skills/plugin-manifest.json` and the version in `app/package.json`, by `make skills`, and never edited. `make check` (`node scripts/version.mjs --check`) fails, naming the file, when a generated file differs, one is missing or extra, or `SKILL.md`'s version is not the app's.
- **The plugin is a generated folder, `plugins/oversay/`** (`.claude-plugin/plugin.json` and `skills/oversay/`), and the marketplace is `.claude-plugin/marketplace.json` at the repository root, name `oversay` (`oversay@oversay`), source `./plugins/oversay`. Tried on 2026-11-18 (Claude Code 2.1.325, codex-cli 0.169.0-alpha): both install it and Codex reads the same marketplace file. Using `skills/oversay` itself as the plugin root installs in Claude Code but Codex then lists no skill, so the generated folder is the cost of reaching Codex.
- **The version is the app's, written into the plugin manifest and the marketplace entry** and checked there; the release job also fails when a zip it publishes carries another. A person on the marketplace moves when a release commit bumps it, not on every commit.
- **The install prompts name the repository, not a tag.** A marketplace added at a tag never updates; John chose auto-update on (the prompt asks Claude Code to turn it on, as it is off by default for this marketplace). A person who wants to stay on a release adds `oversayapp/oversay#vX.Y.Z` by hand.
- **Releases carry `oversay-skill.zip` and `oversay-plugin.zip`**, made by the built app (`Oversay --package-skill`) with the code behind the AI page's Save… buttons; the plugin zip's manifest is built from the same `skills/plugin-manifest.json`.
- **The AI page keeps Install as the main route.** The marketplace, the prompts and the zips are extra routes. A marketplace copy cannot be seen by the app, so the page says to keep one copy and does not detect it.
- **The skill needs no new lookup.** Decks are always `Documents/Oversay/Decks`, so a skill without `oversay-local.json` already finds them (SKILL.md); no `Oversay --where`.

## Considered options

- **A standalone skill repository** with copies published by a build step: a second repository, a token in CI, a second place to drift.
- **The skill folder as the plugin root:** no copy, but Codex ignores it.
- **A git submodule:** marketplaces fetch these unevenly.
- **Making the zips from a download:** the bundled copy always matches the app and works offline.

## Consequences

- Adding the marketplace clones the repository (about 4 MB of pack); an install copies only the plugin folder.
- `plugins/oversay/` is a committed copy of the skill: a second place a hand edit could land, caught by `make check`.
- Claude Code and Codex formats can change; the wrappers are one script (`scripts/skill-package.mjs`), so a change touches one file and `make check` fails first.
- Not verified: install from GitHub itself (tested from a local path), Gemini CLI, the Claude app's Add marketplace, whether a plugin added there syncs to Claude Code, and uninstall and update commands.
