#!/usr/bin/env python3
"""Flag potentially suspicious LinkedIn connections from a data export.

LinkedIn's export does NOT include connection counts, profile photos, mutual
connections, or account age, so this works only from the fields available:
name, profile URL, email, company, position, and connect date. It is a
heuristic triage aid, not proof — review flagged profiles manually. See
scoring.py for the rules and README.md for the algorithm.

Usage:
    python scripts/flag_suspicious.py /path/to/linkedin_export [--min-score N]
"""
import argparse
import csv
from collections import Counter
from pathlib import Path

from scoring import heuristic_score, is_redacted


def load_rows(export_dir: Path):
    with (export_dir / "Connections.csv").open(encoding="utf-8-sig") as f:
        lines = f.readlines()
    header_idx = next(i for i, line in enumerate(lines) if line.startswith("First Name"))
    return list(csv.DictReader(lines[header_idx:]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("export_dir", type=Path)
    ap.add_argument("--min-score", type=int, default=3)
    ap.add_argument("--include-redacted", action="store_true",
                    help="include privacy-redacted rows (off by default — they are not fakes)")
    args = ap.parse_args()

    rows = load_rows(args.export_dir)
    dup_urls = Counter((r.get("URL") or "").strip() for r in rows if (r.get("URL") or "").strip())
    dup_names = Counter(
        f"{(r.get('First Name') or '').strip()} {(r.get('Last Name') or '').strip()}".strip().lower()
        for r in rows
    )

    flagged, redacted = [], 0
    for r in rows:
        if is_redacted(r):
            redacted += 1
            if not args.include_redacted:
                continue
        pts, reasons = heuristic_score(r, dup_urls, dup_names)
        if pts >= args.min_score:
            name = f"{(r.get('First Name') or '').strip()} {(r.get('Last Name') or '').strip()}".strip()
            flagged.append((pts, name, (r.get("Position") or "").strip(),
                            (r.get("Company") or "").strip(), (r.get("URL") or "").strip(),
                            (r.get("Connected On") or "").strip(), reasons))

    flagged.sort(key=lambda x: -x[0])
    print(f"Scanned {len(rows)} connections — {len(flagged)} flagged "
          f"(score >= {args.min_score}); {redacted} privacy-redacted (not fakes).\n")
    for pts, name, pos, company, url, conn, reasons in flagged:
        print(f"[{pts}] {name or '(blank)'} — {pos or 'no title'}"
              f"{' @ ' + company if company else ''}")
        print(f"      {url or 'no url'}  ({conn or 'no date'})")
        print(f"      flags: {'; '.join(reasons)}\n")


if __name__ == "__main__":
    main()
