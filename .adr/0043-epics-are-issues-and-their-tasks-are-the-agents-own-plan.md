---
status: accepted
date: 2026-11-10
---

# Epics are issues, and their tasks are the agent's own plan

ADR 0022 made every task a GitHub issue: a sub-issue of its epic, with blocked-by links and a place on the board. In practice an agent wrote the tasks just before doing them, in one sitting, and closed them in the same PR. The issues recorded a plan nobody else worked from, and cost a round of creating, linking and closing for every slice. John wants the epic to be the one thing that is filed, and the plan for it to be the agent's.

## Decision

- **An epic is still an issue** labelled `epic` and `epic-NNN`: the outcome, and a Validation list that John checks hands-on before he closes it. An agent never closes an epic or ticks its Validation list.
- **Tasks are not filed.** The agent working on an epic slices it into vertical pieces and keeps that plan in its session, or in a local file that isn't committed (`out/plans/`, which git ignores). No task issues, sub-issues or blocked-by links are created.
- **The PR carries the plan's outcome:** the slices it built, one commit each, and `Part of #EPIC`.
- **Bugs are still issues** (`bug`), and a PR that fixes one says `Closes #N`.
- **The board holds epics and bugs.**

## Considered options

- **Keep task issues (ADR 0022).** Progress shows on the epic, and a task can be handed to another agent by number. But nobody else picks tasks up, and the plan changes as the work goes, so the issues are out of date or rewritten as often as they are followed.
- **Commit the plan as a file beside the epic's work.** It keeps the plan in history, but the commits and the PR already say what was built, and a committed plan is one more thing to keep true.

## Consequences

- Task issues opened before this decision finish the old way: their PR says `Closes #TASK`.
- An epic's progress is no longer visible on the epic itself; its branch and PR show it.
- The `create-github-tasks` skill becomes `github-epics`, and the third-party `to-tickets` skill, whose job was filing tickets, is removed.
