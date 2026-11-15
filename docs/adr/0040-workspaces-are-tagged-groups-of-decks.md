---
status: accepted
date: 2026-10-26
---

# Workspaces are tagged groups of decks, and collections go

ADR 0038 gave Oversay two levels: a workspace (Projects, Conferences) held collections, and a collection listed decks. Seen as designs (the workspaces mockup), the two levels were more than the job needed. John: "Maybe I'm overthinking things maybe it's best to get rid of collections and just go at workspaces but we can tag them so the workspace can be tagged as the group you'd like it part of research, tutorials, and then we can just have the workspaces which are just groups of decks" (26 Oct).

## Decision

- **A workspace is a group of decks**: what a collection was. One for a project, a day of a course, a talk someone is preparing. It has a name, tags, its decks in order, and when, where, notes and files.
- **One level.** There are no collections, and a workspace never holds another workspace.
- **Tags group workspaces**: any words (`research`, `tutorials`, `projects`), as many as the person likes. The Workspaces page lists every workspace under each of its tags, Untagged last, and filters to one tag. A workspace with two tags shows under both.
- **Decks live once, in `Decks/`**, and a workspace lists them by id, so a deck can be in several workspaces or none (as ADR 0038 had it for collections). Removing a deck from a workspace leaves it in Decks; moving a deck to the Trash takes it out of every workspace; a deck that has gone shows as gone.
- **On disk**, each workspace is a folder in `Documents/Oversay/Workspaces/` holding `workspace.json` and `resources/`:

  ```json
  { "version": 1, "id": "w_4hx8m2qa", "name": "Prompt injection in AI agents",
    "tags": ["research", "talks"], "decks": ["d_k3x9a2bq", "d_7mq2xw4f"],
    "when": "2026-12-02", "where": "AppSec Dublin", "notes": "30 minutes plus questions" }
  ```

  The `w_` id is made as a deck's is (`ids.ts`, `ids.rs`) and written by Oversay, never the skill; a copied folder gets a new one. The folder is named for the workspace, with ` (2)` when taken.
- **Starting fresh.** Nothing is public yet, so the two-level folders built under ADR 0038 are not converted: a folder in `Workspaces/` without `workspace.json` is not a workspace, and Oversay leaves it alone. There is no first workspace made on start.
- **No workspace "in use".** With every workspace on one page there is nothing to switch, so the switcher goes; search finds workspaces by name and tag.

## Considered options

- **Keep two levels** (ADR 0038). A workspace's name says what its collections are for, but it is one more thing to make and name before a deck has a home, and a tag does the same grouping without the nesting.
- **One group per workspace** (a folder-like category). Simpler to show, but a talk that is both research and a conference can't be in both.
- **Convert the collections already made** into tagged workspaces. Kind, but there are none to keep before Oversay is public.

## Consequences

- ADR 0038 (workspaces hold collections) and ADR 0039's "the workspace in use, its collections and each collection's page" are changed by this one, and say so.
- A deck's `project:` line, moved once on start, now goes into a workspace of that name tagged `projects`.
- The skill writes `workspace.json` (references/workspace-format.md), and `Oversay --check workspace.json` checks it.
