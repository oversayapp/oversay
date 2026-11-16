# Coding standards

Read during review. Mechanical rules are enforced by `make check` (types, tests, `cargo fmt`, clippy, `scripts/check-window-rules.py`: window commands are async, overlay code never focuses; `scripts/check-commands.py`: every invoked Tauri command is registered). These are the judgement calls no check covers.

## Shared wire names have one source of truth

Anything both Rust and TypeScript must agree on (window label prefixes, state channel and event names, id formats and validation rules, command names and payload shapes) is defined once, or defined on both sides with a test on each side using the same cases.

Flag a change that adds or edits such a name on one side only, or that changes a rule on one side without updating the matching test on the other. Example: plugin ids, `is_valid_plugin_id` in `overlay.rs` and `isValidPluginId` in `windows.ts`, tested with identical cases.

## Platform-specific window code stays in `platform.rs`

`#[cfg(target_os = …)]` window behaviour (macOS panels, Spaces, display detection) lives in `app/src-tauri/src/platform.rs` behind functions that are no-ops or plain fallbacks elsewhere. Flag platform conditionals or native calls appearing in other modules.

## Plugins read through `PluginContext`

Overlay plugins get session state, the talk, commands and settings from their `PluginContext` (spec §6). Flag a plugin that imports app stores or invokes Tauri commands directly instead.

## User actions are logged, never their content

New user-facing actions in the manager call `logAction` (`app/src/lib/log.ts`), so hands-on testing can be checked against the debug log (ADR 0011). Flag an action that logs nothing, and a `detail` that carries talking points or hints. Names, a talk's audience and file paths are fine.

## Windows run only the app's own code

Every window loads under the Content Security Policy in `app/src-tauri/tauri.conf.json`: scripts from the app only, no `eval` or `new Function`, no inline scripts, and no network except IPC. Flag a change that loosens it, loads anything remote, or compiles code at run time (Ajv schemas are compiled at build time, in `vite.config.ts`). `make shots` fails on a violation.

## Comments don't cite designs

A comment says what the code does and why. Where a design or a decision came from belongs in the issue and the commit, which are linked to each other; a mockup's file name in a comment goes out of date as soon as the design is redone. Flag a comment that names a design file or repository path. Issue and ADR numbers are fine.

## Hard-to-reverse decisions get an ADR

Flag a change that makes a choice that is hard to reverse, surprising to a later reader, and the result of a real trade-off, without a new or updated ADR in `.adr/` (format: follow the existing ADRs).
