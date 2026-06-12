#!/usr/bin/env python3
"""Build the standalone interactive network dashboard from a LinkedIn export.

Extracts the people you're connected with at the top-N companies (name, title,
LinkedIn URL, year, role category) and writes a self-contained dashboard/index.html
with the data embedded. No server or build step needed — open the file in a browser.

Usage:
    python scripts/build_dashboard.py /path/to/linkedin_export
"""
import csv
import json
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

from scoring import heuristic_score, enrichment_score, is_redacted

REPO_ROOT = Path(__file__).resolve().parent.parent
SCAN_MIN_SCORE = 3
TOP_N = 25
TITLE_MAX = 70

# Map normalised company name -> industry sector (for node colouring).
SECTORS = {
    "Banking & finance": "#378ADD",
    "Telco & infrastructure": "#1D9E75",
    "Security & consulting": "#7F77DD",
    "Cloud & tech": "#D85A30",
    "Utilities": "#BA7517",
    "Education": "#D4537E",
}

ROLE_MAP = [
    ("Exec", ["ceo", "cto", "ciso", "cfo", "coo", "chief", "founder", "owner",
              "managing director", "president"]),
    ("Director/Head", ["director", "head of", "vp", "vice president", "partner"]),
    ("Security", ["security", "cyber", "grc", "soc", "threat"]),
    ("Risk/Compliance", ["risk", "compliance", "audit", "assurance", "governance"]),
    ("Architecture", ["architect"]),
    ("Engineering", ["engineer", "developer", "devops", "sre"]),
    ("Consulting", ["consultant", "advisor", "consulting"]),
    ("Management", ["manager", "lead", "program", "project"]),
    ("Sales/BD", ["sales", "business development", "account", "partnership"]),
    ("Analyst", ["analyst"]),
    ("Recruitment", ["recruit", "talent"]),
]


def categorize(position: str) -> str:
    p = position.lower()
    for label, keywords in ROLE_MAP:
        if any(kw in p for kw in keywords):
            return label
    return "Other"


def normalise_company(name: str) -> str:
    n = (name or "").strip()
    low = n.lower()
    if "infotrust" in low:
        return "Infotrust"
    if n == "Amazon Web Services (AWS)":
        return "AWS"
    if "logicalis" in low:
        return "Logicalis AP"
    if "university of melbourne" in low:
        return "Uni of Melbourne"
    return n


def load_rows(export_dir: Path):
    path = export_dir / "Connections.csv"
    with path.open(encoding="utf-8-sig") as f:
        lines = f.readlines()
    header_idx = next(i for i, line in enumerate(lines) if line.startswith("First Name"))
    return list(csv.DictReader(lines[header_idx:]))


def scan_suspicious(rows):
    """Heuristic suspicion scan across ALL connections, optionally merged with
    enrichment scores from data/enrichment.json. Returns (flagged_list, summary)."""
    dup_urls = Counter((r.get("URL") or "").strip() for r in rows if (r.get("URL") or "").strip())
    dup_names = Counter(
        f"{(r.get('First Name') or '').strip()} {(r.get('Last Name') or '').strip()}".strip().lower()
        for r in rows
    )

    # Optional enrichment overlay, keyed by profile slug.
    enrich = {}
    enrich_path = REPO_ROOT / "data" / "enrichment.json"
    if enrich_path.exists():
        for p in json.loads(enrich_path.read_text()):
            slug = (p.get("publicIdentifier") or "").lower()
            if slug:
                pts, _name, reasons, trust, conns, has_photo = enrichment_score(p)
                enrich[slug] = {"score": pts, "reasons": reasons, "trust": trust,
                                "connections": conns, "photo": has_photo}

    flagged, redacted = [], 0
    for r in rows:
        if is_redacted(r):
            redacted += 1
            continue
        pts, reasons = heuristic_score(r, dup_urls, dup_names)
        url = (r.get("URL") or "").strip()
        slug = url.rstrip("/").split("/")[-1].lower() if url else ""
        enriched = enrich.get(slug)
        if pts < SCAN_MIN_SCORE and not (enriched and enriched["score"] >= 4):
            continue
        name = f"{(r.get('First Name') or '').strip()} {(r.get('Last Name') or '').strip()}".strip()
        flagged.append({
            "n": name, "u": url, "co": (r.get("Company") or "").strip(),
            "t": (r.get("Position") or "").strip(), "d": (r.get("Connected On") or "").strip(),
            "sc": pts, "rs": reasons,
            "esc": enriched["score"] if enriched else None,
            "ers": enriched["reasons"] if enriched else None,
            "trust": enriched["trust"] if enriched else None,
        })

    flagged.sort(key=lambda f: -(f["esc"] if f["esc"] is not None else 0) * 100 - f["sc"])
    summary = {"total": len(rows), "flagged": len(flagged), "redacted": redacted,
               "enriched": len(enrich), "min_score": SCAN_MIN_SCORE}
    return flagged, summary


def build(export_dir: Path):
    rows = load_rows(export_dir)

    counts = Counter(normalise_company(r.get("Company", "")) for r in rows if r.get("Company"))
    top = [name for name, _ in counts.most_common(TOP_N) if name]

    people = defaultdict(list)
    for r in rows:
        company = normalise_company(r.get("Company", ""))
        if company not in top:
            continue
        position = (r.get("Position") or "").strip()[:TITLE_MAX]
        connected = (r.get("Connected On") or "").strip()
        year = ""
        try:
            year = str(datetime.strptime(connected, "%d %b %Y").year)
        except ValueError:
            pass
        people[company].append({
            "n": f"{(r.get('First Name') or '').strip()} {(r.get('Last Name') or '').strip()}".strip(),
            "t": position,
            "y": year,
            "u": (r.get("URL") or "").strip(),
            "c": categorize(position),
        })
    for company in people:
        people[company].sort(key=lambda p: p["y"], reverse=True)

    # Persist the extracted dataset, then render the dashboard.
    data_path = REPO_ROOT / "data" / "company_people.json"
    data_path.parent.mkdir(exist_ok=True)
    data_path.write_text(json.dumps(people, ensure_ascii=False, indent=0))

    flagged, summary = scan_suspicious(rows)

    template = (REPO_ROOT / "scripts" / "dashboard_template.html").read_text()
    out = (template
           .replace("/*__PEOPLE__*/", json.dumps(people, ensure_ascii=False))
           .replace("/*__FLAGGED__*/", json.dumps(flagged, ensure_ascii=False))
           .replace("/*__SCAN__*/", json.dumps(summary, ensure_ascii=False)))
    (REPO_ROOT / "dashboard" / "index.html").write_text(out)
    print(f"Wrote dashboard/index.html ({len(top)} companies, "
          f"{sum(len(v) for v in people.values())} people; "
          f"{summary['flagged']} flagged, {summary['redacted']} redacted)")


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    build(Path(sys.argv[1]))


if __name__ == "__main__":
    main()
