---
name: ats-search
version: 1.1.0
description: >
  Use this skill to search live job openings at specific US companies whose careers
  pages run on the Greenhouse, Lever, Ashby, or SmartRecruiters applicant-tracking
  systems — a single skill that fans out across a curated company list (companies.csv).
  Covers software, data, product, design, operations, and other roles at startups,
  tech companies, and large enterprises. Invoke for open positions, vacancies, and
  hiring at named companies or across a target list. Trigger phrases: find a job,
  job search, search for jobs, job openings, openings at <company>, new grad roles,
  jobs at Greenhouse/Lever/Ashby/SmartRecruiters companies, look up this job posting.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/ats-search/cli/src/cli.ts *)
---

# ATS Search Skill (Greenhouse · Lever · Ashby · SmartRecruiters)

Search live job listings straight from company career boards on four common
applicant-tracking systems. **Public, keyless JSON APIs** — no scraping, no auth,
**zero runtime dependencies** (runs with just `bun`).

Unlike a market-wide job board, an ATS board belongs to **one company**, so this skill
works off a company list you maintain: **copy `companies.example.csv` (~45 well-known US
companies — tech + consumer fintech) to `companies.csv`** next to this skill and edit it to
match your search. `companies.csv` is your local working copy (gitignored); the `.example`
is the shipped starter. Format: `name,ats,slug[,priority]`.

Greenhouse, Lever, and Ashby skew startup/tech; SmartRecruiters skews large enterprise
and industrial (Bosch, Western Digital, Experian, Avery Dennison, …) — narrower US-tech
coverage, but reaches employers the other three don't.

## When to use this skill

- Search openings across your whole target-company list, or one company, or one ATS
- Filter by title keywords, location, recency, or remote
- Pull the full description + compensation + team for a specific posting

## Finding a company's slug

The slug is the handle in the company's careers URL:

| ATS | Careers URL | slug | API it hits |
|---|---|---|---|
| Greenhouse | `job-boards.greenhouse.io/`**`stripe`** | `stripe` | `boards-api.greenhouse.io/v1/boards/stripe/jobs` |
| Lever | `jobs.lever.co/`**`spotify`** | `spotify` | `api.lever.co/v0/postings/spotify?mode=json` |
| Ashby | `jobs.ashbyhq.com/`**`ramp`** | `ramp` | `api.ashbyhq.com/posting-api/job-board/ramp` |
| SmartRecruiters | `jobs.smartrecruiters.com/`**`BoschGroup`** | `BoschGroup` **(case-sensitive)** | `api.smartrecruiters.com/v1/companies/BoschGroup/postings` |

Companies on **Workday, iCIMS, Taleo, or a bespoke portal are not supported** (no public
board API) — reach those through `linkedin-search` or `/scrape`'s WebSearch fallback.
Verify a slug before adding it:

```bash
bun run .agents/skills/ats-search/cli/src/cli.ts search --company <slug> --limit 3 --format table
```

A wrong Greenhouse/Lever/Ashby slug returns a per-company entry in `meta.errors` (404).
A wrong **SmartRecruiters** identifier returns **`meta.notes`** instead — SmartRecruiters
answers 200 with zero postings for an unknown company, so "0 postings" is a note, not an
error; double-check the identifier (case matters) at `jobs.smartrecruiters.com/<id>`.
The run continues either way.

## Commands

### Search

```bash
bun run .agents/skills/ats-search/cli/src/cli.ts search [flags]
```

- `--query, -q <text>` — keywords, matched **leniently** and scored `0..1` against the
  title + team + snippet (light stemming, so "payments" ~ "payment", "decisioning" ~
  "decision"). A posting is kept unless the query named a role type the title clearly is
  **not** (a "Software Engineer" is dropped for `-q "product manager …"`). This is the
  **/scrape-wide, /rank-deep** split: nothing real is dropped here for a wording mismatch —
  a "Transaction Risk Decisioning" PM still shows for `-q "product manager fraud"`, at a
  low score — and `/rank` does the deep title/JD fit analysis. Seniority words
  (`senior`, `staff`, `principal`, …) never gate — someone open to "PM or Senior PM" must
  still see a "Senior" posting for `-q "product manager"`.
- `--match <mode>` — `fuzzy` (default) | `strict` | `any`.
  `fuzzy` keeps every role-type match, ranked by topic-word overlap. `strict` keeps only
  titles that cover **every** topic word. `any` keeps a posting on a **single** topic-word
  (or stem) hit — the useful middle ground for a domain shortlist.
- `--min-match <0..1>` — explicit keep-threshold on `match_score`; overrides `--match`.
- `--location, -l <text>` — token-overlap match against the posting location ("New York"
  matches "New York, NY"); a remote posting always passes.
- `--remote <mode>` — `remote` | `hybrid` | `onsite`.
- `--jobage <days>` — drop postings older than N days (postings with no date are kept).
- `--ats <type>` — restrict to `greenhouse` | `lever` | `ashby` | `smartrecruiters`.
- `--company <slug[,slug]>` — restrict to these board slugs (repeatable).
- `--priority <level>` — restrict to companies you marked `high` | `normal` | `low`.
- `--page <n>` (1-indexed) · `--limit, -n <n>` (page size) · `--format json|table|plain`.
- `--companies-file <path>` — override the company-list location.

For **Greenhouse/Lever/Ashby**, the whole board is fetched and `--query` scoring +
`--location` are applied client-side. For **SmartRecruiters**, `--query` is *also* sent
server-side (its boards hold thousands) and the client-side score still applies on top; a
company searched **without** `--query` is capped at ~150 most-recent postings.

Results are sorted by company priority, then `match_score` (highest first), then newest.
JSON is `{ meta: { count, page, total, companies, match, errors, notes }, results: [...] }`;
each result has `id, ats, slug, externalId, title, company, team, location, remote, date,
url, comp, deadline, match_score` (`0..1`, only when `--query` was given), `snippet`
(missing values `null`). `date` is the posting's publish date (Greenhouse: `first_published`
→ `updated_at`; SmartRecruiters: `releasedDate`). `meta.notes` carries non-fatal signals
(a SmartRecruiters company that returned nothing).

### Detail

```bash
bun run .agents/skills/ats-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is a search result's `id` (`greenhouse:stripe:8128744`) or a Greenhouse / Lever /
Ashby job-board URL. Returns the full description, `team`, `comp`, and `deadline`
(Greenhouse postings sometimes carry `application_deadline`; Lever/Ashby rarely do).

## Usage examples

```bash
# Domain search — lenient: every PM role is returned, ranked by how well the title
# covers "risk"/"fraud"/"decisioning". Sort/skim by the MATCH column.
bun run .agents/skills/ats-search/cli/src/cli.ts search -q "product manager risk fraud decisioning" --jobage 30 --format table

# Tighter domain shortlist — role match + at least one topic word
bun run .agents/skills/ats-search/cli/src/cli.ts search -q "product manager fraud" --match any --priority high --format table

# Backend roles in NYC at your high-priority companies
bun run .agents/skills/ats-search/cli/src/cli.ts search -q "backend" -l "New York" --priority high --format table

# Everything remote on Ashby boards
bun run .agents/skills/ats-search/cli/src/cli.ts search --ats ashby --remote remote --format table

# Full detail for one posting
bun run .agents/skills/ats-search/cli/src/cli.ts detail ashby:ramp:34413f8d-26bf-4bbc-8ade-eb309a0e2245 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, feeding ids to `detail` |
| `table` | Quick human scanning |
| `plain` | Reading a single posting (`detail`) |

Errors go to **stderr** as `{ "error": "...", "code": "..." }`, exit code `1`. A single
company failing (bad slug, transient 5xx) is **not** an error — it lands in
`meta.errors` and the run continues; only a missing/unparseable company list, bad flags,
or an empty selection exit non-zero.

## Notes

- These are the ATS vendors' own public board APIs — the same JSON their careers pages
  render from. No `robots.txt` concern, no auth, but keep the company list curated (tens
  to low hundreds): each run fetches every listed board in full.
- Greenhouse's base list and SmartRecruiters' list have no description, so `search`
  snippets are `null` for those rows — `detail` fetches the body. Lever and Ashby include
  it in the list, so their `search` rows carry a `snippet`.
- Ashby has no per-posting endpoint; `detail` on an Ashby id refetches the board and
  selects the row. Greenhouse, Lever, and SmartRecruiters have real per-posting endpoints.
- SmartRecruiters returns 200 (not 404) for an unknown company — a wrong identifier shows
  as a `meta.notes` "0 postings" line, not a `meta.errors` failure.
- `id` namespaces the ATS + slug + the vendor's own id, so it's stable to store in
  `seen_jobs.json` and pass back to `detail`.
- Parsing anchors and response shapes are in `url-reference.md` for when a vendor
  changes its API.
