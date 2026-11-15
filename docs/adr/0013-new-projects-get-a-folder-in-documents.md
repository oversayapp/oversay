---
status: accepted
date: 2026-10-08
---

# New projects get their own folder in Documents/Oversay/Projects

Creating a project no longer asks where to save it. The app makes `Documents/Oversay/Projects/<name>/` and saves `<name>.oversay.json` inside it. The folder is the project's workspace: later, documents and other files for its talks can sit beside the project file. John chose this so projects are easy to find and keep tidy, without a save dialog in the way of starting one.

The project file format is unchanged (spec §3). Projects are not confined to the folder: Open file… opens a project from anywhere (a synced folder, a git repository, files saved before this), and Save As… can still put a copy elsewhere.

Considered and set aside for now: splitting a project into a file per talk (a new format and a migration, for no present need), and moving templates and settings into Documents/Oversay too (they stay in the app's config folder; templates can follow later if people want to see or share them).

## Consequences

- A folder is named once, when the project is created, from its name with characters a folder can't hold removed. Renaming the project later does not rename the folder, so anything kept or linked there doesn't break.
- Two projects with the same name get separate folders ("Spring keynote", "Spring keynote 2"); nothing is overwritten.
- Documents may be synced (iCloud Drive, OneDrive). That's accepted: a project file is small, and saves are explicit (ADR 0008).
- On Windows the Documents folder can be redirected; the app asks the system where it is rather than assuming a path.

*Changed by ADR 0038 once projects move in: today's projects become collections in the Projects workspace, `Documents/Oversay/Workspaces/Projects/`, and their talks become decks, in a later epic. Until then new projects are made here as before.*

*Changed by ADR 0039: projects are gone from the app (workspaces replace them), so this no longer applies to anything Oversay makes.*
