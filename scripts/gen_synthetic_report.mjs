// Generate a synthetic LinkedIn Network Analysis PDF report for testing/demos.
// 2,200 connections across financial services, consulting, education and
// critical infrastructure, with *simulated* Apify profile enrichment scores
// (mirroring lib/enrich.ts) and all profile names redacted in the output.
//
// Renders the same sections as lib/report.ts (summary, sectors, top companies,
// authenticity scan with coloured pill badges, scoring rubric) headlessly via
// jsPDF — no browser needed. The live network-map image is omitted (it needs a
// DOM SVG). Output: sample_data/synthetic_network_report.pdf
//
// Run: node scripts/gen_synthetic_report.mjs

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";

const require = createRequire(import.meta.url);
const { jsPDF } = require("jspdf");
const autoTable = require("jspdf-autotable").default;
const JSZip = require("jszip");

// ---- RNG: random each run, or pass a seed as argv[2] to reproduce ----------
let seed = Number(process.argv[2]) || (Date.now() % 2147483647);
console.log(`seed = ${seed}  (pass it as an argument to reproduce this dataset)`);
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const pick = (arr) => arr[(rnd() * arr.length) | 0];
const chance = (p) => rnd() < p;
const randint = (a, b) => a + ((rnd() * (b - a + 1)) | 0);

// ---- sectors → companies ---------------------------------------------------
const SECTORS = {
  "Financial services": [
    "ANZ", "Commonwealth Bank", "NAB", "Westpac", "Macquarie Group",
    "Suncorp", "Bendigo Bank", "JPMorgan Chase", "Goldman Sachs", "Visa", "Stripe",
  ],
  Consulting: [
    "Accenture", "Deloitte", "PwC", "KPMG", "EY", "McKinsey & Company",
    "Boston Consulting Group", "Infotrust", "Versent", "CyberCX", "Mandiant",
  ],
  Education: [
    "University of Melbourne", "RMIT University", "Monash University",
    "University of Sydney", "La Trobe University", "UNSW", "TAFE NSW", "Deakin University",
  ],
  "Critical infrastructure": [
    "Telstra", "nbn Australia", "AGL Energy", "Origin Energy", "Yarra Valley Water",
    "Sydney Water", "Transgrid", "Ausgrid", "Aurizon", "Australian Rail Track Corp",
  ],
};
const SECTOR_COLOR = {
  "Financial services": "#378ADD",
  Consulting: "#7F77DD",
  Education: "#D4537E",
  "Critical infrastructure": "#1D9E75",
};
const SECTOR_ORDER = ["Financial services", "Consulting", "Education", "Critical infrastructure"];
const sectorOf = (co) => Object.keys(SECTORS).find((s) => SECTORS[s].includes(co)) || "Other";

const TITLES = [
  "Chief Information Security Officer", "Risk & Compliance Manager", "Security Architect",
  "GRC Consultant", "IRAP Assessor", "Information Security Analyst", "SOC Analyst",
  "Cyber Security Consultant", "Head of Cyber Security", "IT Auditor", "Privacy Officer",
  "Network Engineer", "Cloud Architect", "Solutions Consultant", "Program Manager",
  "Business Analyst", "Data Analyst", "Lecturer", "Researcher", "Account Executive",
];

const TOTAL = 2200;
const MIN_SCORE = 3;
const N_SUSPICIOUS = 28;   // flagged accounts
const N_REDACTED = 120;    // privacy-redacted (heuristic, not enriched)

// Name pools + helpers for materialising connection rows (for the export zip).
const FIRST = ("James John Robert Michael David William Mary Patricia Jennifer Linda Wei Li Chen "
  + "Ananya Rohan Priya Arjun Aisha Omar Fatima Yuki Hiroshi Sofia Mateo Lucas Emma Olivia Noah "
  + "Liam Ava Mia Ethan Charlotte Amelia Sven Ingrid Kwame Amara Thabo Nia Chloe Daniel Grace "
  + "Samuel Hannah Isaac Ruby Oscar Maya Leon Sanjay").split(" ");
const LAST = ("Smith Johnson Williams Brown Jones Garcia Miller Davis Rodriguez Martinez Wong Chen "
  + "Singh Patel Kumar Nguyen Tran Kim Park Sato Tanaka Rossi Murphy OBrien Kowalski Andersson "
  + "Nielsen Okafor Mensah Dube Khan Ali Ahmed Reddy Mehta Costa Silva Schmidt Muller Dubois "
  + "Taylor Anderson Thomas Walker White Harris Clark Lewis").split(" ");
const SUSP_TITLES = [
  "Crypto Trading Coach | 1000x returns", "Forex Investment Opportunity",
  "Passive income mentor — DM me", "Bitcoin trader | financial freedom",
  "Crypto giveaway — t.me/quickgains", "Investment coach | whatsapp +1 415 555 0142",
];
const randDate = () => {
  const start = Date.UTC(2015, 0, 1), end = Date.UTC(2025, 9, 1);
  const d = new Date(start + rnd() * (end - start));
  return `${String(d.getUTCDate()).padStart(2, "0")} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
const profileUrl = (f, l, i) =>
  `https://www.linkedin.com/in/${`${f}-${l}`.toLowerCase().replace(/[^a-z]/g, "")}-${String(i).padStart(4, "0")}`;

// ---- enrichment rubric (mirrors lib/enrich.ts ENRICH_WEIGHTS) --------------
const EW = {
  very_low_connections: 3, low_connections: 1, very_few_followers: 1, no_photo: 2,
  no_history: 3, no_experience_or_education: 1, no_headline: 1, no_about_or_skills: 1,
  premium: -1, influencer: -1, many_certs: -1, many_connections: -1,
};

// Simulate a scraped profile and score it exactly like enrichmentScore().
function simulateEnrichment(forceThin = false) {
  const lowQuality = forceThin ? chance(0.85) : chance(0.18); // thin/suspect profiles
  const conns = lowQuality
    ? randint(2, 140)
    : (chance(0.5) ? randint(150, 900) : randint(500, 4000));
  const followers = lowQuality ? randint(0, 120) : randint(50, 3000);
  const hasPhoto = lowQuality ? chance(0.4) : chance(0.95);
  const expCount = lowQuality ? randint(0, 1) : randint(1, 6);
  const eduCount = lowQuality ? randint(0, 1) : randint(0, 3);
  const certCount = lowQuality ? 0 : randint(0, 5);
  const headline = lowQuality ? chance(0.5) : chance(0.95);
  const about = lowQuality ? chance(0.35) : chance(0.85);
  const skills = lowQuality ? randint(0, 3) : randint(2, 12);
  const premium = !lowQuality && chance(0.18);
  const influencer = !lowQuality && chance(0.05);

  let pts = 0;
  const reasons = [];
  const trust = [];
  if (conns < 50) { pts += EW.very_low_connections; reasons.push(`very low connections (${conns})`); }
  else if (conns < 150) { pts += EW.low_connections; reasons.push(`low connections (${conns})`); }
  if (followers < 50) { pts += EW.very_few_followers; reasons.push(`very few followers (${followers})`); }
  if (!hasPhoto) { pts += EW.no_photo; reasons.push("no profile photo"); }
  if (!expCount && !eduCount && !certCount) { pts += EW.no_history; reasons.push("no experience, education or certifications"); }
  else if (!expCount && !eduCount) { pts += EW.no_experience_or_education; reasons.push("no experience or education listed"); }
  if (!headline) { pts += EW.no_headline; reasons.push("no headline"); }
  if (!about && !skills) { pts += EW.no_about_or_skills; reasons.push("no about section or skills"); }
  if (premium) { pts += EW.premium; trust.push("LinkedIn Premium"); }
  if (influencer) { pts += EW.influencer; trust.push("Influencer badge"); }
  if (certCount >= 3) { pts += EW.many_certs; trust.push(`${certCount} certifications`); }
  if (conns >= 500) { pts += EW.many_connections; trust.push(`${conns}+ connections`); }
  if (skills >= 5) { trust.push(`${skills} skills`); }

  return { esc: Math.max(0, pts), ers: reasons, trust };
}

// ---- generate connections --------------------------------------------------
const allSectorCompanies = Object.entries(SECTORS).flatMap(([sec, cos]) =>
  cos.map((co) => ({ sec, co })),
);

// Materialise every connection once, so the PDF report and the exported zip
// describe the exact same dataset.
const records = [];

// normal connections
for (let i = 0; i < TOTAL - N_SUSPICIOUS - N_REDACTED; i++) {
  const { sec, co } = pick(allSectorCompanies);
  const first = pick(FIRST), last = pick(LAST);
  records.push({
    first, last, company: co, sector: sec,
    title: pick(TITLES), // every named (non-suspicious) connection has a title
    date: randDate(), url: profileUrl(first, last, i),
    susp: false,
  });
}

// privacy-redacted connections: everything blank except the date (real exports
// look exactly like this when the person has hidden their profile)
for (let i = 0; i < N_REDACTED; i++) {
  records.push({ first: "", last: "", company: "", sector: "", title: "", date: randDate(), url: "", susp: false });
}

// suspicious connections — each carries a real heuristic signal (so the app
// flags it on upload) plus a simulated Apify enrichment score
let seq = 0;
for (let i = 0; i < N_SUSPICIOUS; i++) {
  const { sec, co } = pick(allSectorCompanies);
  const first = pick(FIRST), last = pick(LAST);
  let title, company = co;
  if (chance(0.7)) { title = pick(SUSP_TITLES); } else { title = ""; company = ""; } // scam title | no company+title
  let sc = 0; const rs = [];
  if (!company && !title) { sc += 3; rs.push("no company or job title"); }
  else if (!title) { sc += 1; rs.push("no job title"); }
  if (/crypto|forex|bitcoin|investment|passive income|giveaway|1000x|financial freedom|trader/i.test(title)) { sc += 3; rs.push("scam/spam term in job title"); }
  if (/t\.me\/|whatsapp|https?:\/\/|@\w|\+?\d[\d ()-]{7,}/i.test(title)) { sc += 2; rs.push("contact info / link in job title"); }
  const { esc, ers, trust } = simulateEnrichment(true);
  records.push({
    id: ++seq, first, last, company, sector: sec, title,
    date: randDate(), url: profileUrl(first, last, 9000 + i),
    susp: true, sc, esc, ers, trust, rs: rs.length ? rs : ["—"],
  });
}

// shuffle so suspicious / redacted rows aren't clustered together
for (let i = records.length - 1; i > 0; i--) {
  const j = (rnd() * (i + 1)) | 0;
  [records[i], records[j]] = [records[j], records[i]];
}

// derive company counts + the flagged list from the records
const people = {};
for (const r of records) if (r.company) (people[r.company] ||= []).push(1);
const flagged = records
  .filter((r) => r.susp)
  .map((r) => ({ id: r.id, n: "", co: r.company, sec: r.sector, t: r.title, sc: r.sc, esc: r.esc, rs: r.rs, ers: r.ers, trust: r.trust, u: "" }))
  .sort((a, b) => (b.esc + b.sc) - (a.esc + a.sc));

const companyCount = Object.keys(people).length;
const scan = {
  total: TOTAL,
  flagged: flagged.length,
  redacted: N_REDACTED,
  enriched: N_SUSPICIOUS, // only the suspicious accounts were enriched via Apify
  min_score: MIN_SCORE,
};

// ---- PDF rendering (mirrors lib/report.ts) ---------------------------------
const BRAND = "#185FA5";
const GREY = "#5f5e5a";
function badgeColor(sc, esc) {
  const strong = (esc != null && esc >= 4) || sc >= 6;
  return strong ? "#A32D2D" : sc >= 4 ? "#854F0B" : "#5F5E5A";
}

const doc = new jsPDF({ unit: "pt", format: "a4" });
const pageW = doc.internal.pageSize.getWidth();
const pageH = doc.internal.pageSize.getHeight();
const margin = 40;
const dateStr = new Date().toLocaleDateString("en-AU", { year: "numeric", month: "long", day: "numeric" });
const lastY = () => doc.lastAutoTable.finalY;

// Header
doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor("#1f1e1c");
doc.text("LinkedIn Network Analysis Report", margin, 56);
doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(GREY);
doc.text(`Generated ${dateStr} · SYNTHETIC TEST DATA · profile names redacted`, margin, 72);
doc.setDrawColor(BRAND); doc.setLineWidth(1.5); doc.line(margin, 82, pageW - margin, 82);

// Summary
let y = 104;
doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor("#1f1e1c");
doc.text("Summary", margin, y);
autoTable(doc, {
  startY: y + 8, margin: { left: margin, right: margin }, theme: "plain",
  styles: { fontSize: 10, cellPadding: 3, textColor: "#1f1e1c" },
  columnStyles: { 0: { textColor: GREY, cellWidth: 240 }, 1: { fontStyle: "bold" } },
  body: [
    ["Total connections", String(scan.total)],
    [`Companies mapped (${companyCount})`, String(companyCount)],
    ["Flagged as suspicious", `${scan.flagged} (score >= ${scan.min_score})`],
    ["Privacy-redacted (not fakes)", String(scan.redacted)],
    ["Enriched via Apify (simulated)", String(scan.enriched)],
  ],
});
y = lastY() + 24;

// --- Network map (radial: YOU at the centre, top companies clustered by ----
// sector, node size by connection count) — drawn as jsPDF vectors.
{
  // Show the top companies *per sector* (not top-N overall) so every sector is
  // fairly represented on the map, grouped together so each sector clusters.
  const PER_SECTOR = 7;
  const bySector = {};
  Object.entries(people).forEach(([co, ppl]) => {
    const s = sectorOf(co);
    (bySector[s] ||= []).push({ co, count: ppl.length, sec: s });
  });
  const top = SECTOR_ORDER.flatMap((s) =>
    (bySector[s] || []).sort((a, b) => b.count - a.count).slice(0, PER_SECTOR));

  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor("#1f1e1c");
  doc.text("Network map", margin, y);

  const mapTop = y + 10;
  const mapW = pageW - margin * 2;
  const mapH = 360;
  const cx = margin + mapW / 2;
  const cy = mapTop + mapH / 2;
  const ring = 122;
  const N = top.length;
  const maxN = top[0].count, minN = top[N - 1].count;

  const nodes = top.map((t, i) => {
    const ang = -Math.PI / 2 + (i / N) * Math.PI * 2;
    const rr = ring + (i % 2 ? 16 : -8); // stagger to reduce overlap
    return { ...t, ang, x: cx + Math.cos(ang) * rr, y: cy + Math.sin(ang) * rr };
  });

  // links from centre
  doc.setDrawColor("#cbcac6"); doc.setLineWidth(0.5);
  nodes.forEach((p) => doc.line(cx, cy, p.x, p.y));

  // company nodes
  nodes.forEach((p) => {
    const r = 6 + (maxN === minN ? 0 : (p.count - minN) / (maxN - minN)) * 12;
    doc.setFillColor(SECTOR_COLOR[p.sec] || "#888780");
    doc.circle(p.x, p.y, r, "F");
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor("#3a3a38");
    const lbl = p.co.length > 18 ? p.co.slice(0, 17) + ".." : p.co;
    const align = Math.cos(p.ang) >= 0 ? "left" : "right";
    doc.text(lbl, p.x + Math.cos(p.ang) * (r + 3), p.y + Math.sin(p.ang) * (r + 3) + 2, { align });
  });

  // central "YOU" node
  doc.setFillColor("#1f1e1c"); doc.circle(cx, cy, 16, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor("#ffffff");
  doc.text("YOU", cx, cy, { align: "center", baseline: "middle" });

  // sector legend (kept clear of the constellation)
  let lx = margin;
  const ly = mapTop + mapH + 18;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  SECTOR_ORDER.forEach((sec) => {
    doc.setFillColor(SECTOR_COLOR[sec]); doc.circle(lx + 3, ly - 2.5, 3, "F");
    doc.setTextColor(GREY); doc.text(sec, lx + 10, ly);
    lx += doc.getTextWidth(sec) + 28;
  });

  y = mapTop + mapH + 40;
}

// Connections by sector
const sectorAgg = {};
Object.keys(SECTORS).forEach((s) => (sectorAgg[s] = { companies: 0, connections: 0 }));
Object.entries(people).forEach(([co, ppl]) => {
  const sec = Object.keys(SECTORS).find((s) => SECTORS[s].includes(co)) || "Other";
  (sectorAgg[sec] ||= { companies: 0, connections: 0 });
  sectorAgg[sec].companies += 1;
  sectorAgg[sec].connections += ppl.length;
});
doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor("#1f1e1c");
doc.text("Connections by sector", margin, y);
autoTable(doc, {
  startY: y + 8, margin: { left: margin, right: margin },
  headStyles: { fillColor: BRAND, textColor: "#ffffff", fontStyle: "bold" },
  styles: { fontSize: 10, cellPadding: 4 },
  head: [["Sector", "Companies", "Connections"]],
  body: Object.entries(sectorAgg)
    .sort((a, b) => b[1].connections - a[1].connections)
    .map(([sec, a]) => [sec, String(a.companies), String(a.connections)]),
});
y = lastY() + 24;

// Top companies
const companyEntries = Object.entries(people).sort((a, b) => b[1].length - a[1].length);
if (y > pageH - 140) { doc.addPage(); y = margin; }
doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor("#1f1e1c");
doc.text(`Top companies (${companyEntries.length})`, margin, y);
autoTable(doc, {
  startY: y + 8, margin: { left: margin, right: margin },
  headStyles: { fillColor: BRAND, textColor: "#ffffff", fontStyle: "bold" },
  styles: { fontSize: 9, cellPadding: 4 },
  columnStyles: { 2: { halign: "right", cellWidth: 80 } },
  head: [["Company", "Sector", "Connections"]],
  body: companyEntries.map(([name, ppl]) => [
    name,
    Object.keys(SECTORS).find((s) => SECTORS[s].includes(name)) || "Other",
    String(ppl.length),
  ]),
});

// Authenticity scan — flagged connections (redacted names + pill badges)
doc.addPage();
y = margin + 16;
doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor("#1f1e1c");
doc.text("Authenticity scan — flagged connections", margin, y);
doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(GREY);
doc.text("H = heuristic score (export fields), E = enrichment score (simulated Apify). Higher = more suspicious. Names redacted.", margin, y + 14);

autoTable(doc, {
  startY: y + 26, margin: { left: margin, right: margin },
  headStyles: { fillColor: BRAND, textColor: "#ffffff", fontStyle: "bold" },
  styles: { fontSize: 8.5, cellPadding: 4, valign: "top" },
  columnStyles: { 0: { cellWidth: 64 }, 1: { cellWidth: 180 } },
  head: [["Score", "Connection", "Why flagged"]],
  body: flagged.map((f) => {
    const who = `[Redacted #${String(f.id).padStart(4, "0")}]\n${(f.t || "no title") + ` @ ${f.co}`}`;
    const reasons = (f.ers && f.ers.length ? f.ers : f.rs).join("; ");
    const trust = f.trust && f.trust.length ? `\nTrust: ${f.trust.join(", ")}` : "";
    return ["", who, reasons + trust];
  }),
  didDrawCell: (hook) => {
    if (hook.section !== "body" || hook.column.index !== 0) return;
    const f = flagged[hook.row.index];
    if (!f) return;
    const text = f.esc != null ? `H${f.sc} / E${f.esc}` : `H${f.sc}`;
    const { cell } = hook;
    const fs = 8.5;
    doc.setFont("helvetica", "bold"); doc.setFontSize(fs);
    const padX = 5, padY = 2.6;
    const pillH = fs + padY * 2;
    const pillW = Math.min(doc.getTextWidth(text) + padX * 2, cell.width - 4);
    const x = cell.x + (cell.width - pillW) / 2;
    const yTop = cell.y + cell.padding("top");
    doc.setFillColor(badgeColor(f.sc, f.esc));
    doc.roundedRect(x, yTop, pillW, pillH, pillH / 2, pillH / 2, "F");
    doc.setTextColor("#ffffff");
    doc.text(text, cell.x + cell.width / 2, yTop + pillH / 2, { align: "center", baseline: "middle" });
  },
});

// Appendix: scoring rubric — H (heuristic) first, then E (enrichment)
doc.addPage();
y = margin + 16;
doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor("#1f1e1c");
doc.text("Appendix: scoring rubric", margin, y);
doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(GREY);
doc.text(`Each connection earns points for signals associated with fake or low-quality profiles. A connection is flagged once its score reaches ${MIN_SCORE}.`, margin, y + 14);
y += 28;

doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor("#1f1e1c");
doc.text("Heuristic score (H) — from your export data", margin, y);
autoTable(doc, {
  startY: y + 8, margin: { left: margin, right: margin },
  headStyles: { fillColor: BRAND, textColor: "#ffffff", fontStyle: "bold" },
  styles: { fontSize: 9, cellPadding: 4 },
  columnStyles: { 1: { halign: "right", cellWidth: 60 } },
  head: [["Signal", "Points"]],
  body: [
    ["No company or job title listed", "+3"],
    ["No job title listed", "+1"],
    ["Scam/spam term in job title", "+3"],
    ["Promotional text in name", "+3"],
    ["Contact info or link in job title", "+2"],
    ["Missing first or last name", "+2"],
    ["Digits or symbols in name", "+2"],
    ["Emoji in name", "+1"],
    ["Implausibly short name", "+2"],
    ["Name in ALL CAPS", "+1"],
    ["Duplicate profile URL", "+2"],
    ["Duplicate empty profile", "+2"],
    ["No profile URL", "+1"],
  ],
});
y = lastY() + 20;

if (y > pageH - 170) { doc.addPage(); y = margin + 16; }
doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor("#1f1e1c");
doc.text("Enrichment score (E) — from scraped profile (simulated Apify)", margin, y);
autoTable(doc, {
  startY: y + 8, margin: { left: margin, right: margin },
  headStyles: { fillColor: BRAND, textColor: "#ffffff", fontStyle: "bold" },
  styles: { fontSize: 9, cellPadding: 4 },
  columnStyles: { 1: { halign: "right", cellWidth: 60 } },
  head: [["Signal", "Points"]],
  body: [
    ["Very low connections (under 50)", "+3"],
    ["Low connections (under 150)", "+1"],
    ["Very few followers (under 50)", "+1"],
    ["No profile photo", "+2"],
    ["No experience, education or certifications", "+3"],
    ["No experience or education listed", "+1"],
    ["No headline", "+1"],
    ["No about section or skills", "+1"],
    ["LinkedIn Premium (trust signal)", "-1"],
    ["Influencer badge (trust signal)", "-1"],
    ["3+ certifications (trust signal)", "-1"],
    ["500+ connections (trust signal)", "-1"],
  ],
});

// Footer page numbers
const pages = doc.getNumberOfPages();
for (let i = 1; i <= pages; i++) {
  doc.setPage(i);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(GREY);
  doc.text("AI LinkedIn Analyzer — synthetic test report (names redacted)", margin, pageH - 20);
  doc.text(`Page ${i} of ${pages}`, pageW - margin, pageH - 20, { align: "right" });
}

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(projectRoot, "sample_data");
mkdirSync(outDir, { recursive: true });
const pdfBuf = Buffer.from(doc.output("arraybuffer"));
const outPath = join(outDir, "synthetic_network_report.pdf");
writeFileSync(outPath, pdfBuf);
// Mirror into public/ so the landing page can link to it (sample_data isn't served).
const publicDir = join(projectRoot, "public");
mkdirSync(publicDir, { recursive: true });
writeFileSync(join(publicDir, "synthetic_network_report.pdf"), pdfBuf);
console.log(`Wrote ${outPath} (and public/synthetic_network_report.pdf)`);
console.log(`  ${scan.total} connections · ${companyCount} companies · ${scan.flagged} flagged · ${scan.redacted} privacy-redacted · ${scan.enriched} enriched (simulated)`);

// ---- export the same dataset as a LinkedIn-style Connections.csv zip -------
const csvEscape = (s) => {
  s = String(s ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csvLines = [
  "Notes:",
  '"This is synthetic test data generated for the AI LinkedIn Analyzer — not real connections."',
  "",
  ["First Name", "Last Name", "URL", "Email Address", "Company", "Position", "Connected On"].join(","),
  ...records.map((r) =>
    [r.first, r.last, r.url, "", r.company, r.title, r.date].map(csvEscape).join(",")),
];
const zip = new JSZip();
zip.file("Connections.csv", csvLines.join("\n") + "\n");
const zipBuf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
const zipPath = join(outDir, "synthetic_network_export.zip");
writeFileSync(zipPath, zipBuf);
console.log(`Wrote ${zipPath} (${records.length} connection rows)`);
