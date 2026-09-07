---
name: ats-search
version: 1.0.0
description: >
  Use this skill to search live job openings at specific US companies whose careers
  pages run on the Greenhouse, Lever, or Ashby applicant-tracking systems — a single
  skill that fans out across a curated company list (companies.csv). Covers software,
  data, product, design, operations, and other roles at startups and tech companies.
  Invoke for open positions, vacancies, and hiring at named companies or across a
  target list. Trigger phrases: find a job, job search, search for jobs, job openings,
  openings at <company>, new grad roles, jobs at Greenhouse/Lever/Ashby companies,
  look up this Greenhouse/Lever/Ashby job posting.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/ats-search/cli/src/cli.ts *)
---

# ATS Search Skill (Greenhouse · Lever · Ashby)

Search live job listings straight from company career boards on the three most common
startup/tech applicant-tracking systems. **Public, keyless JSON APIs** — no scraping, no
auth, **zero runtime dependencies** (runs with just `bun`).

Unlike a market-wide job board, an ATS board belongs to **one company**, so this skill
works off a company list you maintain: `companies.csv` next to this skill
(`name,ats,slug[,priority]`). It ships pre-populated with ~25 well-known US companies;
edit it to match your search. `companies.example.csv` is the annotated reference.

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

Companies on **Workday, iCIMS, Taleo, SmartRecruiters, or a bespoke portal are not
supported** (no public board API) — reach those through `linkedin-search` or `/scrape`'s
WebSearch fallback. Verify a slug before adding it:

```bash
bun run .agents/skills/ats-search/cli/src/cli.ts search --company <slug> --limit 3 --format table
```

A wrong slug returns a per-company error in `meta.errors` (the run continues).

## Commands

### Search

```bash
bun run .agents/skills/ats-search/cli/src/cli.ts search [flags]
```

- `--query, -q <text>` — every word must appear in the job **title** (case-insensitive).
  These APIs have no server-side keyword search; filtering is client-side on the title.
- `--location, -l <text>` — case-insensitive substring of the posting location.
- `--remote <mode>` — `remote` | `hybrid` | `onsite`.
- `--jobage <days>` — drop postings older than N days (postings with no date are kept).
- `--ats <type>` — restrict to `greenhouse` | `lever` | `ashby`.
- `--company <slug[,slug]>` — restrict to these board slugs (repeatable).
- `--priority <level>` — restrict to companies you marked `high` | `normal` | `low`.
- `--page <n>` (1-indexed) · `--limit, -n <n>` (page size) · `--format json|table|plain`.
- `--companies-file <path>` — override the company-list location.

Results are sorted by company priority, then newest first. JSON is
`{ meta: { count, page, total, companies, errors }, results: [...] }`; each result has
`id, ats, slug, externalId, title, company, team, location, remote, date, url, comp,
deadline, snippet` (missing values `null`). `date` is the posting's publish date
(Greenhouse: `first_published`, falling back to `updated_at`).

### Detail

```bash
bun run .agents/skills/ats-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is a search result's `id` (`greenhouse:stripe:8128744`) or a Greenhouse / Lever /
Ashby job-board URL. Returns the full description, `team`, `comp`, and `deadline`
(Greenhouse postings sometimes carry `application_deadline`; Lever/Ashby rarely do).

## Usage examples

```bash
# New-grad software roles across the whole list, last 30 days
bun run .agents/skills/ats-search/cli/src/cli.ts search -q "software engineer" --jobage 30 --format table

# Backend roles in NYC at your high-priority companies
bun run .agents/skills/ats-search/cli/src/cli.ts search -q "backend" -l "New York" --priority high --format table

# Everything remote on Ashby boards
bun run .agents/skills/ats-search/cli/src/cli.ts search --ats ashby --remote remote --format table

# Just one company
bun run .agents/skills/ats-search/cli/src/cli.ts search --company anthropic -q "research engineer" --format table

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
- Greenhouse's base list has no description, so `search` snippets are `null` for
  Greenhouse rows — `detail` fetches the body. Lever and Ashby include it in the list,
  so their `search` rows carry a `snippet`.
- Ashby has no per-posting endpoint; `detail` on an Ashby id refetches the board and
  selects the row.
- `id` namespaces the ATS + slug + the vendor's own id, so it's stable to store in
  `seen_jobs.json` and pass back to `detail`.
- Parsing anchors and response shapes are in `url-reference.md` for when a vendor
  changes its API.
