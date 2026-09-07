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
  /** 0..1 relevance to `--query` (present only when a query was given). See scoreQuery(). */
  match_score?: number;
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
  // `query` is scored, not gated — see scoreQuery(). Hard gates below.
  location?: string; // token-overlap match against the posting location (remote always passes)
  remote?: "remote" | "hybrid" | "onsite";
  jobageDays?: number; // drop postings older than N days (postings with no date are kept)
}

const tokenize = (s: string): string[] => (s.toLowerCase().match(/[a-z0-9]+/g) ?? []);
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Hard gates: location, remote, job age. `query` is scored separately (scoreQuery). */
export function matches(p: Posting, f: Filters): boolean {
  if (f.location) {
    const loc = (p.location ?? "").toLowerCase();
    const remoteOk = p.remote === true || /\bremote\b/.test(loc);
    const qToks = tokenize(f.location).filter((t) => !["remote", "hybrid", "onsite", "us", "usa"].includes(t));
    // Pass if the posting is remote, or shares a meaningful location token
    // ("new york" matches "New York, NY"), or the raw substring is present.
    const overlap =
      qToks.length === 0 ||
      loc.includes(f.location.toLowerCase()) ||
      qToks.some((t) => new RegExp(`\\b${escapeRe(t)}`).test(loc));
    if (!overlap && !remoteOk) return false;
  }
  if (f.remote) {
    const locSaysRemote = /\bremote\b/i.test(p.location ?? "");
    const locSaysHybrid = /\bhybrid\b/i.test(p.location ?? "");
    if (f.remote === "remote" && !(p.remote === true || locSaysRemote)) return false;
    if (f.remote === "onsite" && (p.remote === true || locSaysRemote)) return false;
    if (f.remote === "hybrid" && !locSaysHybrid) return false;
  }
  if (f.jobageDays !== undefined && p.date) {
    const ageMs = Date.now() - Date.parse(p.date);
    if (Number.isFinite(ageMs) && ageMs > f.jobageDays * 86400_000) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Fuzzy query matching — lenient at the /scrape stage, so no real role is
// dropped for a wording mismatch (a "Transaction Risk Decisioning" PM is not
// titled "...Fraud"). scoreQuery() returns 0..1; /rank does the deep filtering.
// ---------------------------------------------------------------------------

export type MatchMode = "fuzzy" | "strict" | "any";

// Query words that name the *role* — the title must plausibly be this kind of role.
const ROLE_CORE = new Set(["product", "manager", "mgr", "management", "pm", "owner"]);
// Query words that name a *level* — never gate on these (they cause false negatives:
// someone open to "PM or Senior PM" must still see a "Senior" posting for `-q "product manager"`).
const SENIORITY = new Set([
  "senior", "sr", "junior", "jr", "staff", "principal", "lead", "associate", "group",
  "head", "vp", "director", "entry", "mid", "level", "i", "ii", "iii", "iv", "apm", "gpm", "tpm",
]);
// Titles that are a product role by words but usually a different function.
const OFF_FUNCTION = /\b(marketing|design(er)?|program|engineering|research|community|operations|ops|sales|data|content|brand|growth marketing)\b/;

/** Light stemmer: strip a common English suffix so "payments" ~ "payment", "decisioning" ~ "decision". */
export function stemLite(tok: string): string {
  const s = tok.replace(/(ings?|ed|es|s)$/, "");
  return s.length >= 3 ? s : tok;
}

function hayHasTopic(hay: string, tok: string): boolean {
  if (hay.includes(tok)) return true;
  const stem = stemLite(tok);
  return stem !== tok && new RegExp(`\\b${escapeRe(stem)}`).test(hay);
}

/**
 * Score a posting against `query`, 0..1.
 * - 0        : the query named a role type and the title isn't that role
 * - ~0.35-1  : role matches; value scales with how many *topic* words are present
 *              in title / team / snippet (stemmed). Off-function titles
 *              ("Product Marketing Manager") are penalised, not excluded.
 * - 1        : query had no topic words (e.g. "senior product manager"), role matches
 */
export function scoreQuery(p: Posting, query: string): number {
  const q = tokenize(query);
  if (q.length === 0) return 1;
  const roleToks = q.filter((t) => ROLE_CORE.has(t));
  const topicToks = [...new Set(q.filter((t) => !ROLE_CORE.has(t) && !SENIORITY.has(t)))];
  const title = p.title.toLowerCase();

  if (roleToks.length > 0) {
    const wantsProduct = roleToks.includes("product");
    const wantsMgr = roleToks.some((t) => t !== "product");
    const titleHasProduct = /\bproduct\b/.test(title);
    const titleHasMgr = /\b(manager|mgr|management|pm|owner|lead)\b/.test(title) || /\bhead of product\b/.test(title);
    if (wantsProduct && !titleHasProduct) return 0;
    if (wantsMgr && !titleHasMgr) return 0;
  }

  const hay = [p.title, p.team ?? "", p.snippet ?? ""].join(" ").toLowerCase();
  let score: number;
  if (topicToks.length === 0) {
    score = 1; // query was only role/level words
  } else {
    const hits = topicToks.filter((t) => hayHasTopic(hay, t)).length;
    // 0 topic hits but a genuine PM title still scores 0.2 — kept by `fuzzy`
    // (nothing left behind), dropped by `any`/`strict`. ≥1 hit lifts it well clear.
    score = hits === 0 ? 0.2 : 0.4 + 0.6 * (hits / topicToks.length);
  }
  if (OFF_FUNCTION.test(title)) score *= 0.5;
  return Math.round(score * 100) / 100;
}

/**
 * Keep-threshold per mode:
 *  - fuzzy  (default): 0.01 — every genuine PM role is kept; sort/filter on match_score
 *  - any            : 0.36 — role match plus at least one topic word (or stem)
 *  - strict         : full topic coverage only
 */
export function matchThreshold(mode: MatchMode): number {
  return mode === "strict" ? 0.999 : mode === "any" ? 0.36 : 0.01;
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
