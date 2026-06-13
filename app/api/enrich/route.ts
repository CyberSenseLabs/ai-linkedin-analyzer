import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

// Bring-your-own-key Apify proxy. The user's Apify token is sent per request
// from the browser and used only to invoke the scraper — it is never stored,
// logged, or associated with their account. This keeps the privacy-first model
// (nothing persisted) while letting Apify calls run server-side to avoid CORS.

const ACTOR = "harvestapi~linkedin-profile-scraper";
const API = "https://api.apify.com/v2";
const MAX_URLS = 200; // guard against runaway scraping cost on a single request
const POLL_INTERVAL_MS = 4000;
const MAX_POLLS = 60; // ~4 minutes

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: { token?: string; urls?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const token = (body.token || "").trim();
  const urls = Array.isArray(body.urls) ? body.urls.filter((u) => typeof u === "string" && u) : [];

  if (!token) {
    return NextResponse.json({ error: "Missing Apify token." }, { status: 400 });
  }
  if (!urls.length) {
    return NextResponse.json({ error: "No profile URLs provided." }, { status: 400 });
  }
  if (urls.length > MAX_URLS) {
    return NextResponse.json(
      { error: `Too many URLs (${urls.length}). Limit is ${MAX_URLS} per request.` },
      { status: 400 },
    );
  }

  try {
    // Start the actor run.
    const startRes = await fetch(`${API}/acts/${ACTOR}/runs?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileScraperMode: "Profile details no email ($4 per 1k)",
        queries: urls,
      }),
    });

    if (startRes.status === 401 || startRes.status === 403) {
      return NextResponse.json({ error: "Apify rejected the token (unauthorised)." }, { status: 401 });
    }
    if (!startRes.ok) {
      const text = await startRes.text();
      return NextResponse.json(
        { error: `Apify failed to start the run (${startRes.status}): ${text.slice(0, 300)}` },
        { status: 502 },
      );
    }

    const run = (await startRes.json()).data;
    const runId: string = run.id;
    const datasetId: string = run.defaultDatasetId;

    // Poll until the run finishes (or we hit the cap).
    let status = run.status;
    for (let i = 0; i < MAX_POLLS && !["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(status); i++) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      const sRes = await fetch(`${API}/actor-runs/${runId}?token=${encodeURIComponent(token)}`);
      if (!sRes.ok) break;
      status = (await sRes.json()).data.status;
    }

    if (status !== "SUCCEEDED") {
      return NextResponse.json(
        { error: `Apify run did not succeed (status: ${status}).` },
        { status: 504 },
      );
    }

    const itemsRes = await fetch(
      `${API}/datasets/${datasetId}/items?token=${encodeURIComponent(token)}&clean=true`,
    );
    if (!itemsRes.ok) {
      return NextResponse.json({ error: "Failed to fetch enrichment results from Apify." }, { status: 502 });
    }
    const items = await itemsRes.json();

    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Enrichment failed: ${message}` }, { status: 500 });
  }
}
