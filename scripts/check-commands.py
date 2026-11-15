#!/usr/bin/env python3
"""Every Tauri command the frontend invokes must be registered in the Rust core.

Command names are written twice: `invoke('name', …)` in TypeScript and
`generate_handler![module::name, …]` in `lib.rs`. A rename on one side still
compiles and only fails at runtime ("command not found"). This check fails
`make check` instead. Plugin commands (`plugin:…`) belong to Tauri plugins and
are skipped.

It also checks the permission side (build.rs, capabilities/*.json): build.rs lists every
registered command, the manager's capability allows all of them, and the other windows'
capabilities allow only registered ones, so a new command can't be left callable by no window
(a runtime failure) or by every window.

Usage: scripts/check-commands.py [app-dir]   (default: app)
"""

import json
import re
import sys
from pathlib import Path

# `[^(\n]*` rather than `<[^>]*>` so a type argument with `>` in it, such as invoke<Versioned<T> | null>(…),
# is still seen.
INVOKE = re.compile(r"""\binvoke[^(\n]*\(\s*['"]([a-z0-9_]+)['"]""")
HANDLER = re.compile(r"generate_handler!\[(.*?)\]", re.S)


def registered(lib_rs: Path) -> set[str]:
    match = HANDLER.search(lib_rs.read_text())
    if not match:
        sys.exit(f"{lib_rs}: no generate_handler![…] found")
    return {item.strip().split("::")[-1] for item in match.group(1).split(",") if item.strip()}


def invoked(src: Path) -> dict[str, list[str]]:
    found: dict[str, list[str]] = {}
    for path in sorted(src.rglob("*")):
        if path.suffix not in {".ts", ".svelte"} or path.name.endswith(".test.ts"):
            continue
        for number, line in enumerate(path.read_text().splitlines(), 1):
            for name in INVOKE.findall(line):
                found.setdefault(name, []).append(f"{path}:{number}")
    return found


def manifest(build_rs: Path) -> set[str]:
    match = re.search(r"COMMANDS:\s*&\[&str\]\s*=\s*&\[(.*?)\];", build_rs.read_text(), re.S)
    if not match:
        sys.exit(f"{build_rs}: no COMMANDS list found")
    return set(re.findall(r'"([a-z0-9_]+)"', match.group(1)))


def allowed(capability: Path) -> set[str]:
    perms = json.loads(capability.read_text())["permissions"]
    return {p[len("allow-"):].replace("-", "_") for p in perms if isinstance(p, str) and p.startswith("allow-")}


def main() -> None:
    app = Path(sys.argv[1] if len(sys.argv) > 1 else "app")
    known = registered(app / "src-tauri" / "src" / "lib.rs")
    missing = {name: where for name, where in invoked(app / "src").items() if name not in known}
    for name, where in sorted(missing.items()):
        for place in where:
            print(f"{place}: invokes '{name}', which is not in generate_handler![…] in lib.rs")
    if missing:
        sys.exit(1)
    tauri = app / "src-tauri"
    listed = manifest(tauri / "build.rs")
    problems = []
    for name in sorted(known - listed):
        problems.append(f"build.rs: COMMANDS lacks '{name}', so no window could call it")
    for name in sorted(listed - known):
        problems.append(f"build.rs: COMMANDS lists '{name}', which is not in generate_handler![…]")
    manager = allowed(tauri / "capabilities" / "default.json")
    for name in sorted(known - manager):
        problems.append(f"capabilities/default.json: the manager can't call '{name}'")
    for other in ("overlays.json", "control-panel.json"):
        for name in sorted(allowed(tauri / "capabilities" / other) - known):
            problems.append(f"capabilities/{other}: allows '{name}', which is not a registered command")
    for line in problems:
        print(line)
    if problems:
        sys.exit(1)
    print(f"commands: ok ({len(known)} registered)")


if __name__ == "__main__":
    main()
