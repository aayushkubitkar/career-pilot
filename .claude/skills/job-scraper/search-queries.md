# Search Queries for Job Scraper

<!-- SETUP: Customize these queries based on your skills, target roles, and location -->

## Installed portal CLIs (primary for `/scrape`)

`/scrape` discovers every portal skill under `.agents/skills/*/SKILL.md` and runs its CLI first. You do **not** need a matching `site:` line below for those CLIs to run.

CareerPilot (US market) ships these **enabled**:

- **`ats-search`** — Greenhouse / Lever / Ashby company boards, fanned across
  `.agents/skills/ats-search/companies.csv`. This is the primary US source: it hits the
  ATS vendors' own public JSON APIs (no scraping), so results are clean and current.
  **Maintain `companies.csv`** — it's your target-company list. `/setup --section search`
  and `/add-portal` can help you grow it; a slug is the handle in
  `job-boards.greenhouse.io/<slug>`, `jobs.lever.co/<slug>`, or `jobs.ashbyhq.com/<slug>`.
- **`adzuna-search`** — broad US-market aggregator (company sites + boards + recruiters via
  the Adzuna API). Casts the wide net and surfaces employers not in `companies.csv`. Needs
  `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` in the repo-root `.env` (free key); `/scrape` skips it
  cleanly if unset. No per-posting detail — `/scrape` Step 2 WebFetches the result `url`.
- **`linkedin-search`** — LinkedIn public listings; pass a US location
  (`-l "San Francisco Bay Area"`, `-l "New York, NY"`, `-l "Remote"`). Personal use, low volume.
- **`freehire-search`** — multi-market tech aggregator; scope with `--region us --country US`.

The four Danish demo portals (`jobindex`, `jobnet`, `jobbank`, `jobdanmark`) ship
`enabled: false` and `/scrape` skips them — leave them off for a US search.

The `site:` query templates in this file are the **WebSearch fallback** — for boards without a CLI (companies on Workday / iCIMS / Taleo, or Indeed / built-in careers pages) and when a CLI fails.

**Language scope:** write every query category in every language listed in your CLAUDE.md Languages table (typically 1-2, sometimes more). A posting requiring a language you have *not* declared, as a job condition, is excluded before scoring; a posting requiring a *higher level* than you declared in a language you *do* work in is flagged for your own judgment, not excluded — see `04-job-evaluation.md`'s Language Gate, the single source of truth for this rule. Translate each category's keywords rather than machine-translating word-for-word (e.g. "Frontend Developer" -> "Desarrollador Frontend", not a literal word-for-word translation) if you work in more than one language.

## Search Sites (WebSearch fallback only)

US boards without a CLI here — use `site:` queries against these:
- **linkedin.com/jobs** - also covered by the `linkedin-search` CLI (prefer the CLI)
- **boards.greenhouse.io** / **job-boards.greenhouse.io** - for a company not yet in `companies.csv`
- **jobs.lever.co**, **jobs.ashbyhq.com** - same
- **jobs.smartrecruiters.com** - SmartRecruiters boards (no CLI yet)
- **builtin.com**, **[YOUR_INDUSTRY_JOB_BOARD]** - niche/industry boards for your field (optional)
- **usajobs.gov** - federal roles (optional; a dedicated CLI is planned)

Secondary (company career pages via Google):
- Direct `site:` searches for target companies on Workday / iCIMS / Taleo (no public API)

## Query Categories

Queries are grouped by priority. Write **each category in every language from your Languages table** (see Language scope above). Combine each query with your location terms (e.g. your city, region, or metro area) where the site supports it.

**Organize by function, not job title.** The same underlying work carries different titles across companies and markets (a "Data Scientist" role at one employer may be posted as "Insights Analyst" or "Data Consultant" at another). Name each priority category after the function it covers, and list several plausible job titles as query variants within that category rather than betting an entire priority tier on one exact title string.

### Priority 1: [YOUR_PRIMARY_ROLE_TYPE]

These match your strongest and most desired career direction.

```
site:[YOUR_JOB_BOARD] "[YOUR_PRIMARY_JOB_TITLE_1]" [YOUR_CITY]
site:[YOUR_JOB_BOARD] "[YOUR_PRIMARY_JOB_TITLE_2]" [YOUR_CITY]
site:[YOUR_JOB_BOARD] "[YOUR_KEY_SKILL]" [YOUR_CITY]
site:linkedin.com/jobs "[YOUR_PRIMARY_JOB_TITLE_1]" [YOUR_COUNTRY]
```

### Priority 2: [YOUR_DOMAIN_EXPERTISE]

These match your domain expertise.

```
site:[YOUR_JOB_BOARD] [YOUR_DOMAIN_KEYWORD_1] [YOUR_CITY] OR [YOUR_REGION]
site:[YOUR_JOB_BOARD] [YOUR_DOMAIN_KEYWORD_2] [YOUR_COUNTRY]
site:linkedin.com/jobs [YOUR_DOMAIN_KEYWORD_1] [YOUR_CITY] [YOUR_COUNTRY]
```

### Priority 3: [YOUR_ADJACENT_ROLE_TYPE]

Adjacent roles you could pivot into.

```
site:[YOUR_JOB_BOARD] "[YOUR_ADJACENT_TITLE_1]" [YOUR_KEY_SKILL] [YOUR_CITY]
site:[YOUR_JOB_BOARD] "[YOUR_ADJACENT_TITLE_2]" [YOUR_KEY_SKILL] [YOUR_CITY]
```

### Priority 4: Broader Technical / Consulting

Wider net for general technical roles.

```
site:[YOUR_JOB_BOARD] [YOUR_KEY_SKILL] developer [YOUR_CITY]
site:linkedin.com/jobs "[YOUR_KEY_SKILL] developer" [YOUR_CITY]
site:[YOUR_JOB_BOARD] "technical consultant" [YOUR_DOMAIN] [YOUR_CITY]
```

## Location Filter

When evaluating results, verify the job location is within reasonable commute distance from your home. Define acceptable areas:
- [YOUR_CITY] and surrounding areas
- [ACCEPTABLE_AREA_1]
- [ACCEPTABLE_AREA_2]
- [BORDERLINE_AREA] (borderline - ~X min by transit)
- [TOO_FAR_AREA] (too far)

## Language Filter

Your working languages and levels are in CLAUDE.md's Languages table. When filtering scraped results, apply `04-job-evaluation.md`'s Language Gate: a posting requiring a language you haven't declared at all is excluded; a posting requiring a higher level than you declared in a language you do work in is not excluded, flag it clearly instead (see `job-scraper/SKILL.md`'s Step 3 "Quick Fit Assessment" for how the flag surfaces in `/scrape` output). Postings simply *written* in a language you don't work in, that don't require it on the job, are fine.

## Date Filter

Only include jobs posted within the last 14 days, or with an application deadline that has not yet passed. If a posting date cannot be determined, include it but flag as "date unknown".

## Adapting Queries

If the user specifies a focus area, select queries from the matching category and also generate 2-3 custom queries for that focus. For example:
- "/scrape [focus_area]" -> relevant category queries + custom focus-specific queries
