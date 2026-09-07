// Shared plumbing for the ats-search CLI: the normalized posting shape every
// connector emits, a JSON fetch with backoff, the company-list (CSV) reader, the
// client-side filters, and a small concurrency pool for fanning out across many
// company boards. Greenhouse/Lever/Ashby have no server-side query — the whole
// board is fetched and filtered locally; SmartRecruiters paginates and does take
// a server-side query, so `list()` receives the active filters as a hint.

export type AtsType = "greenhouse" | "lever" | "ashby" | "smartrecruiters";

export const ATS_TYPES: AtsType[] = ["greenhouse", "lever", "ashby", "smartrecruiters"];

/** Filters passed to a connector's `list()`. Greenhouse/Lever/Ashby ignore these
 *  (they fetch the whole board); SmartRecruiters uses them server-side and caps. */
export interface ListOpts {
  query?: string;
  location?: string;
  maxResults?: number;
}

export const USER_AGENT = "Mozilla/5.0 (compatible; ats-search-cli/1.0)";

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n");
}

/** A company from the company list. */
export interface Company {
  name: string; // display name, used as `company` on every posting
  ats: AtsType;
  slug: string; // board token / handle in the ATS URL
  priority: "high" | "normal" | "low";
}

/**
 * One job posting, normalized across all three ATSes.
 * `id` is `"{ats}:{slug}:{externalId}"` so `detail` can route it back.
 * In `search` output, `description` is null and `snippet` is a short excerpt;
 * `detail` fills `description` (and `snippet` is omitted).
 */
export interface Posting {
  id: string;
  ats: AtsType;
  slug: string;
  externalId: string;
  title: string;
  company: string;
  team: string | null;
  location: string | null;
  remote: boolean | null;
  date: string | null; // ISO 8601, or null when the source gives none
  url: string;
  comp: string | null;
  deadline: string | null;
  snippet?: string | null;
  description?: string | null;
}

/** A per-company failure, surfaced in `meta.errors` rather than aborting the run. */
export interface CompanyError {
  company: string;
  ats: AtsType;
  slug: string;
  error: string;
}

export function makeId(ats: AtsType, slug: string, externalId: string): string {
  return `${ats}:${slug}:${externalId}`;
}

/** Parse an `id` string back into its parts. `externalId` may itself contain colons. */
export function parseId(
  id: string,
): { ats: AtsType; slug: string; externalId: string } | null {
  const first = id.indexOf(":");
  const second = id.indexOf(":", first + 1);
  if (first === -1 || second === -1) return null;
  const ats = id.slice(0, first) as AtsType;
  if (!ATS_TYPES.includes(ats)) return null;
  const slug = id.slice(first + 1, second);
  const externalId = id.slice(second + 1);
  if (!slug || !externalId) return null;
  return { ats, slug, externalId };
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

/**
 * GET JSON with exponential backoff on 429/5xx. Returns `null` on 404 (an
 * unknown board slug — the caller turns that into a per-company error, never a
 * crash). Throws on a hard network failure or exhausted retries.
 */
export async function fetchJson<T>(url: string): Promise<T | null> {
  const maxRetries = 5;
  let delay = 500;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        redirect: "follow",
        signal: AbortSignal.timeout(20000),
      });
    } catch (e) {
      throw new Error(
        `could not reach ${new URL(url).host} (${e instanceof Error ? e.message : String(e)})`,
      );
    }
    if (res.status === 429 || res.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`request failed: ${res.status} ${res.statusText}`);
      }
      await sleep(delay + Math.floor(Math.random() * 400));
      delay = Math.min(delay * 2, 8000);
      continue;
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`request failed: ${res.status} ${res.statusText}`);
    return (await res.json()) as T;
  }
  throw new Error("request failed after retries");
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Company list (CSV)
// ---------------------------------------------------------------------------

export class CompanyListError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompanyListError";
  }
}

/**
 * Parse the company list. Format: `name,ats,slug[,priority]` per line; `#`
 * comments and blank lines ignored; a header row (`name,ats,slug,...`) is
 * skipped. Invalid rows throw with the line number.
 */
export function parseCompanyCsv(text: string): Company[] {
  const out: Company[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!.trim();
    if (!raw || raw.startsWith("#")) continue;
    const cols = raw.split(",").map((c) => c.trim());
    // Skip a header row wherever it sits (comment lines may precede it).
    if (cols[0]?.toLowerCase() === "name" && cols[1]?.toLowerCase() === "ats") continue;
    const [name, atsRaw, slug, priorityRaw] = cols;
    if (!name || !atsRaw || !slug) {
      throw new CompanyListError(
        `line ${i + 1}: expected "name,ats,slug[,priority]", got "${raw}"`,
      );
    }
    const ats = atsRaw.toLowerCase() as AtsType;
    if (!ATS_TYPES.includes(ats)) {
      throw new CompanyListError(
        `line ${i + 1}: unknown ats "${atsRaw}" (want one of ${ATS_TYPES.join(", ")})`,
      );
    }
    const priority = (priorityRaw?.toLowerCase() || "normal") as Company["priority"];
    if (!["high", "normal", "low"].includes(priority)) {
      throw new CompanyListError(
        `line ${i + 1}: priority must be high|normal|low, got "${priorityRaw}"`,
      );
    }
    out.push({ name, ats, slug, priority });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Client-side filters (these APIs return the whole board; we filter locally)
// ---------------------------------------------------------------------------

export interface Filters {
  query?: string; // every whitespace token must appear in the title (case-insensitive)
  location?: string; // case-insensitive substring of the posting location
  remote?: "remote" | "hybrid" | "onsite";
  jobageDays?: number; // drop postings older than N days (postings with no date are kept)
}

/** Does `p` pass every active filter? */
export function matches(p: Posting, f: Filters): boolean {
  if (f.query) {
    const hay = p.title.toLowerCase();
    for (const tok of f.query.toLowerCase().split(/\s+/).filter(Boolean)) {
      if (!hay.includes(tok)) return false;
    }
  }
  if (f.location) {
    const loc = (p.location ?? "").toLowerCase();
    if (!loc.includes(f.location.toLowerCase())) return false;
  }
  if (f.remote) {
    const locSaysRemote = /\bremote\b/i.test(p.location ?? "");
    const locSaysHybrid = /\bhybrid\b/i.test(p.location ?? "");
    if (f.remote === "remote" && !(p.remote === true || locSaysRemote)) return false;
    if (f.remote === "onsite" && (p.remote === true || locSaysRemote)) return false;
    // Hybrid is only reliably knowable from the location text across these ATSes.
    if (f.remote === "hybrid" && !locSaysHybrid) return false;
  }
  if (f.jobageDays !== undefined && p.date) {
    const ageMs = Date.now() - Date.parse(p.date);
    if (Number.isFinite(ageMs) && ageMs > f.jobageDays * 86400_000) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Concurrency
// ---------------------------------------------------------------------------

/** Run `worker` over `items` with at most `concurrency` in flight. Order preserved. */
export async function pool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i]!, i);
    }
  });
  await Promise.all(runners);
  return results;
}

// ---------------------------------------------------------------------------
// HTML → text (ATS descriptions are HTML; Greenhouse's is double-encoded)
// ---------------------------------------------------------------------------

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : "";
}

export function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => numericEntity(parseInt(d, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, h) => numericEntity(parseInt(h, 16)))
    .replace(/&nbsp;/g, " ");
}

/** Strip HTML to readable prose. `doubleEncoded` for Greenhouse's `&lt;p&gt;` content. */
export function htmlToText(
  html: string | null | undefined,
  doubleEncoded = false,
): string | null {
  if (!html) return null;
  let s = html;
  if (doubleEncoded) s = decodeEntities(s); // first pass turns &lt;p&gt; into <p>
  s = s
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  s = decodeEntities(s)
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return s || null;
}

/** First ~`n` characters of the description, single line, for a search snippet. */
export function snippetOf(text: string | null, n = 200): string | null {
  if (!text) return null;
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= n ? flat : flat.slice(0, n).replace(/\s\S*$/, "") + "…";
}
