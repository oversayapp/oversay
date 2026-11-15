---
status: accepted
date: 2026-10-09
---

# While presenting, late or early is measured against the plan, and times round up

While a talk runs, every window (the Timeline overlay, the manager's live view, the Control Panel) says how late or early it is running by comparing its projected length with the **plan's** length, not with the talk's target. Before, a talk whose plan was 30 seconds longer than its target showed "+0:30 late" before it had started, and running 10 seconds over showed "+0:41": John read the extra as lateness he hadn't caused. You plan your talk and talk your plan: a plan that doesn't fit its target is the editor's business (it shows the difference), and the finished summary still compares the talk with its target.

Every time shown is in whole seconds **rounded up**: 9.2 seconds over is 0:10, and a countdown shows 3:00 until a whole second has gone (John: "you can't round down between zero and one to 0"). How late or early the talk is comes from the projected length rounded up less the planned length, so the numbers on screen add up (a segment shown as 2:13 of 3:00 is 0:47 early, not 0:48). The talk is "on time" only when that difference is exactly zero.

Implemented in `src/lib/session/clock.ts` (`wholeSeconds`, `SessionClock.plannedLength`) and `src/lib/session/timeline.ts` (`talkStatus`), tested there.

## Consequences

- Nothing on screen measures the talk against its target while it runs; someone who wants that has to fix the plan to fit the target first.
- With no tolerance, a talk a second ahead of its plan says "−0:01 early". If that proves noisy, a tolerance belongs in `talkStatus`, for every window at once.
- A countdown never shows 0:00 while time is left, and an overrun shows at least +0:01.
