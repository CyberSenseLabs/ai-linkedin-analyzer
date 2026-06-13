"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "ala_apify_token";

// Collects the user's own Apify token. The key is stored only in this browser
// (localStorage) and sent per-request to our proxy, which uses it to call Apify
// and stores nothing. Nothing about the key is persisted to the user's account.
export default function ApifyKeyDialog({
  onConfirm,
  onCancel,
  count,
}: {
  onConfirm: (token: string) => void;
  onCancel: () => void;
  count: number;
}) {
  const [token, setToken] = useState("");
  const [remember, setRemember] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setToken(saved);
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  const confirm = () => {
    const t = token.trim();
    if (!t) return;
    try {
      if (remember) localStorage.setItem(STORAGE_KEY, t);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    onConfirm(t);
  };

  const estCost = (count * 0.004).toFixed(2);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: "1rem",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-background-primary)",
          border: "0.5px solid var(--color-border-secondary)",
          borderRadius: "var(--border-radius-lg)",
          padding: "1.5rem",
          maxWidth: 460,
          width: "100%",
        }}
      >
        <h3 style={{ margin: "0 0 0.5rem", fontSize: 18 }}>Enrich flagged connections via Apify</h3>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 1rem" }}>
          Enter your own Apify API token to scrape the {count} flagged public profile
          {count === 1 ? "" : "s"} for stronger fake/bot signals (connection counts, photo, history).
          Estimated cost on your Apify account: <strong>~${estCost}</strong>. Your token is stored only
          in this browser and is never saved to your account.
        </p>

        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="apify_api_xxxxxxxx"
          autoFocus
          style={{
            width: "100%",
            padding: "8px 10px",
            fontSize: 13,
            fontFamily: "monospace",
            borderRadius: "var(--border-radius-md)",
            border: "0.5px solid var(--color-border-secondary)",
            background: "var(--color-background-secondary)",
            color: "var(--color-text-primary)",
            marginBottom: 10,
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") confirm();
          }}
        />

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--color-text-secondary)", marginBottom: "1.25rem", cursor: "pointer" }}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} style={{ width: "auto" }} />
          Remember this token in my browser
        </label>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" onClick={confirm} disabled={!token.trim()}>
            Enrich ~${estCost}
          </button>
        </div>

        <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: "1rem 0 0" }}>
          Get a token at apify.com → Settings → Integrations. Scraping third-party profiles is billable
          and outward-facing — only the {count} flagged profile{count === 1 ? "" : "s"} will be sent.
        </p>
      </div>
    </div>
  );
}
