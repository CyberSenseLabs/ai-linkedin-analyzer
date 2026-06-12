#!/usr/bin/env python3
"""Flag potentially suspicious LinkedIn connections from a data export.

LinkedIn's export does NOT include connection counts, profile photos, mutual
connections, or account age, so this works only from the fields available:
name, profile URL, email, company, position, and connect date. It is a
heuristic triage aid, not proof — review flagged profiles manually.

Usage:
    python scripts/flag_suspicious.py /path/to/linkedin_export [--min-score N]
"""
import argparse
import csv
import re
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

# Scam / spam / solicitation keywords commonly seen on fake or bot profiles.
SCAM_TERMS = [
    "crypto", "bitcoin", "forex", "binary option", "binary options", "trader",
    "trading coach", "investment opportunity", "guaranteed return", "1000x",
    "double your", "passive income", "work from home", "earn from home",
    "make money", "financial freedom", "loan", "sugar daddy", "sugar baby",
    "escort", "onlyofans", "onlyfans", "adult content", "hookup", "dating",
    "telegram", "whatsapp me", "dm me", "dm for", "click the link", "click link",
    "herbalife", "forever living", "arbonne", "mlm", "ponzi", "giveaway",
    "free money", "btc", "usdt", "investor relations manager seeking",
]
NAME_SCAM_HINTS = SCAM_TERMS + ["http", "www.", ".com", "@", "official", "vip"]
CONTACT_IN_TITLE = re.compile(r"(https?://|www\.|t\.me/|@[\w.]+|\+?\d[\d ()-]{8,})", re.I)
EMOJI = re.compile("[\U0001F000-\U0001FAFF\U00002600-\U000027BF\U0001F1E6-\U0001F1FF]")
NON_NAME = re.compile(r"[0-9$£€!?*#~^=<>{}\[\]|\\/]")


def load_rows(export_dir: Path):
    with (export_dir / "Connections.csv").open(encoding="utf-8-sig") as f:
        lines = f.readlines()
    header_idx = next(i for i, line in enumerate(lines) if line.startswith("First Name"))
    return list(csv.DictReader(lines[header_idx:]))


def score(row, dup_urls, dup_names):
    first = (row.get("First Name") or "").strip()
    last = (row.get("Last Name") or "").strip()
    name = f"{first} {last}".strip()
    company = (row.get("Company") or "").strip()
    position = (row.get("Position") or "").strip()
    url = (row.get("URL") or "").strip()
    name_lc, pos_lc = name.lower(), position.lower()

    pts, reasons = 0, []

    if not company and not position:
        pts += 3
        reasons.append("no company or job title")
    elif not position:
        pts += 1
        reasons.append("no job title")

    for term in SCAM_TERMS:
        if term in pos_lc:
            pts += 3
            reasons.append(f"scam/spam term in title: '{term}'")
            break
    for hint in NAME_SCAM_HINTS:
        if hint in name_lc:
            pts += 3
            reasons.append(f"promotional text in name: '{hint}'")
            break

    if position and CONTACT_IN_TITLE.search(position):
        pts += 2
        reasons.append("contact info / link in job title")

    if not first or not last:
        pts += 2
        reasons.append("missing first or last name")
    if NON_NAME.search(name):
        pts += 2
        reasons.append("digits/symbols in name")
    if EMOJI.search(name):
        pts += 1
        reasons.append("emoji in name")
    if name and len(name.replace(" ", "")) <= 2:
        pts += 2
        reasons.append("implausibly short name")
    if name == name.upper() and len(name) > 4:
        pts += 1
        reasons.append("name in ALL CAPS")

    if url and dup_urls[url] > 1:
        pts += 2
        reasons.append("duplicate profile URL")
    if name and not company and not position and dup_names[name_lc] > 1:
        pts += 2
        reasons.append("duplicate empty profile")
    if not url:
        pts += 1
        reasons.append("no profile URL")

    return pts, reasons, name


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("export_dir", type=Path)
    ap.add_argument("--min-score", type=int, default=3)
    args = ap.parse_args()

    rows = load_rows(args.export_dir)
    dup_urls = Counter((r.get("URL") or "").strip() for r in rows if (r.get("URL") or "").strip())
    dup_names = Counter(
        f"{(r.get('First Name') or '').strip()} {(r.get('Last Name') or '').strip()}".strip().lower()
        for r in rows
    )

    flagged = []
    for r in rows:
        pts, reasons, name = score(r, dup_urls, dup_names)
        if pts >= args.min_score:
            flagged.append((pts, name, (r.get("Position") or "").strip(),
                            (r.get("Company") or "").strip(), (r.get("URL") or "").strip(),
                            (r.get("Connected On") or "").strip(), reasons))

    flagged.sort(key=lambda x: -x[0])
    print(f"Scanned {len(rows)} connections — {len(flagged)} flagged "
          f"(score >= {args.min_score}).\n")
    for pts, name, pos, company, url, conn, reasons in flagged:
        print(f"[{pts}] {name or '(blank)'} — {pos or 'no title'}"
              f"{' @ ' + company if company else ''}")
        print(f"      {url or 'no url'}  ({conn or 'no date'})")
        print(f"      flags: {'; '.join(reasons)}\n")


if __name__ == "__main__":
    main()
