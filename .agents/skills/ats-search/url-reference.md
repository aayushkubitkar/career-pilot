# ats-search — endpoint reference

Maintenance notes for when Greenhouse, Lever, Ashby, or SmartRecruiters changes its public
board API. All four are unauthenticated JSON. Connector code: `cli/src/connectors/<ats>.ts`.

---

## Greenhouse — Boards API

Docs: <https://developers.greenhouse.io/job-board.html>

| Purpose | Request |
|---|---|
| List | `GET https://boards-api.greenhouse.io/v1/boards/{slug}/jobs` |
| List + descriptions | `…/jobs?content=true` (heavy — full HTML per job) |
| One job | `GET https://boards-api.greenhouse.io/v1/boards/{slug}/jobs/{id}?questions=false` |

`{slug}` = the board token (careers URL is `job-boards.greenhouse.io/{slug}` or
`boards.greenhouse.io/{slug}`). Unknown slug → **404**.

List response: `{ "jobs": [ … ], "meta": { "total": N } }`. Per-job fields used:

| Field | Notes |
|---|---|
| `id` | numeric; our `externalId` is `String(id)` |
| `title` | may have leading/trailing whitespace — trim |
| `location.name` | free text; remote is inferred from `/\bremote\b/i` |
| `absolute_url` | our `url` (often a `…/jobs/search?gh_jid=<id>` link on the company's own site) |
| `first_published` | our `date` (preferred) |
| `updated_at` | our `date` fallback |
| `application_deadline` | usually `null`; carried when present |
| `content` | **double-encoded** HTML (`&lt;p&gt;…`) — only on `?content=true` and the per-job endpoint. `htmlToText(content, true)` |
| `departments[].name` | our `team` (joined with `, `) — only on `?content=true` / per-job |

The base list has **no** `content` or `departments`; that's why Greenhouse `search`
snippets are `null` and `detail` uses the per-job endpoint.

---

## Lever — Postings API

Docs: <https://github.com/lever/postings-api>

| Purpose | Request |
|---|---|
| List | `GET https://api.lever.co/v0/postings/{slug}?mode=json` |
| One posting | `GET https://api.lever.co/v0/postings/{slug}/{id}?mode=json` |

`{slug}` = careers URL handle (`jobs.lever.co/{slug}`). Unknown slug → **404**.
List response is a **bare array** (no envelope). Fields used:

| Field | Notes |
|---|---|
| `id` | UUID → `externalId` |
| `text` | job title |
| `categories.location` | our `location` (fallback `categories.allLocations[0]`) |
| `categories.team` / `.department` | our `team` |
| `workplaceType` | `"remote"` → `remote:true`, `"on-site"` → `false`, else `null` |
| `createdAt` | epoch **milliseconds** → `new Date(ms).toISOString()` |
| `hostedUrl` | our `url` |
| `descriptionPlain` + `lists[]` + `additionalPlain` | assembled into the full description; `lists[].content` is HTML `<li>` bullets |

No compensation or deadline in the API.

---

## Ashby — Job Board API

Docs: <https://developers.ashbyhq.com/reference/postingapi>

| Purpose | Request |
|---|---|
| List (only endpoint) | `GET https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true` |

`{slug}` = careers URL handle (`jobs.ashbyhq.com/{slug}`), case-insensitive in practice.
Unknown slug → **404**. Response: `{ "jobs": [ … ] }`. **No per-posting endpoint** — the
list already carries `descriptionPlain` in full, so `detail` refetches and filters.

| Field | Notes |
|---|---|
| `id` | UUID → `externalId` |
| `title` | often has a leading space — trim |
| `isListed` | filter to `!== false` |
| `isRemote` | boolean → our `remote` (kept as `false`, not coerced to `null`) |
| `location` | our `location`; `secondaryLocations[]` also exists (not currently used) |
| `team` / `department` | our `team` |
| `publishedAt` | ISO → our `date` |
| `jobUrl` | our `url` |
| `descriptionPlain` | full text (also `descriptionHtml`) |
| `compensation.compensationTierSummary` | our `comp` (fallback `scrapeableCompensationSalarySummary`); only with `includeCompensation=true` |

---

## SmartRecruiters — Posting API

Docs: <https://developers.smartrecruiters.com/reference/postingapisearch>

| Purpose | Request |
|---|---|
| List | `GET https://api.smartrecruiters.com/v1/companies/{id}/postings?q=&country=us&limit={≤100}&offset={n}` |
| One posting | `GET https://api.smartrecruiters.com/v1/companies/{id}/postings/{postingId}` |

`{id}` = careers URL handle (`jobs.smartrecruiters.com/{id}`), **case-sensitive**
(`BoschGroup`, not `boschgroup`). **Unknown company → HTTP 200 with `totalFound: 0`**, not
404 — the connector flags an unfiltered empty result as a `soft` error (→ `meta.notes`).

**Paginated** — unlike the other three, the whole board is not one call. Response:
`{ offset, limit, totalFound, content: [ … ] }`. The connector pages by `PAGE=100` and
stops at `maxResults` (default 150 when no `q`). It always sends `country=us`; a
city-shaped `--location` is passed as `city=`.

List item fields used:

| Field | Notes |
|---|---|
| `id` | numeric string → `externalId` |
| `name` | title (trim) |
| `releasedDate` | ISO → our `date` |
| `location.{city,region,country,remote,hybrid,fullLocation}` | `fullLocation` preferred; consecutive duplicate segments collapsed ("United States, United States") |
| `department.label` / `function.label` | our `team` |
| — | no `postingUrl` in the list; `url` is built as `https://jobs.smartrecruiters.com/{id}/{postingId}` (verified to resolve) |

Detail (`/postings/{postingId}`) adds `postingUrl`, `applyUrl`, and
`jobAd.sections.{companyDescription,jobDescription,qualifications,additionalInformation}`
(each `{title, text}` with HTML `text`). The connector folds jobDescription +
qualifications + additionalInformation into `description`.

No compensation or deadline in the API.

---

## Shared

- `id` format: `"{ats}:{slug}:{externalId}"`. `externalId` may contain colons (rare); the
  parser splits on the first two colons only.
- HTTP: `User-Agent: Mozilla/5.0 (compatible; ats-search-cli/1.0)`, `Accept: application/json`,
  20s timeout, exp backoff (max 5 retries) on 429/5xx, `null` on 404, throw on hard failure.
- Greenhouse/Lever/Ashby take no keyword or date parameter — `--query`, `--location`,
  `--jobage`, `--remote` are applied client-side after fetching each board in full.
  SmartRecruiters takes `q` (server-side) + `country`/`city`; the client-side filters still
  run on top for consistency.
