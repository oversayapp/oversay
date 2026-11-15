---
status: accepted
date: 2026-10-07
---

# Manager shell: a projects list, a sidebar for the open project, and the screen separate from the open project

The manager has an icon rail on the left. Its look follows a Zoom-style mockup John approved (the manager mockup). **Projects** is the list of projects, and it works whether or not one is open; it is lit only on that list, never on a project's page. Choosing a project opens it. Only then does the **sidebar** appear (ADR 0019), showing that project's overview and talks. It has no Save: Save, Save As, Earlier versions, All projects and Close project are in the project menu in the header. With no project open there is no sidebar.

Which screen is showing is its own state (`app/src/manager/nav.ts`), separate from which project is open. Going Home, to the projects list or to Settings leaves the project, and its unsaved edits, open. We tried two other designs first:
- Home meant "close the project". A quick look at the list then cost a save-or-discard decision.
- Projects meant "the open project" and was disabled when none was open. In hands-on testing John found it a dead button, and he expected Projects to be the list.

There is no router library: the navigation state and the open project together pick the screen.

## Consequences

- Only explicit exits count as leaving: Close project, opening or creating another project, and quitting. So they are the only places the unsaved-changes question appears (ADR 0008).
- Home and the Projects page show the same list of known projects (one shared component). Home adds the start-a-project card and shortcuts from the mockup.
- Rail items for areas that do not exist yet are shown disabled with "Soon" rather than hidden: Sessions.

*Changed by ADR 0039: projects are gone from the app (workspaces replace them), so this no longer applies to anything Oversay makes.*
