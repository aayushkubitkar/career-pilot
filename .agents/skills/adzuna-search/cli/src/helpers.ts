// Data source: the Adzuna public jobs API (JSON). Search is broad-market
// (Adzuna aggregates company sites, boards, and recruiters). Requires a free
// key pair — ADZUNA_APP_ID + ADZUNA_APP_KEY — read only from the environment.
//
// Adzuna has NO per-posting endpoint and serves only a truncated (~200-char)
// description in search results; the full posting lives behind `redirect_url`.
// `detail` therefore only resolves/echoes that URL — see commands/detail.ts.

export const API_BASE = "https://api.adzuna.com/v1/api/jobs";
export const COUNTRY = "us";

const UA = "ats-search-cli/1.0 (adzuna-search)";

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n");
}

export class MissingCredentialsError extends Error {
  code = "MISSING_CREDENTIALS";
  constructor(missing: string[]) {
    super(
      `missing ${missing.join(" and ")} — set ${missing.join(" and ")} in the environment ` +
        `(free key at https://developer.adzuna.com). Never pass credentials as a flag.`,
    );
    this.name = "MissingCredentialsError";
  }
}

export interface Credentials {
  appId: string;
  appKey: string;
}

/** Read the Adzuna credentials from the environment or throw MissingCredentialsError. */
export function credentials(): Credentials {
  const appId = (process.env.ADZUNA_APP_ID ?? "").trim();
  const appKey = (process.env.ADZUNA_APP_KEY ?? "").trim();
  const missing: string[] = [];
  if (!appId) missing.push("ADZUNA_APP_ID");
  if (!appKey) missing.push("ADZUNA_APP_KEY");
  if (missing.length) throw new MissingCredentialsError(missing);
  return { appId, appKey };
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

export interface AdzunaSearchResponse {
  count: number;
  mean?: number;
  results: AdzunaJob[];
}

export interface AdzunaJob {
  id: string;
  title: string;
  description: string;
  created: string;
  redirect_url: string;
  company?: { display_name?: string };
  location?: { display_name?: string; area?: string[] };
  category?: { label?: string; tag?: string };
  contract_time?: string; // "full_time" | "part_time"
  contract_type?: string; // "permanent" | "contract"
  salary_min?: number;
  salary_max?: number;
  salary_is_predicted?: string; // "1" when Adzuna estimated it (not from the posting)
}

/** GET JSON from the Adzuna API with backoff on 429/5xx. Throws on hard failure. */
export async function apiGet<T>(path: string, params: URLSearchParams): Promise<T> {
  const url = `${API_BASE}/${path}?${params.toString()}`;
  const maxRetries = 5;
  let delay = 500;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        redirect: "follow",
        signal: AbortSignal.timeout(20000),
      });
    } catch (e) {
      throw new Error(`could not reach the Adzuna API (${e instanceof Error ? e.message : String(e)})`);
    }
    if (res.status === 429 || res.status >= 500) {
      if (attempt === maxRetries) throw new Error(`Adzuna API request failed: ${res.status} ${res.statusText}`);
      await new Promise((r) => setTimeout(r, delay + Math.floor(Math.random() * 400)));
      delay = Math.min(delay * 2, 8000);
      continue;
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error("Adzuna rejected the credentials (401/403) — check ADZUNA_APP_ID / ADZUNA_APP_KEY");
    }
    if (!res.ok) throw new Error(`Adzuna API request failed: ${res.status} ${res.statusText}`);
    return (await res.json()) as T;
  }
  throw new Error("Adzuna API request failed after retries");
}

// ---------------------------------------------------------------------------
// Shaping
// ---------------------------------------------------------------------------

export interface JobResult {
  id: string; // "adzuna:us:{numericId}"
  title: string;
  company: string | null;
  location: string | null;
  date: string | null;
  url: string; // redirect_url — the way to the full posting
  snippet: string | null; // Adzuna's truncated description (all its API provides)
  comp: string | null; // only when the posting stated it (salary_is_predicted !== "1")
  category: string | null;
  contract_time: string | null;
}

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : "";
}

export function stripHtml(text: string | null | undefined): string | null {
  if (!text) return null;
  const s = text
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => numericEntity(parseInt(d, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, h) => numericEntity(parseInt(h, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s || null;
}

function formatComp(j: AdzunaJob): string | null {
  if (j.salary_is_predicted === "1") return null; // Adzuna's estimate, not the posting's number
  const lo = j.salary_min;
  const hi = j.salary_max;
  if (lo == null && hi == null) return null;
  const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
  if (lo != null && hi != null && lo !== hi) return `${money(lo)}–${money(hi)}`;
  return money((lo ?? hi)!);
}

/** Extract the numeric Adzuna id from `adzuna:us:{id}`, a redirect URL, or a bare id. */
export function parseRef(input: string): string | null {
  const t = input.trim();
  let m = t.match(/^adzuna:[a-z]{2}:(\d+)$/i);
  if (m) return m[1]!;
  m = t.match(/adzuna\.com\/land\/ad\/(\d+)/i);
  if (m) return m[1]!;
  if (/^\d+$/.test(t)) return t;
  return null;
}

export function toResult(j: AdzunaJob): JobResult {
  return {
    id: `adzuna:${COUNTRY}:${j.id}`,
    title: stripHtml(j.title) ?? "(untitled)",
    company: j.company?.display_name?.trim() || null,
    location: j.location?.display_name?.trim() || null,
    date: j.created || null,
    url: j.redirect_url,
    snippet: stripHtml(j.description),
    comp: formatComp(j),
    category: j.category?.tag || null,
    contract_time: j.contract_time || null,
  };
}
