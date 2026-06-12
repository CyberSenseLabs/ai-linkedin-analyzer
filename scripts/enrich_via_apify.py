#!/usr/bin/env python3
"""Enrich connections by scraping their public LinkedIn profiles via Apify.

Runs the `harvestapi/linkedin-profile-scraper` actor (no LinkedIn cookies
required) against a batch of profile URLs and saves the raw dataset to
data/enrichment.json. The enrichment adds the signals a LinkedIn *export*
lacks — connection/follower counts, profile photo, experience, education,
certifications — which enrich_and_flag.py then uses to score authenticity.

Cost: ~$4 per 1,000 profiles (PAY_PER_EVENT). Scraping third-party profiles
is billable and outward-facing — review the batch before a full run.

Requires an Apify API token:
    export APIFY_TOKEN=apify_api_xxx
    python scripts/enrich_via_apify.py /path/to/linkedin_export \
        [--limit N] [--only-flagged] [--out data/enrichment.json]
"""
import argparse
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

ACTOR = "harvestapi~linkedin-profile-scraper"
API = "https://api.apify.com/v2"
REPO_ROOT = Path(__file__).resolve().parent.parent


def load_urls(export_dir: Path, limit: int | None, only_flagged: bool):
    import csv
    with (export_dir / "Connections.csv").open(encoding="utf-8-sig") as f:
        lines = f.readlines()
    idx = next(i for i, l in enumerate(lines) if l.startswith("First Name"))
    rows = list(csv.DictReader(lines[idx:]))
    urls = []
    for r in rows:
        url = (r.get("URL") or "").strip()
        if not url:
            continue
        if only_flagged and (r.get("Position") or "").strip() and (r.get("Company") or "").strip():
            continue  # only profiles missing company/title
        urls.append(url)
    return urls[:limit] if limit else urls


def run_actor(token: str, urls: list[str]) -> list[dict]:
    payload = json.dumps({
        "profileScraperMode": "Profile details no email ($4 per 1k)",
        "queries": urls,
    }).encode()
    req = urllib.request.Request(
        f"{API}/acts/{ACTOR}/runs?token={token}",
        data=payload, headers={"Content-Type": "application/json"})
    run = json.load(urllib.request.urlopen(req))["data"]
    run_id, dataset_id = run["id"], run["defaultDatasetId"]

    while True:  # poll until the run finishes
        status = json.load(urllib.request.urlopen(
            f"{API}/actor-runs/{run_id}?token={token}"))["data"]["status"]
        if status in ("SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"):
            print(f"Run {status}")
            break
        time.sleep(5)

    return json.load(urllib.request.urlopen(
        f"{API}/datasets/{dataset_id}/items?token={token}&clean=true"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("export_dir", type=Path)
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--only-flagged", action="store_true",
                    help="only profiles missing company/title")
    ap.add_argument("--out", type=Path, default=REPO_ROOT / "data" / "enrichment.json")
    args = ap.parse_args()

    token = os.environ.get("APIFY_TOKEN")
    if not token:
        sys.exit("Set APIFY_TOKEN in your environment first.")

    urls = load_urls(args.export_dir, args.limit, args.only_flagged)
    print(f"Enriching {len(urls)} profiles via Apify (~${len(urls) * 0.004:.2f})...")
    items = run_actor(token, urls)
    args.out.write_text(json.dumps(items, ensure_ascii=False, indent=1))
    print(f"Wrote {len(items)} enriched profiles to {args.out}")


if __name__ == "__main__":
    main()
