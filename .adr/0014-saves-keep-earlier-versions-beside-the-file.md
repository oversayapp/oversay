---
status: accepted
date: 2026-10-08
---

# Saves keep the last ten versions beside the project file

Before a save replaces a project file, the app copies the old file into a `Versions` folder next to it and keeps the newest ten. "Earlier versions…" lists them and restores one as unsaved changes. John asked for this so that a bad edit or a damaged file is never the end of a project.

The copies sit beside the file, not in the app's config folder, so they travel with the project (a synced folder, a backup, a copy to another machine) and can be found and opened by hand. This applies to every project file, including ones opened from outside `Documents/Oversay/Projects` (ADR 0013). A project kept in a git repository or a shared folder therefore gains a `Versions` folder there too; we accepted that rather than treat those projects differently.

Each copy's name records when that version was saved: `<name> <YYYY-MM-DD HH-MM-SS.mmm> UTC.oversay.json`. The time is read once, from the replaced file's modified time at the moment it is copied (when that version was last saved), and from then on the name is the only record of it: the copy's own modified time, which copying and syncing can change, is never used. UTC means a clock change can't reorder versions; milliseconds, and moving on a millisecond when a name is taken, mean a kept version is never overwritten.

## Consequences

- Versions belong to a file name: after Save As to a new place, that file starts with no earlier versions, and the old file's versions stay with it.
- A first save, and a save with nothing changed, keep nothing. Failing to keep a version is logged and never stops the save.
- Deleting a project takes its kept versions with it (ADR 0015).
- Ten copies of a small JSON file is little space; the number can change later without affecting existing folders.
- Restoring never writes: the restored version replaces what's open as unsaved changes, and the next save keeps the version it replaces, so a restore can itself be undone.

*Changed by ADR 0039: projects are gone from the app (workspaces replace them), so this no longer applies to anything Oversay makes.*
