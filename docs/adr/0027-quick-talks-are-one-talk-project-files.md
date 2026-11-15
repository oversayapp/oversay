---
status: accepted
date: 2026-10-19
---

# Quick talks are one-talk project files

A quick talk is a talk without a project: a stand-up, a demo, an update, with an agenda, points and times, run like any talk. It may later join a project, and a talk may leave one. Projects become collections of talks with a description and resources.

## Decision

- **A quick talk is a project file holding that one talk**, with a top-level `"kind": "quickTalk"`, in `Documents/Oversay/Quick talks/`, one file per talk named after it. It is not Markdown like a note: a talk has sessions, segment kinds and times that the project format already carries.
- **No schemaVersion change.** `kind` is an additive field: the loader already keeps unknown fields, and an older Oversay, which refuses only newer schema versions, opens a quick talk as a one-talk project.
- **It opens as the current project.** Editing, Save (ADR 0008), Versions (ADR 0014, kept in `Quick talks/Versions/`), Get ready (ADR 0019) and recording a session all go through the same code as a project's talk. The screens around it differ: no project sidebar or overview, a "Quick talks ›" crumb, Close quick talk. Its name is its talk's: renaming the talk renames it.
- **Quick talks are not on the recent projects list.** Opening one is remembered for Quick talks' Recent instead (settings.json `opened`, lib/settings/quick.ts).
- **Deleting one moves its file to the Trash.** Its kept versions stay in `Versions/`.
- **A project stays one file holding its talks** (ADR 0013). Moving a talk into or out of a project moves the talk object, with its sessions, between files; a folder of talk files per project is not needed for that and would be a migration.

## Consequences

- A quick talk and a project can't be open at the same time, as two projects can't: opening a quick talk asks about the open project's unsaved changes first.
- The file's name is set when the quick talk is made; renaming the talk later doesn't rename the file. The Talks page shows the talk's name.
- Anything that treats "the open project" as a project (its overview, its talk list, Copy to another talk) checks `isQuickTalk` first.

*Changed by ADR 0036: decks of flashcards replace quick talks, which are converted into decks.*

*Changed by ADR 0039: projects are gone from the app (workspaces replace them), so this no longer applies to anything Oversay makes.*
