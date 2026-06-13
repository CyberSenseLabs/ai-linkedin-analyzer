// Tier-2 enrichment scoring — ported from scripts/scoring.py (enrichment_score).
// Operates on a scraped profile object from the Apify
// harvestapi/linkedin-profile-scraper actor. These are the strong fake/bot
// signals a plain LinkedIn export can't provide.

const LOW_CONNECTIONS = 50;
const LOW_FOLLOWERS = 50;

const ENRICH_WEIGHTS = {
  very_low_connections: 3,
  low_connections: 1,
  very_few_followers: 1,
  no_photo: 2,
  no_history: 3,
  no_experience_or_education: 1,
  no_headline: 1,
  no_about_or_skills: 1,
  // trust offsets (negative)
  premium: -1,
  influencer: -1,
  many_certs: -1,
  many_connections: -1,
};

export interface ScrapedProfile {
  linkedinUrl?: string;
  url?: string;
  publicIdentifier?: string;
  firstName?: string;
  lastName?: string;
  headline?: string;
  about?: string;
  connectionsCount?: number;
  connections?: number;
  followerCount?: number;
  followers?: number;
  photo?: string;
  profilePicture?: string;
  premium?: boolean;
  influencer?: boolean;
  experience?: unknown[];
  education?: unknown[];
  certifications?: unknown[];
  skills?: unknown[];
  [key: string]: unknown;
}

export interface EnrichmentResult {
  score: number;
  name: string;
  reasons: string[];
  trust: string[];
  connections: number;
  hasPhoto: boolean;
}

function first<T>(obj: Record<string, unknown>, ...keys: string[]): T | null {
  for (const k of keys) {
    const v = obj[k];
    if (v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)) {
      return v as T;
    }
  }
  return null;
}

export function enrichmentScore(p: ScrapedProfile): EnrichmentResult {
  const W = ENRICH_WEIGHTS;
  const name = `${(p.firstName || "").trim()} ${(p.lastName || "").trim()}`.trim();
  const conns = first<number>(p, "connectionsCount", "connections") || 0;
  const followers = first<number>(p, "followerCount", "followers") || 0;
  const photo = first<string>(p, "photo", "profilePicture");
  const headline = (p.headline || "").trim();
  const about = p.about || "";
  const experience = p.experience || [];
  const education = p.education || [];
  const certs = p.certifications || [];
  const skills = p.skills || [];

  let pts = 0;
  const reasons: string[] = [];
  const trust: string[] = [];

  if (conns < LOW_CONNECTIONS) {
    pts += W.very_low_connections;
    reasons.push(`very low connections (${conns})`);
  } else if (conns < 150) {
    pts += W.low_connections;
    reasons.push(`low connections (${conns})`);
  }
  if (followers < LOW_FOLLOWERS) {
    pts += W.very_few_followers;
    reasons.push(`very few followers (${followers})`);
  }
  if (!photo) {
    pts += W.no_photo;
    reasons.push("no profile photo");
  }
  if (!experience.length && !education.length && !certs.length) {
    pts += W.no_history;
    reasons.push("no experience, education or certifications");
  } else if (!experience.length && !education.length) {
    pts += W.no_experience_or_education;
    reasons.push("no experience or education listed");
  }
  if (!headline) {
    pts += W.no_headline;
    reasons.push("no headline");
  }
  if (!about && !skills.length) {
    pts += W.no_about_or_skills;
    reasons.push("no about section or skills");
  }

  if (p.premium) {
    pts += W.premium;
    trust.push("LinkedIn Premium");
  }
  if (p.influencer) {
    pts += W.influencer;
    trust.push("Influencer badge");
  }
  if (certs.length >= 3) {
    pts += W.many_certs;
    trust.push(`${certs.length} certifications`);
  }
  if (conns >= 500) {
    pts += W.many_connections;
    trust.push(`${conns}+ connections`);
  }
  if (skills.length >= 5) {
    trust.push(`${skills.length} skills`);
  }

  return { score: Math.max(0, pts), name, reasons, trust, connections: conns, hasPhoto: !!photo };
}

// Match a scraped profile back to a connection URL (URLs vary in trailing
// slash / query, so compare on the public identifier slug).
export function profileSlug(url: string): string {
  const m = (url || "").match(/\/in\/([^/?#]+)/i);
  return m ? m[1].toLowerCase() : (url || "").toLowerCase();
}
