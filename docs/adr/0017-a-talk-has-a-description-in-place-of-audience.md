---
status: accepted
date: 2026-10-10
---

# A talk has a description in place of its audience

A talk in the project file now has an optional `description`, one sentence or a short paragraph saying who it's for and what it's about. It replaces `audience`, which held only who the talk was for. John found that what he typed there was really a description (epic 011). Projects already have a description, and a talk's sits under its name in the editor and in the project's talk list.

The file format belongs to the frontend (ADR 0007), so the change is made there, without a new file version:

- **Reading:** `talkDescription` shows `description`, or an older file's `audience` when there is no description. Old files open as they always did.
- **Editing:** the box opens with whatever is shown, the old audience included. `setDescription` writes `description` and drops `audience`, so the text moves across rather than being lost, and a file never has both.
- **Saving:** `serialize.ts` writes `description`, and `audience` only while an older talk still has it; `audience` stays in the schema so older files still validate. The spec's example file keeps an older talk with `audience`, which the tests read.

Implemented in `src/lib/project/segments.ts` (`talkDescription`, `setDescription`), `types.ts`, `schema.ts` and `serialize.ts`, tested there.

## Consequences

- Once a talk's description is edited and saved, an older Oversay shows that talk with no audience. Nothing else is lost.
- A talk opened but not edited keeps its `audience` as it was.
- `audience` can be dropped from the schema in a later file version, once old files no longer matter.
