---
status: accepted
date: 2026-10-06
---

# Overlays are built-in plugins that only see a PluginContext

Each overlay (Timeline, Talking Points) is a built-in plugin in its own window, labelled `overlay-<plugin id>`. A plugin gets everything it needs from the `PluginContext` it is given (the talk, a clock, the session and its commands, and its settings; spec §6, `app/src/plugins/`), and never imports app stores or calls Tauri directly. Third-party plugins are out of scope. The boundary keeps each overlay replaceable and testable on its own, and stops overlays from depending on manager internals.

## Consequences

- Reviews flag a plugin that bypasses `PluginContext` (`CODING_STANDARDS.md`).
- Plugin ids follow one rule on both sides (`is_valid_plugin_id` in Rust, `isValidPluginId` in TypeScript), tested with the same cases.

*Backfilled 2026-10-07 from ticket 002/03, spec §6 and `CODING_STANDARDS.md`.*
