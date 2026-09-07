---
name: adzuna-search
version: 1.0.0
description: >
  Use this skill to search the broad US job market via the Adzuna aggregator's
  public API — postings pooled from company career sites, other job boards, and
  recruiters into one index. Good for discovering roles (and employers) beyond a
  curated company list: any field, any US location, or remote. Complements
  ats-search (depth on named companies) and linkedin-search. Trigger phrases:
  find a job, job search, search for jobs, job openings, jobs in <US city>,
  remote jobs, entry level / new grad jobs, "what <role> jobs are open near me".
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/adzuna-search/cli/src/cli.ts *)
---

# Adzuna Search Skill (US)

Search live US job listings from the **[Adzuna](https://www.adzuna.com)** aggregator's
public JSON API. Adzuna crawls company career pages, other boards, and recruiter feeds and
normalizes them into one schema — so this one skill gives broad-market coverage the way
`ats-search` gives depth on your target companies. **Zero runtime dependencies** (plain
`bun`).

## ⚙️ Setup — required (free key pair)

Adzuna needs a free API key pair. Sign up at <https://developer.adzuna.com>; a
"personal's App" is created automatically with an **Application ID** and an
**Application Key**. Put both in the repo-root `.env` (gitignored; Bun loads it
automatically for every skill run):

```
ADZUNA_APP_ID=xxxxxxxx
ADZUNA_APP_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Credentials are read **only** from the environment — never pass them as a flag (flags leak
into shell history and process listings). With them unset the CLI exits `1` with
`code: MISSING_CREDENTIALS`.

Adzuna's free tier is generous for a personal search (rate-limited, not billed per call).

## When to use this skill

- Cast a wide net across the whole US market by keyword + location
- Surface employers not in your `ats-search/companies.csv`
- Filter by category, recency, full-time/permanent, or a salary floor

## ⚠️ No detail endpoint

Adzuna's API has **no per-posting endpoint**, and search results carry only a **truncated
(~200-char) description**. `detail <id|url>` therefore returns the canonical posting URL and
a note, not the full text — fetch that URL (WebFetch/browser) for the full description, the
way `/scrape` Step 2 and `/apply` already handle aggregator results. The truncated snippet
in `search` output is enough for `/rank`'s first-pass scoring and `/scrape`'s fit triage.

## Commands

### Search

```bash
bun run .agents/skills/adzuna-search/cli/src/cli.ts search [-q "<keywords>"] [flags]
```

- `--query, -q <text>` — keyword match (`what`).
- `--phrase <text>` — exact-phrase match (`what_phrase`). Stricter — often returns 0; prefer `-q`.
- `--exclude <text>` — exclude postings containing these words.
- `--location, -l <text>` — `where`: a US city, state, ZIP, or `"Remote"`.
- `--distance <km>` — radius around `--location`.
- `--jobage <days>` — posted within N days.
- `--category <tag>` — Adzuna category: `it-jobs`, `engineering-jobs`, `graduate-jobs`,
  `pr-advertising-marketing-jobs`, `accounting-finance-jobs`, `scientific-qa-jobs`, … (see url-reference.md).
- `--full-time` · `--permanent` · `--salary-min <usd>`
- `--sort <mode>` — `date` (default) | `relevance` | `salary`
- `--page <n>` · `--limit, -n <n>` (Adzuna max 50) · `--format json|table|plain`

JSON is `{ meta: { count, page, total }, results: [...] }`; each result has `id`
(`adzuna:us:<n>`), `title`, `company`, `location`, `date`, `url` (the Adzuna redirect to
the real posting), `snippet`, `comp` (**only when the posting itself stated a salary** —
Adzuna's own estimates are dropped), `category`, `contract_time`.

### Detail

```bash
bun run .agents/skills/adzuna-search/cli/src/cli.ts detail <adzuna:us:ID | URL | ID>
```

Returns `{ id, url, detail_supported: false, note }`. See "No detail endpoint" above.

## Usage examples

```bash
# Software roles in NYC, last 2 weeks
bun run .agents/skills/adzuna-search/cli/src/cli.ts search -q "software engineer" -l "New York" --jobage 14 --format table

# New-grad / early-career, full-time, sorted by newest
bun run .agents/skills/adzuna-search/cli/src/cli.ts search -q "software engineer" --category graduate-jobs --full-time --format table

# Remote data roles paying at least $150k (advertised)
bun run .agents/skills/adzuna-search/cli/src/cli.ts search -q "data engineer" -l "Remote" --salary-min 150000 --sort salary --format table
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use; carries the snippet |
| `table` | Quick human scanning |
| `plain` | Compact list with URLs |

Errors go to **stderr** as `{ "error": "...", "code": "..." }`, exit `1`.

## Notes

- Data is Adzuna's public API — reads only, no per-user features touched.
- `comp` is populated **only** when `salary_is_predicted` is `"0"` (the posting stated a
  number); Adzuna's ML salary estimates are deliberately not surfaced as fact.
- Adzuna's `location.display_name` can be quirky (`"Prince, Manhattan"`) — it's their
  geocoding, passed through verbatim.
- Endpoint shapes and the full category list: `url-reference.md`.
