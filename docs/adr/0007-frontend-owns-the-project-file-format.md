---
status: accepted
date: 2026-10-07
---

# The frontend owns the project file format; Rust only moves text

Parsing, validation (JSON Schema via `ajv`), migration, key order and preserving unknown fields all live in TypeScript (`app/src/lib/project/`). The Rust commands only read and write file text, writing through a temporary file and a rename so a failed save never leaves half a project. We chose this because the editor already holds the project in TypeScript, so the format is defined and tested once, in one place. The alternative was serde types in Rust, which would have meant keeping the model in two languages in step.

## Consequences

- If Rust ever needs to understand a project (for example to write a finished session to the file from the Rust side in epic 006), either it goes through the frontend or the format gets a second definition. A second definition must follow the shared-wire-name rule in `CODING_STANDARDS.md`: one source of truth, or tests on both sides with the same cases.
- Where projects are stored may change (see the storage note in the private `oversayapp/design` roadmap, undecided). That would affect the file commands, not this split.
