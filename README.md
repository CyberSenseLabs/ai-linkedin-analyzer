# AI LinkedIn Analyzer

Turns a LinkedIn data export into an interactive network dashboard — a force-directed
map of your connections clustered by company and coloured by industry sector, with
drill-down into the individuals at each organisation.

![dashboard](docs/screenshot.png)

## Features

- **Force-directed network graph** — you at the centre, top companies as nodes sized
  by connection count and coloured by sector.
- **Sector filter** — toggle industry sectors on/off (banking, telco, security &
  consulting, cloud & tech, utilities, education).
- **Invitation-flow overlay** — highlights nodes when reviewing pending invitations.
- **Drill-down** — click any company to see a per-company role breakdown and a table
  of every individual you're connected with there. Names link to their LinkedIn
  profiles.
- **Zoom / pan / reset** controls.
- **Connection analysis** CLI — totals, growth by year, top companies, role mix.

Everything is static — open `dashboard/index.html` in a browser, no server required. The
dashboard always **starts empty** and loads your network from an export you upload — no
personal data is ever baked into a committed file.

## Quick start — upload your export in the browser

No Python required. Open [`dashboard/index.html`](dashboard/index.html), click **Upload export
(.zip)**, and select the `.zip` you downloaded from LinkedIn
(Settings & Privacy → Data privacy → Get a copy of your data — the basic export is enough,
you don't need to wait for the full archive).

The archive is unzipped and parsed entirely in your browser via
[JSZip](https://stuff.mit.edu/afs/sipb/contrib/wine/jszip/jsZip-readme.html) — nothing is
uploaded to a server. It extracts `Connections.csv`, builds the network graph, and runs the
same heuristic [authenticity scan](#detecting-suspicious--fake-connections) as the CLI
(`scripts/scoring.py`'s Tier 1, ported to JS in `scripts/dashboard_template.html`). Click
**Reset** to return to the empty starter view.

The Apify enrichment tier (Tier 2) still requires the Python CLI, since it needs an
`APIFY_TOKEN` that shouldn't be embedded in a page running in the browser.

## Usage

1. Request your data archive from LinkedIn
   (Settings → Data privacy → Get a copy of your data) and unzip it.

2. Run the analysis (prints a text summary):

   ```bash
   python scripts/analyze_connections.py /path/to/linkedin_export
   ```

3. Open `dashboard/index.html` and upload the export's `.zip` (or unzipped
   `Connections.csv` inside a `.zip`) via the GUI — see Quick start above.

   Optionally, extract `data/company_people.json` for offline analysis (this file is
   git-ignored, since it contains your real connections):

   ```bash
   python scripts/build_dashboard.py /path/to/linkedin_export
   ```

No dependencies beyond the Python standard library. D3, JSZip and the Tabler icon font are
loaded from CDN at runtime.

## Layout

```
scripts/analyze_connections.py   Text connection analysis
scripts/build_dashboard.py       Extracts per-company people to data/company_people.json (optional, local-only)
scripts/dashboard_template.html  Standalone dashboard — starts empty, loads data via in-browser upload
data/company_people.json         Extracted dataset (git-ignored — contains your real connections)
dashboard/index.html             Copy of dashboard_template.html — the dashboard you open
```

## Detecting suspicious / fake connections

A LinkedIn export omits the strongest fake-detection signals (connection count,
profile photo, account age), so detection happens in two tiers:

1. **Offline heuristics** — flags scam/spam terms in titles, contact info in
   headlines, gibberish/promotional names, duplicates and missing data:

   ```bash
   python scripts/flag_suspicious.py ./linkedin_export --min-score 3
   ```

2. **Enriched scoring** — scrapes the public profiles of borderline connections
   via the Apify actor `harvestapi/linkedin-profile-scraper` (no cookies, ~$4 per
   1,000) to add connection/follower counts, photo presence and history depth,
   then scores authenticity:

   ```bash
   export APIFY_TOKEN=apify_api_xxx
   python scripts/enrich_via_apify.py ./linkedin_export --only-flagged
   python scripts/enrich_and_flag.py data/enrichment.json --min-score 4
   ```

`data/enrichment_sample.json` holds a 3-profile sample so `enrich_and_flag.py`
runs without an Apify token. Real enrichment output (`data/enrichment.json`) is
git-ignored.

The same scan is available in the dashboard — click **Run authenticity scan** to
see the flagged connections, their scores, and the reasons inline.

## Scoring algorithm

All scoring lives in [`scripts/scoring.py`](scripts/scoring.py) so the CLIs and
the dashboard score identically. A connection accumulates **points** — higher is
more suspicious — and is flagged when its score meets the threshold. There are two
independent tiers.

### Tier 1 — heuristic score (export fields only)

Runs on every connection using just the export (`name, URL, email, company,
position`). Each matched signal adds points:

| Signal | Points |
|---|---:|
| No company **and** no job title | +3 |
| Scam/spam term in job title (crypto, forex, "DM me", OnlyFans, "passive income", …) | +3 |
| Promotional text in name (URL, "official", "VIP", "@…") | +3 |
| Contact info / link in job title (phone, `t.me/`, URL) | +2 |
| Missing first or last name | +2 |
| Digits or symbols in name | +2 |
| Duplicate profile URL (same link on 2+ rows) | +2 |
| Duplicate empty profile (same name, no company/title, appears 2+ times) | +2 |
| No job title (but has a company) | +1 |
| Emoji in name | +1 |
| Implausibly short name (≤2 chars) | +1 |
| Name in ALL CAPS | +1 |
| No profile URL | +1 |

Default flag threshold: **score ≥ 3**.

**Privacy-redacted rows are excluded.** A connection with a blank name *and* no
URL has simply turned off "let connections export my data" — a privacy setting,
the opposite of a bot. These are counted separately and never flagged.

This tier is cheap but weak: it catches obvious spam/scam patterns but can't see
the strongest fakeness signals, which aren't in the export.

### Tier 2 — enrichment score (scraped profile)

When a profile has been enriched (via `enrich_via_apify.py`), the strong signals
become available and are scored independently:

| Risk signal | Points |
|---|---:|
| Very low connections (< 50) | +3 |
| No experience, education **or** certifications | +3 |
| No profile photo | +2 |
| Low connections (50–149) | +1 |
| Very few followers (< 50) | +1 |
| No experience or education (but has certs) | +1 |
| No headline | +1 |
| No about section **and** no skills | +1 |

| Trust signal (reduces score) | Points |
|---|---:|
| LinkedIn Premium | −1 |
| Influencer badge | −1 |
| 3+ certifications | −1 |
| 500+ connections | −1 |

Scores are floored at 0. Default flag threshold: **score ≥ 4**.

### How the two combine

In the dashboard, a flagged connection shows a badge like `E2 / H3`: the
enrichment score (`E`, higher confidence) and the heuristic score (`H`). A row is
surfaced if its heuristic score ≥ 3 **or** its enrichment score ≥ 4, and rows are
ranked by enrichment score first. The heuristic threshold is tunable via `--min-score`
on the CLIs and `SCAN_MIN_SCORE` in `scripts/dashboard_template.html` (the browser scan
doesn't have access to Tier 2 enrichment, so its badges only ever show `H`).

These are triage aids, not proof — always review a flagged profile before acting.

## Local development

Place your unzipped LinkedIn export in a `linkedin_export/` directory at the repo
root — this path is git-ignored, so your real data never gets committed. The analysis
scripts then run against it directly:

```bash
python scripts/analyze_connections.py ./linkedin_export  # text analysis
python scripts/build_dashboard.py ./linkedin_export       # optional: data/company_people.json + copies the template to dashboard/index.html
open dashboard/index.html                                 # then upload your export's .zip via the GUI
```

If you edit `scripts/dashboard_template.html`, re-run `build_dashboard.py` (or copy the
file directly) to refresh `dashboard/index.html` — it's an exact copy, kept as a separate
tracked file only so the dashboard can be opened without a build step.

## Privacy

The dashboard itself contains no personal data — `dashboard/index.html` always starts
empty, and any export you upload is parsed locally in your browser and never leaves your
device. `data/company_people.json` and `data/enrichment.json` (produced by the optional
CLI scripts) contain your real connections and are git-ignored. Raw LinkedIn exports are
git-ignored by default too.

## License

MIT — see [LICENSE](LICENSE).
