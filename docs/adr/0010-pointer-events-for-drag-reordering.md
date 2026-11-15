---
status: accepted
date: 2026-10-07
---

# Drag reordering uses pointer events, not HTML5 drag and drop

Segment reordering is built on pointer events: pointer capture on a grip handle, with the drop position worked out from the rows' midpoints. Alt+↑ / Alt+↓ does the same from the keyboard. HTML5 drag and drop would have been less code. We avoided it because Tauri's default window drag-drop handling on Windows (`dragDropEnabled`) intercepts HTML5 drops inside the webview, so it would break on John's Windows machine.

## Consequences

- Do not "simplify" to `draggable` and `ondrop` without first turning off Tauri's drag-drop handling for the window, which would also turn off dropping files onto the app.
- Not yet confirmed on Windows hands-on.
