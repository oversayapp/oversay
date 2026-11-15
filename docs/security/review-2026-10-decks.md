# Security review: decks, October 2026

Reviewed on 2026-10-24, on the decks epic as merged to main by its pull request: `git diff fc7291a^1 fc7291a` (head `4efb804`). I read the code only: no app code was changed. The whole-app review (`review-2026-10.md`) was written before this code reached main, so it does not cover it.

**Scope:** the new Tauri commands for deck sessions (`quick.rs`, `session.rs`), the widget windows (`overlay.rs`), `--check` for decks (`check.rs`, `note_lint.rs`), the skill install (`skill.rs`), `oversay://decks` links (ADR 0032), the move of quick notes and quick talks into Decks (`app/src/lib/decks/migrate.ts`), and how deck text written by other apps is shown (the deck editor, the Decks list, the app-wide search, the flashcard and timeline widgets).

**Threat model:** deck Markdown in `Documents/Oversay/Decks` can be written by other apps and AI agents, so it is untrusted. `oversay://` links can be opened by any app or web page. Deck names become file names.

**Method:** the `security-review` skill's method: find issues, then filter out false positives. Only high-confidence findings (8 or more out of 10) that this change set adds would be reported.

## Summary

**No High or Medium findings.** Nothing needs fixing.

## Checked and sound

- **File paths from deck names** (`app/src-tauri/src/quick.rs`):
  - `read_deck_sessions` and `write_deck_sessions` first run the path through the existing `checked()`. It only accepts a `.md` file directly inside `Documents/Oversay/Decks`, and refuses names that start with a dot.
  - `sessions_file()` builds the sessions path from that checked file's stem, so it always lands at `Decks/.sessions/<stem>.json`; the frontend cannot choose it.
  - `move_sessions` (rename and trash) runs only after `rename_in()` or `checked()`. The new name is cleaned by `folder_name()`, which strips `/ \ : * ? " < > |`, control characters and dots at either end.
  - Hidden files, including `.sessions`, are never listed as decks.
- **Other new commands:** `session_advance` only moves a running, unpaused deck on from the card showing; `session_preview_deck` only changes a preview and clamps the card index; `fit_overlay` refuses any window that isn't an overlay and any non-finite height, and keeps the height within the screen. `overlay_closed` compares the window label with a constant. None reads or writes files or uses the network.
- **Dropped files** (`import_note`): they now go into Decks, with the same copy-by-name logic as before, a 1 MB limit, and create-new so nothing is overwritten.
- **`oversay://decks/<name>/show`** (`app/src/lib/links.ts`, `app/src/manager/links.ts`):
  - The name is refused if it contains `/`, `\` or control characters, or is `.`, `..` or empty. The only action is `show`.
  - The deck is found by matching the name against the listed Decks folder, never by building a path.
  - `show` still respects the session block and the Ask / Allow / Never setting. A deck opens Ready, so a link never starts a clock.
  - Old note and talk links open or show the deck of that name; a talk's `ready` link becomes a deck `show`, which still asks first.
- **Deck text written by other apps:** card names, points and hints go through Svelte's escaping `{text}`. There is no new `{@html}`, `innerHTML`, `href` or URL opening in `app/src/lib/decks/`, the `Deck*.svelte` files, `DecksPage.svelte`, `GlobalSearch.svelte`, `app/src/lib/search/everything.ts`, or the flashcard and deck-timeline plugins. The only `{@html}` in `app/src` is the existing one in `Icon.svelte`, for fixed icons. `style:` bindings that use a card's kind (`var(--k-${kind})`) set one CSS property and cannot inject HTML or script.
- **Migration** (`migrate.ts`): it uses the same checked commands (`createQuickFile('decks', name)` through `folder_name`, then `trashQuickFile`) and writes a sessions file only for the path `create_quick_file` returned.
- **`--check`** (`check.rs`): it treats a file as a deck only when its parent folder is `Decks`, and only lints its text. It adds no file access.
- **`skill.rs`:** the local JSON the skill install writes names the Decks folder in place of the notes and talks folders.
- **Permissions:** no changes to Tauri capabilities or `tauri.conf.json`.

## Noted, not counted as vulnerabilities

- **Symlinks in `Decks` or `Decks/.sessions` are followed.** Planting one needs local write access to the person's Documents folder, which an attacker could already use directly. Quick notes behaved the same way before; see finding 4 in `review-2026-10.md`.
- **Renaming a deck onto a name that has old session history replaces that history file.** Old runs are lost, but no one gains access to anything: a data-integrity quirk, not a security issue.
