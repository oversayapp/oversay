---
status: accepted
date: 2026-10-07
---

# Explicit Save with an unmissable leave guard, not autosave

Edits stay in memory until the person saves (button, `⌘S` / `Ctrl+S`). Leaving the project with unsaved changes always asks "Save / Don't save / Cancel". That covers Close project, opening or creating another project, the window close button and quitting. Hands-on testing showed that people will forget to save, so we considered autosave. John chose explicit Save because autosave would leave no way to throw edits away, and then made leaving unsaved impossible to miss instead.

## Consequences

- "Unsaved" means "differs from what was last saved or read", not "was edited", so undoing an edit makes the project clean again.
- The Rust side holds an "unsaved" flag that the frontend keeps up to date. While it is set, the manager window's close request and a user-initiated quit (`RunEvent::ExitRequested` with no exit code) are cancelled, and the frontend is asked instead. If the frontend has died while changes are unsaved, the close button will not close the app and Force Quit is the way out. We accepted that risk.
- **Recording a session is the one write the person doesn't press Save for** (2026-10-09, 006/06): a finished session is added to the project as last saved and written straight away, so a run is never lost. Other unsaved edits are not written; they stay unsaved for the person to save or not. If the talk isn't in the saved file yet, or the write fails, the session waits in the open project as an unsaved change and the manager says so.
- Moving between Home, the project and its talks never asks: the project stays open (see ADR 0009).

*Changed by ADR 0039: projects are gone from the app (workspaces replace them), so this no longer applies to anything Oversay makes.*
