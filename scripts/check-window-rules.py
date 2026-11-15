#!/usr/bin/env python3
"""Mechanical window rules for the Tauri core (run by `make check` and CI).

1. A #[tauri::command] that creates or changes windows must be `async`.
   Synchronous window commands deadlock on Windows (white, frozen window).
2. Overlay and platform code never calls set_focus: focusing an overlay
   activates the app and pulls focus from the presenting app.

Usage: scripts/check-window-rules.py [src-dir]   (default: app/src-tauri/src)
"""

import re
import sys
from pathlib import Path

WINDOW_API = re.compile(
    r"WebviewWindowBuilder|WebviewWindow\b|get_webview_window|webview_windows"
    r"|primary_monitor|set_content_protected|\.show\(\)|\.hide\(\)|\.close\(\)"
)
NO_FOCUS_FILES = {"overlay.rs", "platform.rs"}


def strip_comments(line: str) -> str:
    return line.split("//", 1)[0]


def command_violations(path: Path, lines: list[str]) -> list[str]:
    found = []
    for i, line in enumerate(lines):
        if "#[tauri::command]" not in line:
            continue
        # The signature is the first following line containing `fn `.
        j = next((k for k in range(i + 1, len(lines)) if re.search(r"\bfn\s", lines[k])), None)
        if j is None:
            continue
        signature = lines[j]
        # Body: from the signature until its braces balance.
        depth, body, started = 0, [], False
        for k in range(j, len(lines)):
            code = strip_comments(lines[k])
            body.append(code)
            depth += code.count("{") - code.count("}")
            started = started or "{" in code
            if started and depth == 0:
                break
        if "async fn" not in signature and WINDOW_API.search("\n".join(body)):
            name = re.search(r"fn\s+(\w+)", signature).group(1)
            found.append(f"{path}:{j + 1}: command `{name}` uses windows but is not async")
    return found


def focus_violations(path: Path, lines: list[str]) -> list[str]:
    if path.name not in NO_FOCUS_FILES:
        return []
    return [
        f"{path}:{n}: set_focus in overlay/platform code (overlays must not take focus)"
        for n, line in enumerate(lines, 1)
        if "set_focus" in strip_comments(line)
    ]


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else "app/src-tauri/src")
    problems = []
    for path in sorted(root.rglob("*.rs")):
        lines = path.read_text().splitlines()
        problems += command_violations(path, lines) + focus_violations(path, lines)
    for problem in problems:
        print(problem, file=sys.stderr)
    if problems:
        print(f"{len(problems)} window rule violation(s); see scripts/check-window-rules.py", file=sys.stderr)
        return 1
    print("window rules: ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
