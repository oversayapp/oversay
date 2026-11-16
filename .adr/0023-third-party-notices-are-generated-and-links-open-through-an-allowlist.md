---
status: accepted
date: 2026-10-13
---

# Third-party notices are generated from the dependency trees, and About's links open through an allowlist

About lists the components Oversay ships with and their licences (013/03). The decision, the alternatives and what follows.

## Decision

- **The list is generated, never written by hand.** `scripts/third-party.mjs` reads `cargo metadata` (the macOS and Windows targets, normal dependencies only) and `package-lock.json` (packages not marked `dev`), and writes `app/src/generated/third-party.json`, which is not committed. npm runs it before `dev`, `build`, `test` and `check`, so the list always matches the lockfiles and nothing can be stale in a build.
- **A component that declares no licence is flagged and listed first**, not dropped.
- **Links open in the browser through `tauri-plugin-opener`**, and `capabilities/default.json` allows only `https://crates.io/*` and `https://www.npmjs.com/*`. A test checks that the links About builds stay inside that list.

## Consequences

- `npm test`, `check`, `build` and `dev` need `cargo` (CI has it; locally it comes from mise) and, the first time, network access to fetch the Windows-target crates the licence list needs.
- The list says what each package declares. It does not carry the licence texts, and a declared SPDX expression is not a legal review.
- Linux is not in the list until a Linux build exists (epic 015 (#16) notes it as later). Adding a target is one line in the script.
- The hosts are written twice (the capability file and the URL builders in `lib/about/notices.ts`); the test is what keeps them in step. A new link target needs both.
