#!/usr/bin/env python3
"""Summarise the newest Oversay crash report on macOS (run by `make crash`).

Prints the report's time, exception and termination reason, the
Objective-C exception backtrace if there is one, and the top of the
crashing thread. Full reports are thousands of lines; this is the part
that identifies the crash.
"""

import json
import sys
from pathlib import Path

REPORTS = Path.home() / "Library/Logs/DiagnosticReports"
FRAMES = 20


def main() -> int:
    reports = sorted(REPORTS.glob("oversay*.ips"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not reports:
        print(f"No oversay crash reports in {REPORTS}")
        return 0
    path = reports[0]
    # .ips files are a one-line JSON header followed by the JSON report.
    _, body = path.read_text().split("\n", 1)
    report = json.loads(body)

    print(f"Report:    {path}")
    print(f"Time:      {report.get('captureTime')}")
    print(f"Exception: {report.get('exception')}")
    print(f"Ended by:  {report.get('termination', {}).get('indicator')}")
    if len(reports) > 1:
        print(f"(+{len(reports) - 1} older oversay reports)")

    for backtrace in report.get("asiBacktraces", []):
        print("\nObjective-C exception backtrace:")
        print("\n".join(backtrace.splitlines()[:FRAMES]))

    thread = report["threads"][report["faultingThread"]]
    print(f"\nCrashed thread ({thread.get('name', 'unnamed')}):")
    for frame in thread["frames"][:FRAMES]:
        print("  " + frame.get("symbol", "?")[:150])
    return 0


if __name__ == "__main__":
    sys.exit(main())
