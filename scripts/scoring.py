#!/usr/bin/env python3
"""Shared connection-authenticity scoring logic.

Two tiers, both used by the CLIs and by the dashboard build:

- heuristic_score(): works from LinkedIn-export fields only (name, URL, email,
  company, position). Cheap, offline, weak signals.
- enrichment_score(): works from scraped public-profile data (connection /
  follower counts, photo, history). Strong signals.

Keeping the rules here means flag_suspicious.py, enrich_and_flag.py and
build_dashboard.py all score identically.
"""
import re

# --- Heuristic tier (export-only) -------------------------------------------

SCAM_TERMS = [
    "crypto", "bitcoin", "forex", "binary option", "binary options", "trader",
    "trading coach", "investment opportunity", "guaranteed return", "1000x",
    "double your", "passive income", "work from home", "earn from home",
    "make money", "financial freedom", "loan", "sugar daddy", "sugar baby",
    "escort", "onlyofans", "onlyfans", "adult content", "hookup", "dating",
    "telegram", "whatsapp me", "dm me", "dm for", "click the link", "click link",
    "herbalife", "forever living", "arbonne", "mlm", "ponzi", "giveaway",
    "free money", "btc", "usdt",
]
NAME_SCAM_HINTS = SCAM_TERMS + ["http", "www.", ".com", "@", "official", "vip"]
CONTACT_IN_TITLE = re.compile(r"(https?://|www\.|t\.me/|@[\w.]+|\+?\d[\d ()-]{8,})", re.I)
EMOJI = re.compile("[\U0001F000-\U0001FAFF\U00002600-\U000027BF\U0001F1E6-\U0001F1FF]")
NON_NAME = re.compile(r"[0-9$£€!?*#~^=<>{}\[\]|\\/]")

# Weights for each heuristic signal (documented in README).
HEURISTIC_WEIGHTS = {
    "no_company_or_title": 3,
    "no_title": 1,
    "scam_term_in_title": 3,
    "promo_text_in_name": 3,
    "contact_in_title": 2,
    "missing_name_part": 2,
    "symbols_in_name": 2,
    "emoji_in_name": 1,
    "implausibly_short_name": 2,
    "all_caps_name": 1,
    "duplicate_url": 2,
    "duplicate_empty_profile": 2,
    "no_url": 1,
}


def is_redacted(row) -> bool:
    """A connection that withheld their data from the export (privacy setting),
    not a fake. Identified by a blank name AND no profile URL."""
    name = f"{(row.get('First Name') or '').strip()} {(row.get('Last Name') or '').strip()}".strip()
    return not name and not (row.get("URL") or "").strip()


def heuristic_score(row, dup_urls, dup_names):
    """Return (points, [reasons]) for one export row."""
    W = HEURISTIC_WEIGHTS
    first = (row.get("First Name") or "").strip()
    last = (row.get("Last Name") or "").strip()
    name = f"{first} {last}".strip()
    company = (row.get("Company") or "").strip()
    position = (row.get("Position") or "").strip()
    url = (row.get("URL") or "").strip()
    name_lc, pos_lc = name.lower(), position.lower()

    pts, reasons = 0, []

    if not company and not position:
        pts += W["no_company_or_title"]; reasons.append("no company or job title")
    elif not position:
        pts += W["no_title"]; reasons.append("no job title")

    if any(t in pos_lc for t in SCAM_TERMS):
        pts += W["scam_term_in_title"]; reasons.append("scam/spam term in job title")
    if any(h in name_lc for h in NAME_SCAM_HINTS):
        pts += W["promo_text_in_name"]; reasons.append("promotional text in name")
    if position and CONTACT_IN_TITLE.search(position):
        pts += W["contact_in_title"]; reasons.append("contact info / link in job title")

    if not first or not last:
        pts += W["missing_name_part"]; reasons.append("missing first or last name")
    if NON_NAME.search(name):
        pts += W["symbols_in_name"]; reasons.append("digits/symbols in name")
    if EMOJI.search(name):
        pts += W["emoji_in_name"]; reasons.append("emoji in name")
    if name and len(name.replace(" ", "")) <= 2:
        pts += W["implausibly_short_name"]; reasons.append("implausibly short name")
    if name and name == name.upper() and len(name) > 4:
        pts += W["all_caps_name"]; reasons.append("name in ALL CAPS")

    if url and dup_urls.get(url, 0) > 1:
        pts += W["duplicate_url"]; reasons.append("duplicate profile URL")
    if name and not company and not position and dup_names.get(name_lc, 0) > 1:
        pts += W["duplicate_empty_profile"]; reasons.append("duplicate empty profile")
    if not url:
        pts += W["no_url"]; reasons.append("no profile URL")

    return pts, reasons


# --- Enrichment tier (scraped profile) --------------------------------------

LOW_CONNECTIONS = 50
LOW_FOLLOWERS = 50

ENRICH_WEIGHTS = {
    "very_low_connections": 3,
    "low_connections": 1,
    "very_few_followers": 1,
    "no_photo": 2,
    "no_history": 3,
    "no_experience_or_education": 1,
    "no_headline": 1,
    "no_about_or_skills": 1,
    # trust offsets (negative)
    "premium": -1,
    "influencer": -1,
    "many_certs": -1,
    "many_connections": -1,
}


def _first(obj, *keys):
    for k in keys:
        v = obj.get(k)
        if v not in (None, "", [], {}):
            return v
    return None


def enrichment_score(p: dict):
    """Return (points, name, [risk reasons], [trust reasons], connections, has_photo)."""
    W = ENRICH_WEIGHTS
    name = f"{(p.get('firstName') or '').strip()} {(p.get('lastName') or '').strip()}".strip()
    conns = _first(p, "connectionsCount", "connections") or 0
    followers = _first(p, "followerCount", "followers") or 0
    photo = _first(p, "photo", "profilePicture")
    headline = (p.get("headline") or "").strip()
    about = p.get("about") or ""
    experience = p.get("experience") or []
    education = p.get("education") or []
    certs = p.get("certifications") or []
    skills = p.get("skills") or []

    pts, reasons, trust = 0, [], []

    if conns < LOW_CONNECTIONS:
        pts += W["very_low_connections"]; reasons.append(f"very low connections ({conns})")
    elif conns < 150:
        pts += W["low_connections"]; reasons.append(f"low connections ({conns})")
    if followers < LOW_FOLLOWERS:
        pts += W["very_few_followers"]; reasons.append(f"very few followers ({followers})")
    if not photo:
        pts += W["no_photo"]; reasons.append("no profile photo")
    if not experience and not education and not certs:
        pts += W["no_history"]; reasons.append("no experience, education or certifications")
    elif not experience and not education:
        pts += W["no_experience_or_education"]; reasons.append("no experience or education listed")
    if not headline:
        pts += W["no_headline"]; reasons.append("no headline")
    if not about and not skills:
        pts += W["no_about_or_skills"]; reasons.append("no about section or skills")

    if p.get("premium"):
        pts += W["premium"]; trust.append("LinkedIn Premium")
    if p.get("influencer"):
        pts += W["influencer"]; trust.append("Influencer badge")
    if len(certs) >= 3:
        pts += W["many_certs"]; trust.append(f"{len(certs)} certifications")
    if conns >= 500:
        pts += W["many_connections"]; trust.append(f"{conns}+ connections")
    if len(skills) >= 5:
        trust.append(f"{len(skills)} skills")

    return max(pts, 0), name, reasons, trust, conns, bool(photo)
