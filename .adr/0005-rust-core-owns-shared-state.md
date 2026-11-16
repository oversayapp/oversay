---
status: accepted
date: 2026-10-06
---

# The Rust core owns shared state; windows are views

State that several windows need (the session, the screen-capture setting) lives in the Rust core and is broadcast to every window through named, versioned channels (`state.rs`, `channel.ts`). A window that opens later asks for the current value, and versions let it ignore a reply older than an event it has already seen. The session engine will run there too, owning the clock, the event log and the global hotkeys (spec §5, "Where state lives"). The alternative was letting the manager window own the session and talk to overlays directly. It was rejected because closing or reloading a window must never stop or disturb a session, and global hotkeys have to work while another app has focus.

## Consequences

- The project being edited is the exception: it lives in the manager window's TypeScript (ADR 0007), because only the manager edits it.
- Overlays and the manager never call each other directly; they go through channels and commands.

*Backfilled 2026-10-07 from ticket 002/04 and spec §5.*
