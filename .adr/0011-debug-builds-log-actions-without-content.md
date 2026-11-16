---
status: accepted
date: 2026-10-07
---

# Debug builds log what the person does, never what they wrote

In debug builds the manager logs each user action and each project edit to the terminal (`out/dev.log`) and the app log folder: screens visited, open, save, prompts answered, and edits as short id-keyed diffs. This lets hands-on testing be checked against what was actually clicked rather than memory. Talking points and hints are never logged, only that a list changed and its length, because they are the presenter's private content. Release builds do not register the log plugin, so nothing is logged there.

## Consequences

- New user-facing actions should call `logAction` (`app/src/lib/log.ts`), and `detail` must not carry project content.
- Names (project, talk, segment), a talk's audience and file paths do appear in debug logs. John confirmed on 2026-10-07 that audience is not private.
