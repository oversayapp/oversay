---
status: accepted
date: 2026-10-08
---

# Deleting a project moves it to the system Trash

The trash can on a recent project deletes the project, after asking. It moves files to the system Trash rather than removing them, so a mistake can be undone from there. John asked for a real delete after the earlier trash can, which only took a project off the list, left a "deleted" demo on disk.

What goes to the Trash:

- **The project's folder**, when it sits directly in `Documents/Oversay/Projects` (ADR 0013) and holds no other project file. That takes the project's earlier versions (ADR 0014) and anything else kept in its workspace with it.
- **Otherwise the project file and its kept versions** only: a project outside the Projects folder, one saved straight into it, or one whose folder another project shares (for example after Save As into it). Another project's files are never taken.

Only an existing project file can be deleted this way, and not the project that is open.

On a Mac the app asks the system file manager to move items to the Trash, not Finder. Finder refuses items in an iCloud-synced Documents folder that aren't fully downloaded (error -8013). The cost is that Finder's "Put Back" isn't offered; a deleted project can still be dragged out of the Trash.

## Consequences

- A project that is missing (moved or deleted outside the app) can only be taken off the list (×); there is nothing left to delete.
- If a later version moves workspaces or adds files beside projects, the "no other project file" rule decides whether a folder goes; anything that should survive a delete must not live in a project's own folder.

*Changed by ADR 0039: projects are gone from the app (workspaces replace them), so this no longer applies to anything Oversay makes.*
