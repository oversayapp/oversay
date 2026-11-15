#!/usr/bin/env bash
# Runs each prompt fixture (skills/fixtures/prompts/<case>/prompt.md) through Claude Code with the
# Oversay skill, in a scratch folder per case so no real notes are touched, then checks what it
# made with the fixture assertions (app/src/lib/notes/skill-fixtures.test.ts). A model run: it
# costs money and its wording varies, so it is manual (`make skill-try`), not part of make check.
#
# Usage: scripts/skill-try.sh [case ...]   (default: every case)
# Env:   SKILL_TRY_OUT (default: a new temporary folder), SKILL_TRY_SAVE=1 to copy each result
#        over its case's golden/ (review the diff before committing it).
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
prompts="$root/skills/fixtures/prompts"
out="${SKILL_TRY_OUT:-$(mktemp -d)}"
checker="$root/app/src-tauri/target/debug/oversay"

command -v claude >/dev/null || { echo "skill-try: needs Claude Code (claude) on the PATH" >&2; exit 2; }
# Built every time: an older build checks with older rules (cargo only rebuilds what changed).
(cd "$root/app/src-tauri" && cargo build -q)

cases=("$@")
[ ${#cases[@]} -gt 0 ] || cases=($(ls "$prompts"))

# The real Oversay folders, which a run must never touch: a copy of the skill installed for
# Claude Code (~/.claude/skills/oversay) points at them, so user skills are left out of each run
# (--setting-sources project), and the folders are compared before and after as well.
real="$HOME/Documents/Oversay"
snapshot() { [ -d "$real" ] && find "$real/Decks" "$real/Workspaces" -type f -exec stat -f '%m %N' {} + 2>/dev/null | sort || true; }
before_real="$(snapshot)"

for name in "${cases[@]}"; do
  case_dir="$prompts/$name"
  work="$out/work-$name"
  result="$out/$name"
  mkdir -p "$work/.claude/skills" "$result/Decks" "$result/Workspaces"
  cp -R "$root/skills/oversay" "$work/.claude/skills/"
  [ -d "$case_dir/before" ] && cp -R "$case_dir/before/." "$result/"
  printf '{ "decks": "%s", "workspaces": "%s", "oversay": "%s" }\n' \
    "$result/Decks" "$result/Workspaces" "$checker" > "$work/.claude/skills/oversay/oversay-local.json"
  echo "skill-try: $name"
  (cd "$work" && claude -p "$(cat "$case_dir/prompt.md")" --setting-sources project \
    --allowedTools "Read" "Write" "Edit" "Glob" "Grep" "Bash(ls *)" "Bash($checker --check *)" \
    --add-dir "$result" >"$out/$name.log" 2>&1) || echo "skill-try: $name: claude exited with an error (see $out/$name.log)"
  # Empty folders made for the run don't count as files it made.
  rmdir "$result/Decks" "$result/Workspaces" 2>/dev/null || true
  if [ "${SKILL_TRY_SAVE:-}" = 1 ]; then
    rm -rf "$case_dir/golden" && cp -R "$result" "$case_dir/golden"
    # A case that must ask first keeps what the AI said, for its assertions.
    if grep -q '"asks"' "$case_dir/case.json"; then cp "$out/$name.log" "$case_dir/reply.md"; fi
  fi
done

if [ "$(snapshot)" != "$before_real" ]; then
  echo "skill-try: a run changed $real/Decks or Workspaces; see the logs in $out" >&2
  exit 1
fi
echo "skill-try: results in $out"
cd "$root/app" && SKILL_OUTPUT="$out" npx vitest run src/lib/notes/skill-fixtures.test.ts
