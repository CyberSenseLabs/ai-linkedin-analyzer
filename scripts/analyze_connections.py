#!/usr/bin/env python3
"""Connection analysis for a LinkedIn data export.

Reads Connections.csv from an unzipped LinkedIn export and prints a summary:
total connections, growth by year, top companies, and a role-category breakdown.

Usage:
    python scripts/analyze_connections.py /path/to/linkedin_export
"""
import csv
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path

ROLE_MAP = [
    ("Executive (C-suite / founder)", ["ceo", "cto", "ciso", "cfo", "coo", "chief",
                                       "founder", "owner", "managing director", "president"]),
    ("Director / head", ["director", "head of", "vp", "vice president", "partner"]),
    ("Security & cyber", ["security", "cyber", "grc", "soc", "threat"]),
    ("Risk / compliance / audit", ["risk", "compliance", "audit", "assurance", "governance"]),
    ("Architecture", ["architect"]),
    ("Engineering & dev", ["engineer", "developer", "devops", "sre"]),
    ("Consulting", ["consultant", "advisor", "consulting"]),
    ("Management", ["manager", "lead", "program", "project"]),
    ("Sales / BD / account", ["sales", "business development", "account", "partnership"]),
    ("Analyst", ["analyst"]),
    ("Recruitment", ["recruit", "talent"]),
]


def categorize(position: str) -> str:
    p = position.lower()
    for label, keywords in ROLE_MAP:
        if any(kw in p for kw in keywords):
            return label
    return "Other"


def load_rows(export_dir: Path):
    path = export_dir / "Connections.csv"
    with path.open(encoding="utf-8-sig") as f:
        lines = f.readlines()
    # LinkedIn prepends a few "Notes:" lines before the real CSV header.
    header_idx = next(i for i, line in enumerate(lines) if line.startswith("First Name"))
    return list(csv.DictReader(lines[header_idx:]))


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    rows = load_rows(Path(sys.argv[1]))

    companies, years, roles = Counter(), Counter(), Counter()
    for r in rows:
        if company := (r.get("Company") or "").strip():
            companies[company] += 1
        roles[categorize((r.get("Position") or "").strip())] += 1
        if connected := (r.get("Connected On") or "").strip():
            try:
                years[datetime.strptime(connected, "%d %b %Y").year] += 1
            except ValueError:
                pass

    print(f"Total connections: {len(rows)}\n")

    print("Connections by year:")
    for year, n in sorted(years.items()):
        print(f"  {year}: {n}")

    print("\nTop 20 companies:")
    for company, n in companies.most_common(20):
        print(f"  {n:4d}  {company}")

    print("\nRole distribution:")
    for role, n in roles.most_common():
        print(f"  {n:4d}  {role}")


if __name__ == "__main__":
    main()
