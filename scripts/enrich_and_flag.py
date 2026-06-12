#!/usr/bin/env python3
"""Score connection authenticity using enriched profile data.

Consumes the JSON produced by enrich_via_apify.py (or any Apify
harvestapi/linkedin-profile-scraper dataset export) and applies the strong
fake/bot signals that a plain LinkedIn export can't provide: connection and
follower counts, presence of a profile photo, and depth of history
(experience / education / certifications / skills).

Usage:
    python scripts/enrich_and_flag.py data/enrichment.json [--min-score N]
"""
import argparse
import json
import sys
from pathlib import Path

# Thresholds below which a real, active professional is unusual.
LOW_CONNECTIONS = 50
LOW_FOLLOWERS = 50


def first(obj, *keys):
    for k in keys:
        v = obj.get(k)
        if v not in (None, "", [], {}):
            return v
    return None


def score(p: dict):
    pts, reasons, trust = 0, [], []

    name = f"{(p.get('firstName') or '').strip()} {(p.get('lastName') or '').strip()}".strip()
    conns = first(p, "connectionsCount", "connections") or 0
    followers = first(p, "followerCount", "followers") or 0
    photo = first(p, "photo", "profilePicture")
    headline = (p.get("headline") or "").strip()
    about = (p.get("about") or "")
    experience = p.get("experience") or []
    education = p.get("education") or []
    certs = p.get("certifications") or []
    skills = p.get("skills") or []

    # --- Risk signals ---
    if conns < LOW_CONNECTIONS:
        pts += 3
        reasons.append(f"very low connections ({conns})")
    elif conns < 150:
        pts += 1
        reasons.append(f"low connections ({conns})")

    if followers < LOW_FOLLOWERS:
        pts += 1
        reasons.append(f"very few followers ({followers})")

    if not photo:
        pts += 2
        reasons.append("no profile photo")

    if not experience and not education and not certs:
        pts += 3
        reasons.append("no experience, education or certifications")
    elif not experience and not education:
        pts += 1
        reasons.append("no experience or education listed")

    if not headline:
        pts += 1
        reasons.append("no headline")

    if not about and not skills:
        pts += 1
        reasons.append("no about section or skills")

    # --- Trust signals (reduce score) ---
    if p.get("premium"):
        trust.append("LinkedIn Premium")
        pts -= 1
    if p.get("influencer"):
        trust.append("Influencer badge")
        pts -= 1
    if len(certs) >= 3:
        trust.append(f"{len(certs)} certifications")
        pts -= 1
    if conns >= 500:
        trust.append(f"{conns}+ connections")
        pts -= 1
    if len(skills) >= 5:
        trust.append(f"{len(skills)} skills")

    return max(pts, 0), name, reasons, trust, conns, bool(photo)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("enrichment_json", type=Path)
    ap.add_argument("--min-score", type=int, default=4)
    args = ap.parse_args()

    items = json.loads(args.enrichment_json.read_text())
    if not isinstance(items, list):
        sys.exit("Expected a JSON array of enriched profiles.")

    results = [score(p) + (p.get("linkedinUrl") or p.get("publicIdentifier", ""),)
               for p in items]
    results.sort(key=lambda r: -r[0])

    flagged = [r for r in results if r[0] >= args.min_score]
    print(f"Scored {len(items)} enriched profiles — {len(flagged)} flagged "
          f"(score >= {args.min_score}).\n")

    for pts, name, reasons, trust, conns, has_photo in (r[:6] for r in results):
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
