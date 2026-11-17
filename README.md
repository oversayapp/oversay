# Oversay

Oversay helps you give a talk or run a meeting on time. You plan what you want to say as a **deck** of timed cards, then present with small always-on-top overlays that show the card you are on, how far through it you are, and what comes next. After a run, Oversay keeps a session you can look back on and review.

It is a desktop app for macOS and Windows, built with [Tauri](https://tauri.app) v2 and [Svelte](https://svelte.dev) 5.

> **Status: early.** Oversay has not had a public release yet. Builds are unsigned, so macOS Gatekeeper and Windows SmartScreen will warn you on first launch. The app does not check for updates yet.

## What it does

- Plans a talk or meeting as Markdown decks of cards, each with points and an optional time.
- Shows the running deck in an always-on-top widget, with a Card view and an Agenda view.
- Can hide its overlays from screenshots and screen sharing. This depends on the operating system and the sharing app, and is not guaranteed: see [`docs/platform/`](docs/platform/).
- Records each run as a session, and can transcribe it on your device with [whisper.cpp](https://github.com/ggml-org/whisper.cpp). Nothing is sent anywhere; the speech model is downloaded once from Hugging Face and checked by its SHA-256.
- Installs an optional skill for AI coding assistants, so they can write decks for you.

Your decks are plain files in `Documents/Oversay`.

## Build from source

You need Rust, Node and cmake (whisper.cpp is built from source). On macOS, `make setup` installs [mise](https://mise.jdx.dev) with Homebrew and then everything `mise.toml` pins (Rust, Node, cmake, gitleaks, cargo-audit), the app's npm packages and the git hooks. `make doctor` checks that nothing is missing.

```bash
make setup     # once; safe to run again
make dev       # start the app in the background; make logs follows it, make stop stops it
make check     # type checks, lint, tests, Rust checks and dependency audit
```

`make` lists every target.

### On Linux and the Steam Deck

`make setup` works on Linux too, without sudo. It downloads mise into `~/.local/bin` (a pinned release, checked against its SHA-256) and installs the rest as on a Mac. The Tauri build libraries (WebKitGTK, AppIndicator, librsvg, ALSA, libxdo, libclang) come from the system: if one is missing, `make setup` and `make doctor` name it and the `apt-get` command that installs it, and leave running it to you.

On **SteamOS** (the Steam Deck in desktop mode) the root filesystem is read-only, so the build libraries go into a [distrobox](https://distrobox.it) named `oversay-dev` instead: an Ubuntu 24.04 container that shares your home folder and the desktop session, so the app's windows open on the Deck's desktop. Nothing outside your home folder changes. From Konsole:

```bash
git clone https://github.com/oversayapp/oversay.git && cd oversay
make setup     # creates the oversay-dev box (several minutes the first time), then runs the rest inside it
make doctor    # every tool and library, checked inside the box
make dev       # starts Oversay; make logs, make stop as on a Mac
```

From the Deck's own terminal every target except `make setup` runs inside the box by itself. `distrobox enter oversay-dev` opens a shell in it. Another Linux can use the same box: `export OVERSAY_DEVBOX=1` (in your shell startup file too), then `make setup`. To start over, `distrobox rm oversay-dev`, then `make setup`.

## Documentation

- [`docs/spec.md`](docs/spec.md): the product spec.
- [`.adr/`](.adr/): the architecture decisions and why they were made.
- [`docs/releasing.md`](docs/releasing.md): versions, builds and releases.
- [`docs/security/`](docs/security/): security reviews and scans.
- [`CHANGELOG.md`](CHANGELOG.md): what changed.

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md). To report a vulnerability, follow [SECURITY.md](SECURITY.md), not a public issue.

## Licence

Copyright (C) 2026 John Ryan

[GPL-3.0-only](LICENSE). The third-party components Oversay ships with and their licences are listed in the app's About page.
