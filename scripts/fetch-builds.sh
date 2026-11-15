#!/usr/bin/env bash
# Download Oversay builds from GitHub Actions into out/.
#
#   scripts/fetch-builds.sh            latest successful build of main
#   scripts/fetch-builds.sh <run-id>   a specific run
#   scripts/fetch-builds.sh --trigger  start a new build on main, wait, then download it
set -euo pipefail

WORKFLOW=build.yml
BRANCH=main
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/out"

case "${1:-}" in
  --trigger)
    git -C "$ROOT" fetch -q origin "$BRANCH"
    if [ -n "$(git -C "$ROOT" log --oneline "origin/$BRANCH..HEAD")" ]; then
      echo "Warning: you have unpushed commits; CI builds origin/$BRANCH without them." >&2
    fi
    started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    gh workflow run "$WORKFLOW" --ref "$BRANCH"
    echo "Waiting for the run to start..."
    run_id=""
    while [ -z "$run_id" ]; do
      sleep 5
      run_id="$(gh run list --workflow "$WORKFLOW" --branch "$BRANCH" --event workflow_dispatch \
        --created ">=$started" --limit 1 --json databaseId --jq '.[0].databaseId // empty')"
    done
    gh run watch "$run_id" --exit-status --interval 30
    ;;
  "")
    run_id="$(gh run list --workflow "$WORKFLOW" --branch "$BRANCH" --status success \
      --limit 1 --json databaseId --jq '.[0].databaseId // empty')"
    [ -n "$run_id" ] || { echo "No successful $WORKFLOW run on $BRANCH" >&2; exit 1; }
    ;;
  *)
    run_id="$1"
    ;;
esac

sha="$(gh run view "$run_id" --json headSha --jq '.headSha[0:7]')"
echo "Downloading run $run_id (commit $sha)..."

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
gh run download "$run_id" -D "$tmp"

rm -rf "$OUT"
mkdir -p "$OUT"
find "$tmp" \( -name '*.dmg' -o -name '*.msi' -o -name '*-setup.exe' \) -exec mv {} "$OUT/" \;
if [ -d "$tmp/oversay-windows-portable" ]; then
  (cd "$tmp/oversay-windows-portable" && zip -qj "$OUT/oversay-windows-portable.zip" ./*)
fi

echo "$run_id $sha" > "$OUT/BUILD"
echo "Builds from commit $sha in out/:"
ls -1 "$OUT"
