# Secrets scan of the whole history, October 2026

Run on 2026-10-24 with gitleaks 8.30.1. **Result: no leaks found.** It is the baseline for the pre-commit hook: from here on, any finding is new.

## What was scanned

| Scan | Covered | Result |
|---|---|---|
| `gitleaks git --log-opts="--all" --redact` | Every branch and tag fetched from origin: 542 commits (490 non-merge, 52 merges). The 487 commits that changed text were scanned, 4.7 MB in all | No findings |
| `git log --all --merges --cc -p \| gitleaks stdin --redact` | The 9 merge conflict resolutions, which the default scan skips | No findings |
| `strings` of the `.pyc` removed in `12215fc`, piped to `gitleaks stdin` | The one compiled file ever committed: the default scan skips binary files, but a `.pyc` holds its script's strings | No findings |

Not scanned, because there was nothing to scan: one empty commit (`7cf35f4 init`) and commits that changed only binary files (icons, scaffolding). The local `latest` tag was stale, since CI recreates it on each build, but its commit is on `main`, which was scanned.

`--redact` was on throughout, so no secret value would have been printed.

## Triage

No hits, so nothing to triage or rotate, and the allowlist in `.gitleaks.toml` starts empty.

## Running it again

```sh
gitleaks git --log-opts="--all" --redact      # the whole history; uses .gitleaks.toml
```

Install it with `brew install gitleaks`. A later change pins a version for the repo.
