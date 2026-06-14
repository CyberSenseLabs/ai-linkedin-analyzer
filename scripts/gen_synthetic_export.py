#!/usr/bin/env python3
"""Generate a synthetic LinkedIn data-export .zip for testing the analyzer.

Produces Connections.csv with the same preamble + header LinkedIn uses, filled
with N cross-industry synthetic profiles: colourful mapped companies as the big
sector nodes, a long tail of global firms, varied roles/dates, plus a realistic
fraction of privacy-redacted and suspicious connections for the authenticity scan.
"""
import csv
import io
import os
import random
import zipfile
from datetime import date, timedelta

random.seed(42)
N = 2500

# --- companies: (name, weight). Mapped names colour-match the dashboard sectors;
# the long tail is intentionally cross-industry ("Other"/grey) for breadth. ---
MAPPED = [
    ("ANZ", 9), ("Commonwealth Bank", 8), ("NAB", 7),
    ("Telstra", 9), ("Optus", 7), ("nbn® Australia", 5), ("Australia Post", 5),
    ("Infotrust", 6), ("Versent", 6), ("Accenture", 8), ("Hays", 4),
    ("Logicalis AP", 4), ("Rapid7", 4), ("Vanta", 3), ("CyberCX", 6),
    ("AWS", 9), ("Cisco", 7), ("Microsoft", 8), ("Google", 7),
    ("Yarra Valley Water", 5),
    ("La Trobe University", 4), ("RMIT University", 4), ("Uni of Melbourne", 4),
]
CROSS_INDUSTRY = [  # not in the app's sector map -> render as "Other"
    "Pfizer", "Johnson & Johnson", "Medtronic", "Ramsay Health Care",
    "Woolworths Group", "Coles Group", "Amazon", "Walmart", "IKEA",
    "Boeing", "Toyota", "Siemens", "BHP", "Rio Tinto",
    "Netflix", "News Corp", "Nine Entertainment", "Spotify",
    "Shell", "BP", "AGL Energy", "Origin Energy",
    "JPMorgan Chase", "Goldman Sachs", "Visa", "PayPal", "Stripe", "Macquarie Group",
    "Atlassian", "Canva", "Salesforce", "Oracle", "IBM", "SAP", "Meta", "Apple", "Adobe",
    "Deloitte", "PwC", "KPMG", "EY", "McKinsey & Company", "Boston Consulting Group",
    "Services Australia", "Australian Taxation Office", "Department of Defence",
    "Qantas", "Virgin Australia", "Emirates", "Vodafone", "AT&T",
]
COMPANIES = [(n, w) for n, w in MAPPED] + [(n, 2) for n in CROSS_INDUSTRY]
COMPANY_NAMES = [n for n, _ in COMPANIES]
COMPANY_WEIGHTS = [w for _, w in COMPANIES]

# --- title pools keyed loosely so the role mix is varied ---
TITLES = [
    "Chief Information Security Officer", "Chief Technology Officer", "CEO", "Founder",
    "Managing Director", "VP of Engineering", "Director of Risk", "Head of Cyber Security",
    "Security Architect", "Cloud Architect", "Enterprise Architect",
    "Security Engineer", "Software Engineer", "DevOps Engineer", "Site Reliability Engineer",
    "GRC Consultant", "Risk & Compliance Manager", "IRAP Assessor", "Information Security Analyst",
    "SOC Analyst", "Threat Intelligence Analyst", "Cyber Security Consultant",
    "Management Consultant", "Solutions Consultant", "Technical Advisor",
    "Project Manager", "Program Manager", "Delivery Lead", "Engineering Manager",
    "Account Executive", "Business Development Manager", "Partnerships Lead",
    "Data Analyst", "Business Analyst", "Financial Analyst",
    "Technical Recruiter", "Talent Acquisition Partner",
    "Product Manager", "UX Designer", "Network Engineer", "Systems Administrator",
    "Auditor", "Governance Specialist", "Compliance Officer", "Privacy Officer",
]

FIRST = ("James John Robert Michael David William Mary Patricia Jennifer Linda Elizabeth Barbara "
         "Wei Li Chen Ananya Rohan Priya Arjun Sanjay Aisha Omar Fatima Yuki Hiroshi Sofia Mateo "
         "Lucas Emma Olivia Noah Liam Ava Mia Ethan Aiden Charlotte Amelia Harper Sven Ingrid "
         "Kwame Amara Thabo Nia Chloe Daniel Grace Samuel Hannah Isaac Ruby Oscar Maya Leon").split()
LAST = ("Smith Johnson Williams Brown Jones Garcia Miller Davis Rodriguez Martinez Hernandez Lopez "
        "Wong Chen Singh Patel Kumar Nguyen Tran Kim Park Sato Tanaka Suzuki Rossi Murphy O'Brien "
        "Kowalski Andersson Nielsen Okafor Mensah Dube Khan Ali Ahmed Reddy Mehta Costa Silva "
        "Schmidt Müller Dubois Bernard Taylor Anderson Thomas Walker White Harris Clark Lewis").split()

def slug(first, last, i):
    base = f"{first}-{last}".lower().replace("'", "").replace(" ", "-")
    return f"{base}-{i:04d}"

def rand_date():
    start = date(2015, 1, 1)
    d = start + timedelta(days=random.randint(0, (date(2025, 11, 1) - start).days))
    return d.strftime("%d %b %Y")  # e.g. "18 Mar 2024"

def normal_row(i):
    first = random.choice(FIRST)
    last = random.choice(LAST)
    company = random.choices(COMPANY_NAMES, weights=COMPANY_WEIGHTS, k=1)[0]
    title = random.choice(TITLES)
    r = random.random()
    if r < 0.06:           # privacy-redacted: everything blank except the date,
                           # exactly like a real LinkedIn export (counted, not flagged)
        return ["", "", "", "", "", "", rand_date()]
    if r < 0.12:           # has name + title, no company (still a complete person)
        company = ""
    # every named connection always carries a job title
    url = f"https://www.linkedin.com/in/{slug(first, last, i)}"
    email = f"{first.lower()}.{last.lower().replace(chr(39),'')}@example.com" if random.random() < 0.08 else ""
    return [first, last, url, email, company, title, rand_date()]

def suspicious_row(i):
    """Produce a profile the heuristic scan should flag."""
    kind = random.choice(["scam_title", "contact_title", "promo_name", "allcaps", "missing", "emoji"])
    # NOTE: every branch below keeps a job title — a named connection is never titleless.
    first = random.choice(FIRST); last = random.choice(LAST)
    url = f"https://www.linkedin.com/in/{slug(first, last, i)}"
    date_s = rand_date()
    if kind == "scam_title":
        return [first, last, url, "", "", random.choice(
            ["Crypto Trading Coach | 1000x returns", "Forex Investment Opportunity",
             "Passive income | financial freedom", "Bitcoin trader — DM me"]), date_s]
    if kind == "contact_title":
        return [first, last, url, "", "Self-employed",
                random.choice(["Investor | whatsapp +1 415 555 0142",
                               "Coach — t.me/quickmoney", "Mentor | dm @richquick"]), date_s]
    if kind == "promo_name":
        return [first, "VIP Official", url, "", "", "Entrepreneur", date_s]
    if kind == "allcaps":
        return [first.upper(), last.upper(), url, "", "", "Consultant", date_s]
    if kind == "missing":      # missing last name (still has first name + a title)
        return [first, "", url, "", "", "Crypto trader | DM me", date_s]
    # emoji in name
    return [first + " 🚀💰", last, url, "", "", "Growth Hacker", date_s]

# build rows: ~4% suspicious, plus a few duplicate-URL pairs
rows = []
n_susp = int(N * 0.04)
for i in range(N - n_susp):
    rows.append(normal_row(i))
for i in range(n_susp):
    rows.append(suspicious_row(10000 + i))
# inject a handful of duplicate URLs (bot-farm signal)
dupe_url = "https://www.linkedin.com/in/duplicate-bot-profile-0001"
for j in range(6):
    rows.append(["Alex", "Doe", dupe_url, "", "", "Recruiter", rand_date()])
random.shuffle(rows)

# --- write Connections.csv with LinkedIn's preamble ---
buf = io.StringIO()
buf.write("Notes:\n")
buf.write('"When exporting your connection data, you may notice that some of the '
          'information you provided is not included. This is synthetic test data."\n')
buf.write("\n")
w = csv.writer(buf, quoting=csv.QUOTE_MINIMAL, lineterminator="\n")
w.writerow(["First Name", "Last Name", "URL", "Email Address", "Company", "Position", "Connected On"])
w.writerows(rows)
csv_bytes = buf.getvalue().encode("utf-8")

out_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sample_data")
os.makedirs(out_dir, exist_ok=True)
out_zip = os.path.join(out_dir, "synthetic_linkedin_export.zip")
with zipfile.ZipFile(out_zip, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("Connections.csv", csv_bytes)

print(f"Wrote {out_zip} with Connections.csv ({len(rows)} connections, {len(csv_bytes)} bytes)")
