---
status: accepted
date: 2026-10-26
---

# Workspaces replace projects

ADR 0038 kept projects as they were, beside workspaces, until a later epic turned them into collections and their talks into decks. Built that way, Oversay had two ways to group what a person presents: Projects on the rail, and a Collections tab inside Decks. John meant workspaces to take the place of projects, not to add another place: "The old projects can be deleted we can start fresh just delete the projects and we'll start as workspaces" (John, 26 Oct). Oversay isn't public yet, so nobody has projects to keep.

## Decision

- **Workspaces take the rail's place of Projects.** The rail is Home, Decks, Workspaces, Templates, AI and Settings. Workspaces shows the workspace in use (its name is the menu that switches workspace, or picks All workspaces), its collections, and each collection's page.
- **Decks is every deck**, as it was before ADR 0038 was built: no Collections tab. It still filters by collection.
- **The project app goes**, with nothing converted: the Projects page, project files and their versions, the talk editor, Get ready, a talk's live session, the demo project, recent projects, Home's project cards, and `oversay://talks/…` opening a talk. Decks, the flashcard widget, its timeline widget and their sessions are untouched.
- **Templates stays**, as a page to browse and edit, without Create talk; it is to be reworked to start decks later.
- **Files already in `Documents/Oversay/Projects` are left alone.** Oversay stops reading them; a person who wants them gone deletes the folder.

## Considered options

- **Convert projects to collections and talks to decks now** (ADR 0038's later epic). Keeps everyone's work, but there is no one's work to keep before Oversay is public, and the talk format has segments, hints and open-ended estimates that decks would have to take on first.
- **Hide the project pages and leave their code** for a later removal. Less to change now, but dead code that still builds, tests and ships.
- **Move `Documents/Oversay/Projects` to the Trash on first start.** Tidy, but Oversay would be deleting files it no longer owns; leaving them is safer.

## Consequences

- ADR 0038's "today's projects become collections in the Projects workspace in a later epic; until then projects stay as they are" is replaced by this. The Projects workspace stays as the first workspace a start makes.
- ADR 0008 (explicit save with a leave guard), 0009 (the manager keeps the project open), 0013 (new projects get a folder), 0014 (versions beside the file), 0015 (deleting a project), 0019 (the project sidebar and Get ready) and 0027 (quick talks as project files) no longer apply to anything the app makes; each says so.
- Templates have nothing to create until they start decks; until then the page says so.

*Changed by ADR 0040: Workspaces lists every workspace by tag, with no workspace "in use", and a workspace is a group of decks (no collections).*
