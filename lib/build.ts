import { TITLE_MAX, TOP_N } from "./constants";
import { ROLE_MAP } from "./constants";
import { scanSuspicious } from "./scoring";
import type { ConnectionRecord, DashboardData, PeopleByCompany } from "./types";

// Collapse common company-name variants so they cluster as one node.
export function normaliseCompany(name: string | undefined): string {
  const n = (name || "").trim();
  const low = n.toLowerCase();
  if (low.includes("infotrust")) return "Infotrust";
  if (n === "Amazon Web Services (AWS)") return "AWS";
  if (low.includes("logicalis")) return "Logicalis AP";
  if (low.includes("university of melbourne")) return "Uni of Melbourne";
  return n;
}

export function categorize(position: string | undefined): string {
  const p = (position || "").toLowerCase();
  for (const [label, kws] of ROLE_MAP) {
    if (kws.some((k) => p.includes(k))) return label;
  }
  return "Other";
}

// Build the full dashboard dataset (top-N companies' people + authenticity
// scan) from parsed connection records. Mirrors scripts/build_dashboard.py.
export function buildFromRecords(records: ConnectionRecord[]): DashboardData {
  const counts: Record<string, number> = {};
  records.forEach((r) => {
    const c = normaliseCompany(r["Company"]);
    if (c) counts[c] = (counts[c] || 0) + 1;
  });
  const top = new Set(
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_N)
      .map((e) => e[0]),
  );

  const people: PeopleByCompany = {};
  records.forEach((r) => {
    const company = normaliseCompany(r["Company"]);
    if (!top.has(company)) return;
    const position = (r["Position"] || "").trim().slice(0, TITLE_MAX);
    const connected = (r["Connected On"] || "").trim();
    let year = "";
    if (connected) {
      const d = new Date(connected);
      if (!isNaN(d.getTime())) year = String(d.getFullYear());
    }
    (people[company] = people[company] || []).push({
      n: `${(r["First Name"] || "").trim()} ${(r["Last Name"] || "").trim()}`.trim(),
      t: position,
      y: year,
      u: (r["URL"] || "").trim(),
      c: categorize(position),
    });
  });
  Object.values(people).forEach((arr) => arr.sort((a, b) => (b.y || "").localeCompare(a.y || "")));

  const { flagged, summary } = scanSuspicious(records);
  return { people, flagged, scan: summary };
}
