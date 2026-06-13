// Shared types for the analyzer. A "record" is one row of LinkedIn's
// Connections.csv keyed by its column headers.
export type ConnectionRecord = Record<string, string>;

export interface Person {
  /** Full name */
  n: string;
  /** Title / position (truncated) */
  t: string;
  /** Connection year (e.g. "2024"), may be empty */
  y: string;
  /** Profile URL */
  u: string;
  /** Role category (see ROLE_MAP) */
  c: string;
}

/** Company name -> list of connected people. */
export type PeopleByCompany = Record<string, Person[]>;

export interface FlaggedConnection {
  n: string;
  u: string;
  /** Company */
  co: string;
  /** Title */
  t: string;
  /** Connected-on date string */
  d: string;
  /** Heuristic score */
  sc: number;
  /** Heuristic reasons */
  rs: string[];
  /** Enrichment score (null until enriched) */
  esc: number | null;
  /** Enrichment reasons (null until enriched) */
  ers: string[] | null;
  /** Positive trust signals from enrichment (null until enriched) */
  trust: string[] | null;
}

export interface ScanSummary {
  total: number;
  flagged: number;
  redacted: number;
  enriched: number;
  min_score: number;
}

export interface DashboardData {
  people: PeopleByCompany;
  flagged: FlaggedConnection[];
  scan: ScanSummary;
}
