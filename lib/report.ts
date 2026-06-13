import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { COMPANY_SECTOR, HEURISTIC_WEIGHTS } from "./constants";
import type { DashboardData, FlaggedConnection } from "./types";

const BRAND = "#185FA5";
const GREY = "#5f5e5a";

// Plain-English description of each heuristic signal, in HEURISTIC_WEIGHTS order.
const HEURISTIC_RUBRIC: [string, number][] = [
  ["No company or job title listed", HEURISTIC_WEIGHTS.no_company_or_title],
  ["No job title listed", HEURISTIC_WEIGHTS.no_title],
  ["Scam/spam term in job title", HEURISTIC_WEIGHTS.scam_term_in_title],
  ["Promotional text in name", HEURISTIC_WEIGHTS.promo_text_in_name],
  ["Contact info or link in job title", HEURISTIC_WEIGHTS.contact_in_title],
  ["Missing first or last name", HEURISTIC_WEIGHTS.missing_name_part],
  ["Digits or symbols in name", HEURISTIC_WEIGHTS.symbols_in_name],
  ["Emoji in name", HEURISTIC_WEIGHTS.emoji_in_name],
  ["Implausibly short name", HEURISTIC_WEIGHTS.implausibly_short_name],
  ["Name in ALL CAPS", HEURISTIC_WEIGHTS.all_caps_name],
  ["Duplicate profile URL", HEURISTIC_WEIGHTS.duplicate_url],
  ["Duplicate empty profile", HEURISTIC_WEIGHTS.duplicate_empty_profile],
  ["No profile URL", HEURISTIC_WEIGHTS.no_url],
];

// Enrichment signals from a scraped profile (scripts/scoring.py enrichment_score).
const ENRICHMENT_RUBRIC: [string, string][] = [
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
];

// Render a live SVG (with CSS-variable colours) to a PNG data URL by resolving
// each element's computed fill/stroke, so it rasterises correctly off-DOM.
async function svgToPng(svg: SVGSVGElement, scale = 2): Promise<{ dataUrl: string; w: number; h: number } | null> {
  try {
    // Force a light-theme palette while reading colours so the image always
    // renders for the white PDF background — black labels, a black "you" node
    // (its white text stays legible), dark links — regardless of the user's OS
    // theme (in dark mode --color-text-primary is near-white and would be
    // invisible on white). Applied to the live element, read, then restored
    // synchronously (before any repaint), so there's no on-screen flash.
    const LIGHT: Record<string, string> = {
      "--color-text-primary": "#000000",
      "--color-background-primary": "#ffffff",
      "--color-text-info": "#185fa5",
      "--color-border-secondary": "rgba(0,0,0,0.35)",
      "--color-text-secondary": "#5f5e5a",
      "--color-text-tertiary": "#888780",
    };
    const prev: Record<string, string> = {};
    for (const k in LIGHT) {
      prev[k] = svg.style.getPropertyValue(k);
      svg.style.setProperty(k, LIGHT[k]);
    }

    const clone = svg.cloneNode(true) as SVGSVGElement;
    try {
      const origEls = svg.querySelectorAll("*");
      const cloneEls = clone.querySelectorAll("*");
      origEls.forEach((o, i) => {
        const cs = getComputedStyle(o);
        const c = cloneEls[i] as SVGElement | undefined;
        if (!c) return;
        if (cs.fill) c.setAttribute("fill", cs.fill);
        if (cs.stroke && cs.stroke !== "none") c.setAttribute("stroke", cs.stroke);
        if (cs.strokeWidth) c.setAttribute("stroke-width", cs.strokeWidth);
        if (cs.opacity && cs.opacity !== "1") c.setAttribute("opacity", cs.opacity);
      });
    } finally {
      for (const k in LIGHT) {
        if (prev[k]) svg.style.setProperty(k, prev[k]);
        else svg.style.removeProperty(k);
      }
    }

    const vb = svg.viewBox.baseVal;
    const w = vb && vb.width ? vb.width : svg.clientWidth || 680;
    const h = vb && vb.height ? vb.height : svg.clientHeight || 470;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(w));
    clone.setAttribute("height", String(h));
    // A position/offset in the root SVG's inline style breaks rasterisation in
    // Chrome (the image renders blank), so drop it — width/height + viewBox above
    // fully define the output.
    clone.removeAttribute("style");

    const xml = new XMLSerializer().serializeToString(clone);
    const src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = src;
    });

    const canvas = document.createElement("canvas");
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL("image/png"), w, h };
  } catch {
    return null;
  }
}

export async function generateReport(
  data: DashboardData,
  flagged: FlaggedConnection[],
  svgEl?: SVGSVGElement | null,
): Promise<void> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentW = pageW - margin * 2;
  const today = new Date();
  const dateStr = today.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

  // jsPDF's built-in fonts are Latin-1 only; strip characters outside that range
  // (emoji in scam-account names, "≥", smart quotes, etc.) so they don't render
  // as garbage glyphs. The "why flagged" reasons still note e.g. "emoji in name".
  const clean = (s: unknown) => String(s ?? "").replace(/[^\x00-\xFF]/g, "");

  // --- Header -------------------------------------------------------------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor("#1f1e1c");
  doc.text("LinkedIn Network Analysis Report", margin, 56);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(GREY);
  doc.text(
    `Generated ${dateStr} · Processed locally in your browser — no data was transmitted.`,
    margin,
    72,
  );
  doc.setDrawColor(BRAND);
  doc.setLineWidth(1.5);
  doc.line(margin, 82, pageW - margin, 82);

  // --- Summary ------------------------------------------------------------
  const { scan, people } = data;
  const companyCount = Object.keys(people).length;
  let y = 104;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor("#1f1e1c");
  doc.text("Summary", margin, y);
  y += 8;

  const summaryRows: [string, string][] = [
    ["Total connections", String(scan.total)],
    [`Companies mapped (top ${companyCount})`, String(companyCount)],
    ["Flagged as suspicious", `${scan.flagged} (score >= ${scan.min_score})`],
    ["Privacy-redacted (not fakes)", String(scan.redacted)],
  ];
  if (scan.enriched) summaryRows.push(["Enriched via Apify", String(scan.enriched)]);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: "plain",
    styles: { fontSize: 10, cellPadding: 3, textColor: "#1f1e1c" },
    columnStyles: { 0: { textColor: GREY, cellWidth: 220 }, 1: { fontStyle: "bold" } },
    body: summaryRows,
  });
  // @ts-expect-error lastAutoTable is attached by the plugin
  y = doc.lastAutoTable.finalY + 20;

  // --- Network graph image ------------------------------------------------
  if (svgEl) {
    const png = await svgToPng(svgEl);
    if (png) {
      const imgW = contentW;
      const imgH = (png.h / png.w) * imgW;
      if (y + imgH > pageH - margin) {
        doc.addPage();
        y = margin;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor("#1f1e1c");
      doc.text("Network map", margin, y);
      y += 10;
      // "FAST" enables Flate compression — without it jsPDF embeds the bitmap
      // uncompressed (~5 MB for this image); with it the report is a few hundred KB.
      doc.addImage(png.dataUrl, "PNG", margin, y, imgW, imgH, undefined, "FAST");
      y += imgH + 24;
    }
  }

  // --- Connections by sector ---------------------------------------------
  const sectorAgg: Record<string, { companies: number; connections: number }> = {};
  Object.entries(people).forEach(([company, ppl]) => {
    const sec = COMPANY_SECTOR[company] || "Other";
    const a = (sectorAgg[sec] = sectorAgg[sec] || { companies: 0, connections: 0 });
    a.companies += 1;
    a.connections += ppl.length;
  });
  const sectorRows = Object.entries(sectorAgg)
    .sort((a, b) => b[1].connections - a[1].connections)
    .map(([sec, a]) => [clean(sec), String(a.companies), String(a.connections)]);

  if (y > pageH - 160) {
    doc.addPage();
    y = margin;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor("#1f1e1c");
  doc.text("Connections by sector", margin, y);
  autoTable(doc, {
    startY: y + 8,
    margin: { left: margin, right: margin },
    headStyles: { fillColor: BRAND, textColor: "#ffffff", fontStyle: "bold" },
    styles: { fontSize: 10, cellPadding: 4 },
    head: [["Sector", "Companies", "Connections"]],
    body: sectorRows,
  });
  // @ts-expect-error lastAutoTable is attached by the plugin
  y = doc.lastAutoTable.finalY + 20;

  // --- Top companies ------------------------------------------------------
  const companyEntries = Object.entries(people).sort((a, b) => b[1].length - a[1].length);
  const companyRows = companyEntries.map(([name, ppl]) => [
    clean(name),
    clean(COMPANY_SECTOR[name] || "Other"),
    String(ppl.length),
  ]);

  if (y > pageH - 120) {
    doc.addPage();
    y = margin;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor("#1f1e1c");
  doc.text(`Top companies (${companyRows.length})`, margin, y);
  autoTable(doc, {
    startY: y + 8,
    margin: { left: margin, right: margin },
    headStyles: { fillColor: BRAND, textColor: "#ffffff", fontStyle: "bold" },
    styles: { fontSize: 9, cellPadding: 4 },
    columnStyles: { 2: { halign: "right", cellWidth: 80 } },
    head: [["Company", "Sector", "Connections"]],
    body: companyRows,
    didDrawCell: (hook) => {
      // Underline the company name and link it to a LinkedIn company search.
      if (hook.section !== "body" || hook.column.index !== 0) return;
      const [name] = companyEntries[hook.row.index];
      const { cell } = hook;
      const padX = cell.padding("left");
      const padY = cell.padding("top");
      const fontSize = cell.styles.fontSize ?? 9;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(fontSize);
      const label = clean(name);
      const textWidth = Math.min(doc.getTextWidth(label), cell.width - padX * 2);
      const lineHeight = fontSize * 1.15;
      const x = cell.x + padX;
      const yTop = cell.y + padY;
      doc.setDrawColor(BRAND);
      doc.setLineWidth(0.5);
      doc.line(x, yTop + lineHeight - 1.5, x + textWidth, yTop + lineHeight - 1.5);
      doc.link(x, yTop, textWidth, lineHeight, {
        url: `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(name)}`,
      });
    },
  });

  // --- Scoring rubric -------------------------------------------------------
  doc.addPage();
  y = margin + 16;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor("#1f1e1c");
  doc.text("Scoring rubric", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(GREY);
  doc.text(
    `Each connection earns points for signals associated with fake or low-quality profiles. A connection is flagged once its score reaches ${scan.min_score}.`,
    margin,
    y + 14,
  );
  y += 28;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor("#1f1e1c");
  doc.text("Heuristic score (H) — from your export data", margin, y);
  autoTable(doc, {
    startY: y + 8,
    margin: { left: margin, right: margin },
    headStyles: { fillColor: BRAND, textColor: "#ffffff", fontStyle: "bold" },
    styles: { fontSize: 9, cellPadding: 4 },
    columnStyles: { 1: { halign: "right", cellWidth: 60 } },
    head: [["Signal", "Points"]],
    body: HEURISTIC_RUBRIC.map(([label, pts]) => [label, `+${pts}`]),
  });
  // @ts-expect-error lastAutoTable is attached by the plugin
  y = doc.lastAutoTable.finalY + 20;

  if (scan.enriched) {
    if (y > pageH - 160) {
      doc.addPage();
      y = margin;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor("#1f1e1c");
    doc.text("Enrichment score (E) — from scraped profile (Apify)", margin, y);
    autoTable(doc, {
      startY: y + 8,
      margin: { left: margin, right: margin },
      headStyles: { fillColor: BRAND, textColor: "#ffffff", fontStyle: "bold" },
      styles: { fontSize: 9, cellPadding: 4 },
      columnStyles: { 1: { halign: "right", cellWidth: 60 } },
      head: [["Signal", "Points"]],
      body: ENRICHMENT_RUBRIC.map(([label, pts]) => [label, pts]),
    });
  }

  // --- Authenticity scan --------------------------------------------------
  doc.addPage();
  y = margin + 16;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor("#1f1e1c");
  doc.text("Authenticity scan — flagged connections", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(GREY);
  doc.text(
    "H = heuristic score (export fields), E = enrichment score (scraped profile). Higher = more suspicious.",
    margin,
    y + 14,
  );

  if (flagged.length) {
    const flaggedRows = flagged.map((f) => {
      const score = f.esc != null ? `E${f.esc} / H${f.sc}` : `H${f.sc}`;
      const who = clean(`${f.n || "(blank)"}\n${(f.t || "no title") + (f.co ? ` @ ${f.co}` : "")}`);
      const reasons = (f.ers && f.ers.length ? f.ers : f.rs).join("; ");
      const trust = f.trust && f.trust.length ? `\nTrust: ${f.trust.join(", ")}` : "";
      return [score, who, clean(reasons + trust)];
    });
    autoTable(doc, {
      startY: y + 26,
      margin: { left: margin, right: margin },
      headStyles: { fillColor: BRAND, textColor: "#ffffff", fontStyle: "bold" },
      styles: { fontSize: 8.5, cellPadding: 4, valign: "top" },
      columnStyles: { 0: { cellWidth: 64 }, 1: { cellWidth: 180 } },
      head: [["Score", "Connection", "Why flagged"]],
      body: flaggedRows,
      didDrawCell: (hook) => {
        // Underline the connection's name and link it to their LinkedIn profile.
        if (hook.section !== "body" || hook.column.index !== 1) return;
        const f = flagged[hook.row.index];
        if (!f.u) return;
        const { cell } = hook;
        const padX = cell.padding("left");
        const padY = cell.padding("top");
        const fontSize = cell.styles.fontSize ?? 8.5;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(fontSize);
        const name = clean(f.n || "(blank)");
        const nameWidth = Math.min(doc.getTextWidth(name), cell.width - padX * 2);
        const lineHeight = fontSize * 1.15;
        const x = cell.x + padX;
        const yTop = cell.y + padY;
        doc.setDrawColor(BRAND);
        doc.setLineWidth(0.5);
        doc.line(x, yTop + lineHeight - 1.5, x + nameWidth, yTop + lineHeight - 1.5);
        doc.link(x, yTop, nameWidth, lineHeight, { url: f.u });
      },
    });
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor("#1f1e1c");
    doc.text("No connections met the suspicion threshold — your network looks authentic.", margin, y + 40);
  }

  // --- Footer (page numbers) on every page --------------------------------
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(GREY);
    doc.text("AI LinkedIn Analyzer — generated locally, no data transmitted", margin, pageH - 20);
    doc.text(`Page ${i} of ${pages}`, pageW - margin, pageH - 20, { align: "right" });
  }

  const iso = today.toISOString().slice(0, 10);
  doc.save(`linkedin-network-report-${iso}.pdf`);
}
