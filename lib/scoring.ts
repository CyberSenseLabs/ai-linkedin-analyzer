import {
  CONTACT_IN_TITLE,
  EMOJI,
  HEURISTIC_WEIGHTS,
  NAME_SCAM_HINTS,
  NON_NAME,
  SCAM_TERMS,
  SCAN_MIN_SCORE,
} from "./constants";
import type { ConnectionRecord, FlaggedConnection, ScanSummary } from "./types";

// A connection with no name and no URL is a privacy-redacted profile (the
// person chose not to share it), NOT a fake — we count but don't flag these.
export function isRedacted(r: ConnectionRecord): boolean {
  const name = `${(r["First Name"] || "").trim()} ${(r["Last Name"] || "").trim()}`.trim();
  return !name && !(r["URL"] || "").trim();
}

export function heuristicScore(
  row: ConnectionRecord,
  dupUrls: Record<string, number>,
  dupNames: Record<string, number>,
): [number, string[]] {
  const W = HEURISTIC_WEIGHTS;
  const first = (row["First Name"] || "").trim();
  const last = (row["Last Name"] || "").trim();
  const name = `${first} ${last}`.trim();
  const company = (row["Company"] || "").trim();
  const position = (row["Position"] || "").trim();
  const url = (row["URL"] || "").trim();
  const nameLc = name.toLowerCase();
  const posLc = position.toLowerCase();
  let pts = 0;
  const reasons: string[] = [];

  if (!company && !position) {
    pts += W.no_company_or_title;
    reasons.push("no company or job title");
  } else if (!position) {
    pts += W.no_title;
    reasons.push("no job title");
  }

  if (SCAM_TERMS.some((t) => posLc.includes(t))) {
    pts += W.scam_term_in_title;
    reasons.push("scam/spam term in job title");
  }
  if (NAME_SCAM_HINTS.some((h) => nameLc.includes(h))) {
    pts += W.promo_text_in_name;
    reasons.push("promotional text in name");
  }
  if (position && CONTACT_IN_TITLE.test(position)) {
    pts += W.contact_in_title;
    reasons.push("contact info / link in job title");
  }

  if (!first || !last) {
    pts += W.missing_name_part;
    reasons.push("missing first or last name");
  }
  if (NON_NAME.test(name)) {
    pts += W.symbols_in_name;
    reasons.push("digits/symbols in name");
  }
  if (EMOJI.test(name)) {
    pts += W.emoji_in_name;
    reasons.push("emoji in name");
  }
  if (name && name.replace(/ /g, "").length <= 2) {
    pts += W.implausibly_short_name;
    reasons.push("implausibly short name");
  }
  if (name && name === name.toUpperCase() && name.length > 4) {
    pts += W.all_caps_name;
    reasons.push("name in ALL CAPS");
  }

  if (url && (dupUrls[url] || 0) > 1) {
    pts += W.duplicate_url;
    reasons.push("duplicate profile URL");
  }
  if (name && !company && !position && (dupNames[nameLc] || 0) > 1) {
    pts += W.duplicate_empty_profile;
    reasons.push("duplicate empty profile");
  }
  if (!url) {
    pts += W.no_url;
    reasons.push("no profile URL");
  }

  return [pts, reasons];
}

export function scanSuspicious(records: ConnectionRecord[]): {
  flagged: FlaggedConnection[];
  summary: ScanSummary;
} {
  const dupUrls: Record<string, number> = {};
  const dupNames: Record<string, number> = {};
  records.forEach((r) => {
    const u = (r["URL"] || "").trim();
    if (u) dupUrls[u] = (dupUrls[u] || 0) + 1;
  });
  records.forEach((r) => {
    const n = `${(r["First Name"] || "").trim()} ${(r["Last Name"] || "").trim()}`
      .trim()
      .toLowerCase();
    dupNames[n] = (dupNames[n] || 0) + 1;
  });

  const flagged: FlaggedConnection[] = [];
  let redacted = 0;
  records.forEach((r) => {
    if (isRedacted(r)) {
      redacted++;
      return;
    }
    const [pts, reasons] = heuristicScore(r, dupUrls, dupNames);
    if (pts < SCAN_MIN_SCORE) return;
    flagged.push({
      n: `${(r["First Name"] || "").trim()} ${(r["Last Name"] || "").trim()}`.trim(),
      u: (r["URL"] || "").trim(),
      co: (r["Company"] || "").trim(),
      t: (r["Position"] || "").trim(),
      d: (r["Connected On"] || "").trim(),
      sc: pts,
      rs: reasons,
      esc: null,
      ers: null,
      trust: null,
    });
  });
  flagged.sort((a, b) => b.sc - a.sc);
  return {
    flagged,
    summary: {
      total: records.length,
      flagged: flagged.length,
      redacted,
      enriched: 0,
      min_score: SCAN_MIN_SCORE,
    },
  };
}
