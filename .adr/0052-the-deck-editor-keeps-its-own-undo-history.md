---
status: accepted
date: 2026-11-25
---

# The deck editor keeps its own undo history

The editor saves as you type (ADR 0026) and had no undo of its own. A text field has the webview's undo, which covers typing in that field and nothing else: not a delete, a move or an added card. Tried in a bare WKWebView on a Mac (25 Nov): the webview's history is shared by every field on the page, so Cmd+Z can change a field that doesn't have focus; once the app sets a field's value, earlier steps change nothing visible; and with nothing to undo the menu sends the page nothing.

## Decision

- **One history for the open deck**, in the open-note store, which every change to `deck.md` already goes through. A step is the file's whole text before and after, with where the editor was.
- **It replaces the field's undo** where the editor saves as you type (card name, points, Markdown): the editor takes the keys and stops the webview's own. A field saved only when it is left or entered keeps its own undo while it holds typing not yet saved, as do fields outside the editor.
- **Text from outside drops it** (ADR 0034): a change read in, a conflict, or "Use theirs instead". Nothing is merged. Before an undo or a redo the file is read, so a change not yet noticed drops it too.
- **It lives with the open editor.** Leaving the deck's page, closing the deck or quitting drops it; showing the deck does not. Renaming the deck is not a step: every step takes the new title.

## Why

Whole-text snapshots keep every line the editor doesn't show, so an undone file is the file as it was, byte for byte, with no inverse to write and test for each kind of edit; a deck is a few kilobytes, so 100 steps cost little. Undoing each edit with its own inverse was the alternative: smaller, but every new control would need one, and a wrong one would damage the file quietly. Keeping the webview's undo for typing beside a history for deletes and moves would give two orders for one Cmd+Z.

Dropping the history on outside text was chosen over merging because an old snapshot written after an outside change has been read in overwrites it, with no copy and no message: the guard of ADR 0034 sees nothing to guard.

## Consequences

- After an outside change there is nothing to undo, even for edits it didn't touch.
- Getting back an earlier deck after the editor is closed would need versions kept on disk, which this doesn't do.
