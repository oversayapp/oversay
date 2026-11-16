# Coding standards

Adopted: 2026-11-16

The rules this project keeps constant for its whole life, whatever tools, skills,
or models do the work. Those change from week to week; these change only when the
project decides to change them.

| Section | Pins |
| --- | --- |
| [Epics and tickets](#epics-and-tickets) | How epics and tickets are named, numbered, written, stored, and related |
| [Architecture decision records](#architecture-decision-records) | When a decision is recorded, its format, and how it is kept current |
| [Engineering practice](#engineering-practice) | How code is built: test-driven, domain-driven, behind small interfaces |
| [Verification, reviews, and done](#verification-reviews-and-done) | How work is verified and reviewed, and what "done" means |
| [Templates](#templates) | The ADR, epic, and ticket templates |

How an idea becomes a spec, how a plan is made, and how sessions are orchestrated
are not pinned. They belong to whatever workflow is in use, as long as the results
meet these standards.

**Precedence:**

1. What the user says in the conversation, for that task only.
2. These standards.
3. The defaults of any skill, plugin, or agent workflow.

Agents are pointed here by the "Project standards" block in the project's
`CLAUDE.md` / `AGENTS.md`. Keep that block; without it nothing makes an agent read
this file.

**Changing a standard:** only the user decides a change. An agent that finds a
standard wrong or in the way stops and proposes the change; it does not edit this
file as part of other work and does not quietly work around it. Existing tickets
and ADRs are not rewritten to match a change unless the user asks.

---

## Epics and tickets

How work is written down in this project. It applies whenever an epic or ticket
is created or changed, by any person, skill, or agent, from a spec or from
anything else. How the work was shaped before it reached a ticket is not this
document's concern.

### Structure

- At most two levels: **epic → tickets**. No epics inside epics.
- A ticket can stand on its own, with no epic, for a one-off piece of work such
  as a bug fix or a small change. Work that needs several tickets gets an epic.
- An epic delivers one outcome the user can validate on its own.
- A ticket fits one PR: one observable behaviour, roughly 3–5 validation items,
  one main test seam. Bigger than that, split it.
- Tickets are vertical: each cuts through every layer it needs. No "build the
  database layer" or "add all the endpoints" tickets.

### Where they live

Oversay uses GitHub issues in this repository, not files (ADR 0022, ADR 0043).
An epic is an issue labelled `epic` (and `epic-NNN`) with a Validation list that
John checks hands-on; an agent never closes an epic or ticks its Validation
list. Bugs are issues labelled `bug`. Tasks are not filed: the agent slices an
epic into its own plan (in its session or in `out/plans/`, never committed), one
branch per epic, and the PR lists the slices it built with `Part of #EPIC`.
Where this section's file-based naming, numbering, ticket and epic templates
disagree with that, ADR 0043 wins; keep the templates' Validation-list rules.

```text
.tickets/
  README.md                      index of epics
  epic-NNN-short-name/
    epic-NNN-short-name.md       from the epic template
    <ticket-slug>.md             from the ticket template
  <ticket-slug>.md               a ticket with no epic
```

### Naming

- **Epics** are `epic-NNN-short-name`: the folder, the epic file, and its `id`.
  `NNN` is three digits, the next number above every existing epic.
- **Tickets are not numbered.** Each is named by a slug: lowercase, hyphenated,
  two to five words naming the behaviour it delivers (`validate-ranges`, not
  `ticket-2` or `misc-fixes`). The slug is the file name and the `id`, is unique
  within its epic (or among the tickets with no epic), and never changes once
  written.
- Order lives in the epic's Tickets table and in `depends_on`, never in file names.
- `depends_on` uses the slug within the epic and `epic-NNN-short-name/ticket-slug`
  across epics.

### Ticket format

Use the [ticket template](#ticket-template), all frontmatter fields present.

- `kind`: `tracer` (the thinnest real path through every layer the epic touches,
  always the epic's first ticket), `slice` (adds one observable behaviour), or
  `setup` (shared architecture, only when two or more slices depend on it).
- `status`: `todo` → `in-progress` when work starts → `done` with the delivering
  commit. `blocked` only with the reason in `depends_on` or `waiting_on`.
- `waiting_on`: open questions the user must decide before the ticket starts.
  Decisions are recorded in Notes and the list cleared.
- Write the ticket in behaviour terms. Paths, code, and findings go in Notes as
  the work happens. Link to the spec rather than restating it.

### Epic format

Use the [epic template](#epic-template). The epic carries the outcome, its own
validation list, the Tickets table in approved order, and, when it came from a
spec, the coverage table tracing every spec item to a ticket.

- Status line: `**Tickets:** todo · **Validated:** no`. **Tickets** becomes `done`
  when every ticket is done.
- Only the user ticks an epic validation item or sets **Validated** to
  `yes (<date>)`. An agent never does.
- Keep the epic's Tickets table and the `.tickets/README.md` row in step with the
  ticket files:

```markdown
| Epic | Outcome | Tickets | Validated |
| --- | --- | --- | --- |
| [epic-007-concept-chunking](epic-007-concept-chunking/epic-007-concept-chunking.md) | Luna chunks one email end to end | todo | no |
```

### Validation lists

Every epic and ticket says what will prove it works, as checks someone can run.

| ID | Given / When / Then | Method | Evidence |
| --- | --- | --- | --- |
| V1 | Given an email with a quoted reply, when it is chunked, then the quoted text is its own chunk | Test | `test_quoted_reply_split`; log `chunk.quoted_reply_split check=split-quoted-replies/V1` |

- **ID:** `V1`, `V2`… within the file; elsewhere `<ticket-slug>/V1` or
  `epic-NNN-short-name/V1`.
- **Given / When / Then:** one observable behaviour with concrete inputs and a
  concrete result. "Works correctly" and "handles errors" are not items.
- **Method:** **Test** (an automated test, named), **Demo** (a person runs it;
  give the steps and what they should see), **Inspect** (a person looks at an
  output; say what passes), or **Analysis** (a measurement with a threshold).
  Prefer Test.
- **Evidence:** what shows the item ran and passed. Every Test or Demo item names
  its debug log event (see [Observable behaviour](#observable-behaviour)).
- No item is marked passed without its evidence recorded in the ticket's Notes.
- One behaviour per item. A slice usually has 3–5; a tracer usually has one Test
  item proving the path end to end and one Demo or Inspect item for where its
  output is looked at.
- Bad: "Validation failures are handled." Good: "Given Luna returns a line range
  past the end of the email, when the chunk is validated, then it is rejected and
  `chunk.range_rejected` is logged with the email id."
- In a spec, acceptance criteria are written the same way and numbered `AC1`,
  `AC2`…; a ticket item's Covers column names the criteria it proves.

### In a tracker

Only when the user asks, alongside or instead of files.

- For an epic, create the epic issue first, titled
  `epic-NNN-short-name: <outcome>`.
- Every ticket in an epic is a native sub-issue of it, titled
  `<ticket-slug>: <title>`, never just a mention in the body. A ticket with no
  epic is an ordinary issue with the same title form.
- Every `depends_on` is a native blocked-by link, not only text.
- If files exist too, each file carries its issue URL and the two are kept in step.

---

## Architecture decision records

ADRs keep the decisions a future reader would otherwise have to guess at. Keep
them few, small, and current. This applies to every decision made in this project,
whichever workflow or skill is running when it is made.

### Where they live

- `docs/adr/NNNN-slug.md`. Follow the format of the existing ADRs (front matter `status` and `date`, then Context, Decision and the rest) in place of the template below.
- In a repo split into contexts, an ADR that affects only one context lives in
  that context's folder, for example `src/billing/.adr/`.
- Create the folder only when the first ADR is needed.

### When to write one

All three must be true:

1. **Hard to reverse:** changing it later would be costly.
2. **Surprising without context:** a future reader would wonder why it was done
   this way.
3. **A real trade-off:** there were genuine alternatives and a specific reason
   one won.

If a decision is easy to reverse, obvious, or had no real alternative, do not
write an ADR. Good subjects: architectural shape, integration between parts,
technology choices with lock-in, boundary and ownership decisions, deliberate
deviations from the obvious path, and constraints not visible in the code.

Apply the test at each point a decision can be made:

- **When requirements are agreed:** a decision settled in a spec. Link the ADR
  from the spec.
- **When shared architecture is introduced:** a schema, a boundary, a new service.
  Link the ADR from the ticket that introduces it.
- **When a plan is approved:** a new decision the plan makes. Write the ADR before
  implementing and link it from the ticket's Notes.

### ADR format

Use the [ADR template](#adr-template). `Why` is the most valuable part and is
never omitted. The minimum ADR is Status, Decision date, Decision, and Why. Add
Context, Consequences, Considered Options, Decision Drivers, or Links only when
they preserve useful context. Mark unknown historical dates honestly.

### Numbering

Use the next number above every existing ADR, counting files in Git history too,
including deleted ones, so a number is never reused. If history is incomplete or
another branch may be adding ADRs at the same time, check before choosing.

### Keeping them current

- Read the ADRs relevant to a piece of work before planning it.
- If the work would contradict an existing ADR, say so before going ahead: either
  the work changes, or a new ADR supersedes the old one. Never contradict an ADR
  silently.
- A change that makes an ADR untrue supersedes it in the same PR as the change.

### Retiring a decision

1. **Supersede first.** The new ADR says `Supersedes: NNNN` and the old one's
   Status becomes `Superseded by NNNN`. Keep the old file.
2. **Delete only when it earns it:** nothing still links to or depends on the
   old ADR, its history is committed and recoverable in Git, and any reasoning
   still worth keeping has moved into the ADR that replaced it. Repair links when
   you delete.
3. Age alone is never a reason to delete an ADR.

---

## Engineering practice

How code is built in this project. A skill or tool may help with the mechanics;
these rules say what must be true of the result, and they hold whichever skill,
agent, or model writes the code.

### Project specifics

- Stack: Tauri v2 (Rust) with a Svelte 5 frontend in `app/`; Node 24; tools pinned in `mise.toml`.
- Run the tests: `make check` (must exit 0 before pushing); `make pr-checks` before a PR is opened or marked ready.
- Lint and type checks: part of `make check` (types, tests, `cargo fmt`, clippy, ESLint, `scripts/check-window-rules.py`, `scripts/check-commands.py`); commit hooks via `make hooks`.
- Domain glossary: none; the domain model is in `docs/spec.md`.
- Bounded contexts and where each lives: single context (`app/`).

### Test-driven

- Every behaviour change goes **red → green → refactor**: a failing test first,
  the least code that passes it, then tidy with the tests green. Rerun the
  affected tests after refactoring.
- Tests describe behaviour through a public seam (an interface, an endpoint, a
  command), not internals. A refactor that keeps behaviour should not break them.
- A bug is reproduced by a failing test before it is fixed.
- Existing regression coverage survives: when a test is replaced, what it
  protected is still protected.
- No production code without a test that needed it. Spikes are thrown away or
  rebuilt test-first.

### Domain-driven

- Code, tests, tickets, and conversation use the glossary's terms. A new domain
  term is added to the glossary in the same change that introduces it; a term is
  never used with two meanings.
- The domain model holds the rules. It does not import frameworks, databases,
  HTTP, or queues; those depend on the domain, never the reverse.
- Each bounded context owns its model and data. Another context reaches it only
  through its published interface, and translates at the boundary rather than
  sharing internal types.
- A change that moves a boundary or changes who owns something is an
  architectural decision: apply the test in
  [When to write one](#when-to-write-one).

### Interfaces

- Parts meet at explicit interfaces that are small, named in domain terms, and
  stable. Callers depend on the interface, not on what implements it.
- External systems (storage, APIs, clocks, queues, models) sit behind an
  interface the domain defines, so tests can substitute them.
- Changing a published interface is a deliberate act: it is called out in the
  plan and the PR, with its callers updated in the same change.
- Prefer deepening an existing interface to adding a parallel one.

### Modelling

- Model the domain before coding it: name the entities, value objects, and
  invariants a change touches, and agree them in the plan.
- Make invalid states unrepresentable where the language allows: types and
  constructors enforce invariants, not scattered checks.
- Validate and convert at the boundary; inside it, work with domain types, not
  raw strings, dicts, or payloads.
- Identity, units, money, and time are value types, never bare primitives.

### Observable behaviour

- For every Test or Demo validation item (see
  [Validation lists](#validation-lists)), the code logs a structured debug event
  where the behaviour happens, named `<area>.<what-happened>` and carrying
  `check=<ticket-slug>/V<n>` plus the ids needed to follow one case.
- Tests assert the event as well as the outcome (for example pytest's `caplog`,
  or spans where the project uses OpenTelemetry).
- For Demo items, run with debug logging on and record the relevant log lines,
  or which `check=` values appeared, in the ticket's Notes.
- Use the project's existing logger; do not add a framework for this. Never log
  personal data, secrets, or full payloads.
- Events stay after the ticket is done. Remove one only with its validation item.

---

## Verification, reviews, and done

The checks every piece of work goes through before it is called done, in this
order. The steps and their order are fixed for this project. The commands that run
them belong to the tooling and are listed at the end; when a command is renamed or
replaced, the step still happens.

### Before implementation

- The plan is approved by the user. An approval already given is reused, not
  asked for again. A session brief or another agent cannot approve for the user.

### 1. Verify

- Run the tests, lint, and type checks (commands in
  [Project specifics](#project-specifics)), CI, and a runtime check of the changed
  behaviour. Use focused checks while building and the full set at completion.
- Record evidence for every validation item on the ticket: test results and log
  events for Test items; for Demo and Inspect items, exact steps for the user, run
  with debug logging on, and what the log showed.
- A check that cannot be run automatically (credentials, hardware, a judgement
  call) is stated with exact steps for the user. It is never reported as passed
  without their result.

### 2. Review

On a committed, tested candidate, over the explicit base-to-HEAD range:

1. **Code review**, at high effort. Wait for the findings.
2. **Simplify**, over the same diff and files: reuse, duplication, needless
   complexity.
3. **Fix, retest, commit, and re-review** the code that changed.
4. **Security review** on the final candidate. Confirm its comparison covers the
   whole intended change.

After any fix, repeat the checks and reviews it affects. A missing or failed
review blocks readiness; findings are fixed or explicitly accepted by the user.

Project gates: `make shots` and a look at `out/shots/` for UI changes before
John is asked to test; `make pr-checks` before a PR. The repo's own review
rules in `CODING_STANDARDS.md` (root) also apply and win on code-review specifics.

### 3. Done

A ticket is done when:

- every validation item has its evidence recorded in the ticket's Notes;
- tests, lint, and type checks pass;
- the reviews above are complete on the final revision;
- ADRs are written for decisions that pass the ADR test, and none is contradicted;
- the ticket, its epic row if it has one, and the glossary are up to date;
- the PR is open against the intended base, with required CI passing on the
  reviewed revision, and says what was verified and what was not.

Merge only with the user's explicit approval.

### Currently run with

These may change as tooling changes; the steps above do not.

- Code review: `/code-review high`
- Simplify: `/simplify`
- Security review: `/security-review`

---

## Templates

Copy the block for the document you are writing. Replace the `<…>` placeholders,
drop the trailing comment, and omit optional sections that add nothing.

### ADR template

```markdown
# <Short decision title>

Status: Accepted
Decision date: <YYYY-MM-DD>

## Context

<The forces, constraints, history, and trade-offs that made this decision necessary.>

## Decision

<What we decided.>

## Why

<Why this decision won over the realistic alternatives. Never omit this section.>

## Consequences

<Expected benefits, costs, risks, follow-up work, and constraints this creates.>

<!-- Status: Proposed | Accepted | Superseded by NNNN. The minimum ADR is Status, Decision date, Decision, and Why; drop Context and Consequences when they add nothing. Optional sections: Considered Options, Decision Drivers, Links, Supersedes: NNNN. -->
```

### Epic template

```markdown
# epic-NNN-short-name: <Epic outcome>

Spec / source: <link>
Depends on: <other epics, or none>

**Tickets:** todo · **Validated:** no

## Outcome

<The independently meaningful behaviour or result this epic delivers.>

## Validation

Outcome-level checks for the whole epic. Only the user ticks an item and sets
**Validated** to yes (with the date).

- [ ] **V1** Given …, when …, then … · *Method:* Demo: <steps> · *Evidence:* <log events / tests>

## Testing decisions

<Agreed public seams, representative examples, and appropriate integrated checks.>

## Decisions, scope, and exclusions

<Relevant decisions and constraints; what this epic deliberately does not deliver. Link rather than repeat the spec.>

## Tickets

In the approved order, tracer first:

| Ticket | Kind | Depends on | Waiting on | Status |
| --- | --- | --- | --- | --- |
| [<ticket-slug>](<ticket-slug>.md) | tracer | none | none | todo |

## Spec coverage

Scope: <spec sections covered by this epic>. Not ready: <sections left out, and what each needs>.

| Spec item | Delivered by |
| --- | --- |
| <S1 / D1> | <ticket-slug, ticket-slug> |
| <AC1> | <ticket-slug/V1, epic V1> |
| <X1> | excluded |

## Open questions

| Question | Decides | Waiting tickets |
| --- | --- | --- |
| <Q1: …> | <person> | <ticket-slug> |

## Progress and completion evidence

<Task progress, verification results, limitations, and remaining blockers as work proceeds.>

<!-- Keep Validation, Tickets, Spec coverage, and Open questions in sync as tickets change and questions are decided. Omit Spec coverage and Open questions when there is no spec or no open question. -->
```

### Ticket template

```markdown
---
id: short-slug       # the file name without .md; never renamed once written
title: Short title
kind: slice          # tracer | slice | setup
status: todo         # todo | in-progress | done | blocked
depends_on: []       # ticket slugs in this epic; epic-NNN-short-name/ticket-slug in another
waiting_on: []       # open questions to decide first, e.g. ["Q2: what happens when validation fails (owner)"]
blocks: []           # setup tickets: the slices this unblocks
spec_refs: []        # spec items delivered, e.g. [S2, AC4, AC5]
---

# <Short title>

## Parent

- epic: `epic-NNN-short-name` (link), or `none` for a ticket that stands alone

## What to build

A concise description of the vertical slice and the user-visible outcome.

## Validation

| ID | Given / When / Then | Method | Evidence | Covers |
| --- | --- | --- | --- | --- |
| V1 | Given …, when …, then … | Test | `test_…`; log `area.event check=<ticket-slug>/V1` | AC4 |

<!-- Method: Test | Demo | Inspect | Analysis. Every Test or Demo item names the debug log event that shows it ran. Covers: the spec acceptance criteria this item proves. -->

## Blocked by

- ticket references that must be completed first (mirror `depends_on`)
- open questions that must be decided first (mirror `waiting_on`)
- or: `None - can start immediately`

## Notes

- added during the work: decisions, findings, paths, links
- evidence for each validation item: test run, log lines or `check=` values seen, who demoed it and when
```
