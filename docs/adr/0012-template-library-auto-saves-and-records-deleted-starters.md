---
status: accepted
date: 2026-10-08
---

# The template library saves itself and records deleted starters by id

Your templates and categories live in `templates.json` in the app's config folder, not in a project. Every change (saving a talk as a template, renaming, recolouring, deleting) is written straight away; there is no Save button and no leave guard. That differs from projects (ADR 0008) on purpose: library changes are small, single actions the person confirms as they make them (deletes already ask), and there is no "document" to close and decide about.

The starter categories and templates ship in the app and are never copied into the file. Deleting a starter only adds its id to `removedStarterCategories` or `removedStarterTemplates`. Restore in Settings empties those lists, so it brings every starter back and never touches anything of yours: restoring is additive.

## Consequences

- App updates can improve or add starters without migrating anyone's file. A starter that is renamed must keep its id, or a deletion of it would stop applying.
- There is no undo for library changes beyond restoring starters; deleting your own template or category is final, which is why the delete warnings say what goes with it.
- The file carries a `version`. Version 1 (templates only, from 005/03) still loads, with My templates as the default category. Loading is tolerant: malformed templates are skipped, unknown colours become slate, and templates whose category is gone move to My templates.
