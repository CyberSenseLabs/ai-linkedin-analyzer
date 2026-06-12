#!/usr/bin/env python3
"""Score connection authenticity using enriched profile data.

Consumes the JSON produced by enrich_via_apify.py (or any Apify
harvestapi/linkedin-profile-scraper dataset export) and applies the strong
fake/bot signals that a plain LinkedIn export can't provide: connection and
follower counts, presence of a profile photo, and depth of history. See
scoring.py for the rules and README.md for the algorithm.

Usage:
    python scripts/enrich_and_flag.py data/enrichment.json [--min-score N]
"""
import argparse
import json
import sys
from pathlib import Path

from scoring import enrichment_score


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("enrichment_json", type=Path)
    ap.add_argument("--min-score", type=int, default=4)
    args = ap.parse_args()

    items = json.loads(args.enrichment_json.read_text())
    if not isinstance(items, list):
        sys.exit("Expected a JSON array of enriched profiles.")

    results = [enrichment_score(p) for p in items]
    results.sort(key=lambda r: -r[0])

    flagged = [r for r in results if r[0] >= args.min_score]
    print(f"Scored {len(items)} enriched profiles — {len(flagged)} flagged "
          f"(score >= {args.min_score}).\n")

    for pts, name, reasons, trust, conns, has_photo in results:
        if pts < args.min_score:
            continue
        print(f"[{pts}] {name or '(blank)'}")
        print(f"      risks: {'; '.join(reasons) or 'none'}")
        if trust:
            print(f"      trust: {'; '.join(trust)}")
        print()

    if not flagged:
        print("No profiles met the suspicion threshold — network looks authentic.")


if __name__ == "__main__":
    main()
