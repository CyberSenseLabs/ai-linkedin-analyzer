"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { COMPANY_SECTOR, ROLECOL, SECDARK, SECTORS } from "@/lib/constants";
import { parseCSV, rowsToRecords } from "@/lib/parse";
import { buildFromRecords } from "@/lib/build";
import { enrichmentScore, profileSlug, type ScrapedProfile } from "@/lib/enrich";
import type { DashboardData, FlaggedConnection } from "@/lib/types";
import NetworkGraph from "./NetworkGraph";
import ApifyKeyDialog from "./ApifyKeyDialog";

type StatusKind = "info" | "success" | "error";
interface Status {
  kind: StatusKind;
  text: string;
  spinner?: boolean;
}

function safeHref(u: string): string | undefined {
  return /^https?:\/\//i.test(u || "") ? u : undefined;
}

export default function AnalyzerApp() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [activeSectors, setActiveSectors] = useState<Set<string>>(new Set());
  const [drill, setDrill] = useState<{ company: string; sector: string } | null>(null);
  const [status, setStatus] = useState<Status | null>(null);

  const [flagged, setFlagged] = useState<FlaggedConnection[]>([]);
  const [enriching, setEnriching] = useState(false);
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const sectorsPresent = useMemo(() => {
    if (!data) return [];
    const present = new Set(Object.keys(data.people).map((c) => COMPANY_SECTOR[c] || "Other"));
    return Object.keys(SECTORS).filter((s) => present.has(s));
  }, [data]);

  const handleFile = useCallback(async (file: File) => {
    setStatus({ kind: "info", text: `Reading ${file.name}…`, spinner: true });
    try {
      const zip = await JSZip.loadAsync(file);
      const entry = Object.values(zip.files).find((f) => !f.dir && /connections\.csv$/i.test(f.name));
      if (!entry) {
        setStatus({
          kind: "error",
          text: "Could not find a Connections.csv inside this archive. Make sure you uploaded the LinkedIn data export .zip.",
        });
        return;
      }
      setStatus({ kind: "info", text: "Found Connections.csv — analysing your network…", spinner: true });
      const text = await entry.async("string");
      const records = rowsToRecords(parseCSV(text));
      if (!records.length) {
        setStatus({ kind: "error", text: "Connections.csv was found but contained no rows." });
        return;
      }
      const built = buildFromRecords(records);
      setData(built);
      setFlagged(built.flagged);
      setDrill(null);
      const present = new Set(Object.keys(built.people).map((c) => COMPANY_SECTOR[c] || "Other"));
      setActiveSectors(new Set(Object.keys(SECTORS).filter((s) => present.has(s))));
      setStatus({
        kind: "success",
        text: `Loaded ${built.scan.total} connections (${Object.keys(built.people).length} companies, ${built.scan.flagged} flagged) — processed locally in your browser.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStatus({ kind: "error", text: `Could not process that file: ${message}` });
    }
  }, []);

  const handleExport = async () => {
    if (!data) return;
    setExporting(true);
    try {
      const { generateReport } = await import("@/lib/report");
      const svg = document.getElementById("netGraph") as SVGSVGElement | null;
      await generateReport(data, flagged, svg);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStatus({ kind: "error", text: `Could not generate the PDF report: ${message}` });
    } finally {
      setExporting(false);
    }
  };

  const reset = () => {
    setData(null);
    setFlagged([]);
    setDrill(null);
    setStatus(null);
    setActiveSectors(new Set());
  };

  const toggleSector = (sec: string) => {
    setActiveSectors((prev) => {
      const next = new Set(prev);
      if (next.has(sec)) next.delete(sec);
      else next.add(sec);
      return next;
    });
  };

  const onSelectCompany = useCallback((company: string, sector: string) => {
    setDrill({ company, sector });
    setTimeout(() => {
      document.getElementById("drillPanel")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 0);
  }, []);

  const runEnrichment = async (token: string) => {
    if (!data) return;
    setKeyDialogOpen(false);
    const urls = flagged.map((f) => f.u).filter(Boolean);
    if (!urls.length) {
      setStatus({ kind: "error", text: "No profile URLs among the flagged connections to enrich." });
      return;
    }
    setEnriching(true);
    setStatus({
      kind: "info",
      text: `Enriching ${urls.length} flagged profile${urls.length === 1 ? "" : "s"} via Apify — this can take a couple of minutes…`,
      spinner: true,
    });
    try {
      const res = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, urls }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
      const items: ScrapedProfile[] = json.items || [];
      if (items.length) {
        // eslint-disable-next-line no-console
        console.log("[enrich] sample item from Apify:", items[0]);
      }
      const bySlug = new Map<string, ScrapedProfile>();
      items.forEach((p) => {
        const url = (p.linkedinUrl || p.url || p.profileUrl || (p.input as { url?: string } | undefined)?.url || "") as string;
        const ident = p.publicIdentifier || (p.input as { publicIdentifier?: string } | undefined)?.publicIdentifier;
        const slug = ident ? String(ident).toLowerCase() : profileSlug(url);
        if (slug) bySlug.set(slug, p);
      });
      let enrichedCount = 0;
      const next = flagged.map((f) => {
        const p = bySlug.get(profileSlug(f.u));
        if (!p) return f;
        enrichedCount++;
        const e = enrichmentScore(p);
        return { ...f, esc: e.score, ers: e.reasons, trust: e.trust };
      });
      next.sort((a, b) => (b.esc ?? b.sc) - (a.esc ?? a.sc) || b.sc - a.sc);
      setFlagged(next);
      setData({ ...data, scan: { ...data.scan, enriched: enrichedCount } });
      if (enrichedCount === 0 && items.length > 0) {
        setStatus({
          kind: "error",
          text: `Apify returned ${items.length} profile(s) but none matched your flagged connections — check the browser console for a sample item to debug the field names.`,
        });
      } else {
        setStatus({ kind: "success", text: `Enriched ${enrichedCount} of ${urls.length} flagged profiles via Apify.` });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStatus({ kind: "error", text: `Enrichment failed: ${message}` });
    } finally {
      setEnriching(false);
    }
  };

  const statusColors: Record<StatusKind, [string, string]> = {
    info: ["var(--color-background-info)", "var(--color-text-info)"],
    success: ["var(--color-background-info)", "var(--color-text-info)"],
    error: ["rgba(163,45,45,0.12)", "var(--color-danger)"],
  };

  return (
    <div>
      <h1 style={{ fontSize: 22, margin: "0 0 0.25rem" }}>Network dashboard</h1>
      <p style={{ color: "var(--color-text-secondary)", fontSize: 14, margin: "0 0 1.5rem" }}>
        Interactive map of your LinkedIn connections, clustered by company and coloured by sector. Click
        a company to drill into the individuals you&apos;re connected with there.
      </p>

      {/* Upload bar */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 10,
          justifyContent: "space-between",
          background: "var(--color-background-secondary)",
          borderRadius: "var(--border-radius-md)",
          padding: "0.75rem 1rem",
          marginBottom: "0.5rem",
        }}
      >
        <div style={{ fontSize: 13, color: "var(--color-text-secondary)", maxWidth: 480 }}>
          <strong style={{ color: "var(--color-text-primary)" }}>Load your LinkedIn export</strong> — upload
          the <code>.zip</code> from <em>Settings &amp; Privacy → Data privacy → Get a copy of your data</em>.
          It&apos;s parsed entirely in your browser; nothing is uploaded anywhere.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) handleFile(f);
            }}
          />
          <button
            className="primary"
            disabled={status?.spinner}
            onClick={() => fileInputRef.current?.click()}
          >
            <i className="ti ti-upload" style={{ verticalAlign: -2, marginRight: 5 }} />
            Upload export (.zip)
          </button>
          {data && (
            <button onClick={handleExport} disabled={exporting}>
              {exporting ? (
                <span className="spinner" style={{ verticalAlign: -2, marginRight: 5 }} />
              ) : (
                <i className="ti ti-file-type-pdf" style={{ verticalAlign: -2, marginRight: 5 }} />
              )}
              Download PDF report
            </button>
          )}
          {data && (
            <button onClick={reset}>
              <i className="ti ti-refresh" style={{ verticalAlign: -2, marginRight: 5 }} />
              Reset
            </button>
          )}
        </div>
      </div>

      {status && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            borderRadius: "var(--border-radius-md)",
            padding: "0.6rem 0.9rem",
            fontSize: 13,
            margin: "0.5rem 0 1rem",
            background: statusColors[status.kind][0],
            color: statusColors[status.kind][1],
          }}
        >
          {status.spinner ? (
            <span className="spinner" />
          ) : (
            <i className={`ti ${status.kind === "error" ? "ti-alert-circle" : "ti-circle-check"}`} />
          )}
          <span>{status.text}</span>
        </div>
      )}

      {data && (
        <>
          {/* Sector filters */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", margin: "0.5rem 0 0.75rem" }}>
            <span style={{ fontSize: 13, color: "var(--color-text-secondary)", marginRight: 4 }}>Filter sector:</span>
            {sectorsPresent.map((sec) => {
              const on = activeSectors.has(sec);
              return (
                <button
                  key={sec}
                  onClick={() => toggleSector(sec)}
                  style={{
                    fontSize: 12,
                    padding: "3px 10px",
                    margin: 2,
                    borderRadius: 14,
                    border: `0.5px solid ${SECTORS[sec]}`,
                    background: on ? SECTORS[sec] : "transparent",
                    color: on ? "#fff" : SECDARK[sec],
                  }}
                >
                  {sec}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", marginBottom: 8, fontSize: 12, color: "var(--color-text-secondary)" }}>
            {sectorsPresent.map((sec) => (
              <span key={sec} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 11, height: 11, borderRadius: "50%", background: SECTORS[sec], display: "inline-block" }} />
                {sec}
              </span>
            ))}
          </div>

          <NetworkGraph
            people={data.people}
            activeSectors={activeSectors}
            onSelectCompany={onSelectCompany}
          />

          {/* Drill-down */}
          {drill && <DrillPanel company={drill.company} sector={drill.sector} data={data} onClose={() => setDrill(null)} />}

          {/* Authenticity scan */}
          <div style={{ marginTop: "1.5rem", borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 500 }}>Authenticity scan</div>
                <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                  Heuristically flags connections that look fake, spammy or low-information.
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => setKeyDialogOpen(true)} disabled={enriching}>
                  {enriching ? <span className="spinner" style={{ verticalAlign: -2, marginRight: 5 }} /> : <i className="ti ti-sparkles" style={{ verticalAlign: -2, marginRight: 5 }} />}
                  Enrich via Apify
                </button>
              </div>
            </div>
            <ScanResults flagged={flagged} scan={data.scan} />
          </div>
        </>
      )}

      {keyDialogOpen && (
        <ApifyKeyDialog
          onCancel={() => setKeyDialogOpen(false)}
          onConfirm={runEnrichment}
          count={flagged.filter((f) => f.u).length}
        />
      )}
    </div>
  );
}

// --- Drill-down panel -------------------------------------------------------

function DrillPanel({
  company,
  sector,
  data,
  onClose,
}: {
  company: string;
  sector: string;
  data: DashboardData;
  onClose: () => void;
}) {
  const ppl = data.people[company] || [];
  const cats: Record<string, number> = {};
  ppl.forEach((p) => (cats[p.c] = (cats[p.c] || 0) + 1));
  const catArr = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  const maxc = Math.max(1, ...catArr.map((c) => c[1]));

  return (
    <div
      id="drillPanel"
      style={{
        marginTop: "1rem",
        background: "var(--color-background-primary)",
        border: "0.5px solid var(--color-border-tertiary)",
        borderRadius: "var(--border-radius-lg)",
        padding: "1rem 1.25rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 14, height: 14, borderRadius: "50%", background: SECTORS[sector] }} />
          <span style={{ fontSize: 18, fontWeight: 500 }}>{company}</span>
          <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
            {ppl.length} connections · {sector}
          </span>
        </div>
        <button onClick={onClose} style={{ fontSize: 12, padding: "4px 10px" }}>
          Close
        </button>
      </div>

      <div style={{ marginBottom: 14 }}>
        {catArr.map(([c, n]) => (
          <div key={c} style={{ marginBottom: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
              <span>{c}</span>
              <span style={{ color: "var(--color-text-secondary)" }}>{n}</span>
            </div>
            <div style={{ height: 6, background: "var(--color-background-secondary)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.round((n / maxc) * 100)}%`, background: ROLECOL[c] || "#888", borderRadius: 3 }} />
            </div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 6 }}>Names link to LinkedIn profiles</div>
      <div style={{ maxHeight: 320, overflow: "auto" }}>
        <table style={{ width: "100%" }}>
          <thead>
            <tr style={{ textAlign: "left" }}>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Title</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Yr</th>
            </tr>
          </thead>
          <tbody>
            {ppl.map((p, i) => (
              <tr key={i} style={{ borderTop: "0.5px solid var(--color-border-tertiary)" }}>
                <td style={{ padding: "6px 8px 6px 0", fontSize: 13, whiteSpace: "nowrap" }}>
                  {safeHref(p.u) ? (
                    <a href={safeHref(p.u)} target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-text-info)", textDecoration: "none" }}>
                      {p.n} <i className="ti ti-external-link" style={{ fontSize: 12 }} />
                    </a>
                  ) : (
                    p.n
                  )}
                </td>
                <td style={{ padding: "6px 8px", fontSize: 12, color: "var(--color-text-secondary)" }}>{p.t}</td>
                <td style={{ padding: "6px 0", fontSize: 12, color: "var(--color-text-tertiary)", textAlign: "right" }}>{p.y}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- Scan results -----------------------------------------------------------

function Badge({ score, enriched }: { score: number; enriched: number | null }) {
  const strong = (enriched != null && enriched >= 4) || score >= 6;
  const bg = strong ? "#A32D2D" : score >= 4 ? "#854F0B" : "#5F5E5A";
  const label = enriched != null ? `H${score} / E${enriched}` : `H${score}`;
  return (
    <span style={{ background: bg, color: "#fff", fontSize: 11, fontWeight: 500, padding: "2px 7px", borderRadius: 10, whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

function ScanResults({ flagged, scan }: { flagged: FlaggedConnection[]; scan: DashboardData["scan"] }) {
  return (
    <div style={{ marginTop: "1rem" }}>
      <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "0.75rem 1rem", fontSize: 13, marginBottom: 10 }}>
        Scanned <strong>{scan.total}</strong> connections · <strong>{scan.flagged}</strong> flagged (score ≥{" "}
        {scan.min_score}) · <strong>{scan.redacted}</strong> privacy-redacted (not fakes)
        {scan.enriched ? (
          <>
            {" "}
            · <strong>{scan.enriched}</strong> enriched via Apify
          </>
        ) : null}
      </div>
      <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 6 }}>
        Badge: H = heuristic score (export fields), E = enrichment score (scraped profile, higher
        confidence). Higher = more suspicious.
      </div>
      {flagged.length ? (
        <div style={{ maxHeight: 360, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left" }}>
                <th style={thStyle}>Score</th>
                <th style={thStyle}>Connection</th>
                <th style={thStyle}>Why flagged</th>
              </tr>
            </thead>
            <tbody>
              {flagged.map((f, i) => {
                const reasons = (f.ers && f.ers.length ? f.ers : f.rs) || [];
                return (
                  <tr key={i} style={{ borderTop: "0.5px solid var(--color-border-tertiary)", verticalAlign: "top" }}>
                    <td style={{ padding: "7px 8px 7px 0" }}>
                      <Badge score={f.sc} enriched={f.esc} />
                    </td>
                    <td style={{ padding: "7px 8px 7px 0", fontSize: 13, whiteSpace: "nowrap" }}>
                      {safeHref(f.u) ? (
                        <a href={safeHref(f.u)} target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-text-info)", textDecoration: "none" }}>
                          {f.n}
                        </a>
                      ) : (
                        f.n || "(blank)"
                      )}
                      <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                        {f.t || "no title"}
                        {f.co ? ` @ ${f.co}` : ""}
                      </div>
                    </td>
                    <td style={{ padding: "7px 0", fontSize: 12, color: "var(--color-text-secondary)" }}>
                      {reasons.join("; ")}
                      {f.trust && f.trust.length ? (
                        <>
                          {" "}
                          · <span style={{ color: "var(--color-text-info)" }}>trust: {f.trust.join(", ")}</span>
                        </>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>
          No connections met the suspicion threshold — your network looks authentic.
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--color-text-tertiary)",
  fontWeight: 500,
  paddingBottom: 4,
};
