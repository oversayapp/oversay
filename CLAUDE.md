# Oversay

Tauri v2 + Svelte 5 app in `app/`. Product spec: `docs/spec.md`.

- **Getting started:** `make setup` once per clone or machine (macOS): installs mise with Homebrew, then Rust, Node 24, cmake, gitleaks, cargo-audit and shellcheck from `mise.toml`, runs `npm ci` in `app/` and `make hooks`, and ends with `make doctor`. It is safe to run again, never uses sudo, and `make setup DRY=1` shows the plan. `make doctor` is a read-only check of every tool and exits 1 if one is missing. Building needs Rust, Node and cmake (whisper.cpp, ADR 0041).
- **Run and debug:** `make dev` starts the app in the background and returns (`PORT=…` per worktree; refuses if already running), `make logs` follows it, `make stop` stops it, `make crash` summarises the newest crash, `make clean-rust` deletes the Rust build output when it has grown; `make` lists every target. `out/dev.log` holds the app's output, including `action:` lines showing what the tester clicked. **Account stage:** a debug build (`make dev`, the tests) signs in to the `dev` cloud stage and a release build to `prod`; `OVERSAY_ACCOUNT_STAGE=dev|prod` at build time overrides either (`app/src-tauri/src/account/mod.rs`).
- **UI changes:** run `make shots` and look at `out/shots/` before asking John to test.
- **Before pushing:** `make check` must exit 0. CI doesn't run, so this is the only check a change gets. **Before a PR** is opened or marked ready: `make pr-checks` (level two: `make check`, every commit on the branch scanned for secrets, `npm audit`).
- **Git hooks:** run `make hooks` once per clone. Each commit is then checked for secrets (gitleaks, `.gitleaks.toml`) and its files linted (ESLint, `app/eslint.config.js`; rustfmt and clippy). `git commit --no-verify` is for emergencies only; never skip a refusal to get a commit through.
- **Work tracking:** epics are GitHub issues in this repo (label `epic`) with a Validation list John ticks; bugs are issues labelled `bug`. Tasks are not filed (ADR 0043): the agent slices an epic into its own plan, in its session or in `out/plans/` (never committed), and the PR lists the slices it built with `Part of #EPIC`. Old ids such as `007/02` in commit subjects and ADRs are no longer mapped. An agent never closes an epic or ticks its Validation list: that is John's. Work on a branch per epic; `main` changes only through reviewed PRs.
- **Platform window code** (macOS panels, capture hiding, display detection) lives in `app/src-tauri/src/platform.rs`; read its comments before changing how overlay windows are created, shown or closed. Hands-on platform results: `docs/platform/fullscreen-results.md`.
- **Decisions:** `.adr/`. **Designs:** the private `oversayapp/design` repository; a design is linked from its issue, never from code (`CODING_STANDARDS.md`).
- **Review rules:** `CODING_STANDARDS.md`.

<!-- project-standards:start -->
## Project standards (binding)

This project's working rules are pinned in `docs/work-standards.md`. They hold for the life of the project and override the defaults of any skill, plugin, or agent workflow. A skill decides how the work flows; these decide what the result must look like.

Read `docs/work-standards.md` before you create or change a ticket or epic (in files or in a tracker), make, record, or contradict an architectural decision, write or change code or tests, or verify, review, finish, or merge work.

- If a skill's instructions or templates disagree with a standard, follow the standard and say so in one line.
- Never edit `docs/work-standards.md` as part of other work. If a standard is wrong or in the way, stop and propose the change to the user.
- When you brief a subagent or child session, tell it `docs/work-standards.md` applies.
<!-- project-standards:end -->
