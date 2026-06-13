import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

// Bring-your-own-key Apify proxy. The user's Apify token is sent per request
// from the browser and used only to invoke the scraper — it is never stored,
// logged, or associated with their account. This keeps the privacy-first model
// (nothing persisted) while letting Apify calls run server-side to avoid CORS.

const ACTOR = "harvestapi~linkedin-profile-scraper";
const API = "https://api.apify.com/v2";
const MAX_URLS = 200; // guard against runaway scraping cost on a single request
const RUN_TIMEOUT_SECS = 280; // keep under Vercel's 300s function cap

// Allow this route to run long enough for the Apify actor to finish.
export const maxDuration = 300;

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
    // Run the actor synchronously and get its dataset items back in one request —
    // avoids manual run-polling and the bugs that come with it.
    const res = await fetch(
      `${API}/acts/${ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&clean=true&timeout=${RUN_TIMEOUT_SECS}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileScraperMode: "Profile details no email ($4 per 1k)",
          queries: urls,
        }),
      },
    );

    if (res.status === 401 || res.status === 403) {
      return NextResponse.json({ error: "Apify rejected the token (unauthorised)." }, { status: 401 });
    }
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Apify run failed (${res.status}): ${text.slice(0, 300)}` },
        { status: 502 },
      );
    }

    const items = await res.json();
    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Enrichment failed: ${message}` }, { status: 500 });
  }
}
