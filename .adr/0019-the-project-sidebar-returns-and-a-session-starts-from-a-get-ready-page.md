---
status: accepted
date: 2026-10-11
---

# The project sidebar returns, and a session starts from a Get ready page

Hands-on use of epic 011 showed three problems: it was hard to tell which project was open, the rest of the project could not be seen from the editor, and a session took four clicks to start. John compared three designs in the workflow concepts mockup and chose design A, with a Get ready page.

## Decision

- **The sidebar returns** for an open project (252 px; a drawer on narrow windows). The project's name heads it, then Overview and the project's talks, each with ▶ and each expandable to its segments. Segments are copied into the talk being edited by a button or by dragging.
- **No Save in the sidebar.** Save, Save As, Earlier versions, All projects and Close project stay in the project menu in the header, as ADR 0009 now says. The sidebar also has no New talk or From template: adding a talk stays on the project overview.
- **Looking at another talk** opens it in the main pane with a back arrow to the talk being edited, and each segment there can be copied into that talk.
- **Projects in the rail** is lit only on the list of projects, never on a project's page. The window title carries the project name. Home gets a Continue card for the last talk run, with ▶.
- **▶ opens a Get ready page** in the manager (sidebar still there): the overlays, hide from screen sharing, later recording, and one button, **Ready to start**. That button hides the manager and opens every overlay together in a ready state. The talk is started from an overlay, the Control Panel or the menu-bar icon, never from the manager, because by then the screen may be shared. A new project creates its first talk and opens it in the editor.

## Consequences

- There is no start dialog: the Get ready page is where a session starts. Every overlay opens, the Rust core brings the manager back at the end, and the manager shows a compact page if it is brought back mid-session (ADR 0018).
- Clicks from Home to overlays up: the same talk as last time 2 (was 4), another talk with the project closed 3, with the project open 2, a new talk in a new project 3.
- The Ready state moves out of the manager: the manager is hidden while the overlays wait for the first Next.
- Built in epic 012. Two things differ from the mockup: the Get ready page lists what opens rather than offering a switch per overlay (the choice stays removed, as ADR 0018 decided), and the Timeline's Ready state has a labelled Start button. Ready to start does not open the Control Panel (ADR 0020, ADR 0028).
- Home's Continue card is the talk last **started**, remembered in `settings.json` (`lastRun`).
- The rail's Projects no longer goes back to the open project: Home's Open now card and the sidebar do.

*Changed by ADR 0039: projects are gone from the app (workspaces replace them), so this no longer applies to anything Oversay makes.*
