import type { ConnectionRecord } from "./types";

// Minimal RFC4180-ish CSV parser (handles quoted fields, embedded
// commas/newlines, CRLF, and "" escaping). Ported from the original dashboard.
export function parseCSV(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\r") {
        // ignore
      } else if (c === "\n") {
        row.push(field);
        out.push(row);
        row = [];
        field = "";
      } else field += c;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    out.push(row);
  }
  return out;
}

// LinkedIn prepends "Notes:" disclaimer lines before the real header row, so we
// locate the header by its first column ("First Name") rather than assuming row 0.
export function rowsToRecords(rows: string[][]): ConnectionRecord[] {
  const headerIdx = rows.findIndex((r) => r[0] === "First Name");
  if (headerIdx === -1) return [];
  const headers = rows[headerIdx];
  return rows
    .slice(headerIdx + 1)
    .filter((r) => r.length > 1 || (r[0] || "") !== "")
    .map((r) => {
      const o: ConnectionRecord = {};
      headers.forEach((h, i) => (o[h] = r[i] || ""));
      return o;
    });
}
