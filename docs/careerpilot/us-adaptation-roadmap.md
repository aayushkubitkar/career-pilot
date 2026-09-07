# CareerPilot — US Adaptation Roadmap

Live plan. Built on `ai-job-search` v1.7.1 (see [`../../CAREERPILOT.md`](../../CAREERPILOT.md)).
Each phase ships a slice that leaves `/scrape` → `/rank` → `/apply` → `/interview` working.

Principle: **change the market layer, leave the engine.** Prefer adapting an upstream
methodology file or generating a portal skill over forking core command logic — every line
of core we diverge on is a line we merge-conflict on at the next release.

---

## Phase A — Adopt & orient  ✅ (2026-09-06)

- [x] Vendor upstream v1.7.1 with full history; `upstream` remote; `master` on top of the tag
- [x] `CAREERPILOT.md` charter, `docs/careerpilot/` (this file + historical SPEC)
- [x] Retired the standalone TS/SQLite Phase 0 (archived outside the repo)

`/setup`, `/scrape` (LinkedIn + freehire only), `/apply`, `/interview` all run as-is today.

---

## Phase B — US discovery

Goal: `/scrape` returns real, current US openings.

### B1. `ats-search` skill (Greenhouse + Lever + Ashby, one skill) ✅ (2026-09-07, commit e45d4de)

Delivered as specced. `.agents/skills/ats-search/` — zero-dep bun CLI, `search`/`detail`,
fans across `companies.csv` (ships ~25 verified US companies), per-company error isolation,
37 offline tests, live-verified against all three APIs. Notes:
- Company list lives at `.agents/skills/ats-search/companies.csv` (+ `.example.csv`), not
  `documents/` — it's config, not career material, and ships populated so the skill works
  out of the box.
- `id` format is `{ats}:{slug}:{externalId}`.
- Greenhouse `search` snippets are null (base list has no body); Lever/Ashby carry one.
- Wire-up done: `settings.json` + `security_guards.py` allowlist, US `search-queries.md`.
  The four Danish portals already ship `enabled: false` upstream — nothing to disable.

### B1 spec (as built)

ATS job boards are **company-scoped, not market-scoped**, so a single skill that fans out
across a user-maintained company list beats one skill per ATS.

- New `.agents/skills/ats-search/` following the portal-skill contract in
  [`.claude/commands/add-portal.md`](../../.claude/commands/add-portal.md) (commands
  `search` / `detail`, flags `-q --location --jobage --limit --format`, JSON shape
  `{meta, results:[{id,title,company,location,date,url}]}`, stderr errors, zero deps, bun).
- Reads a tracked company list: `documents/target_companies.csv`
  (`name,ats,board_slug,priority,notes`). A `.gitkeep`'d `documents/target_companies.example.csv`
  ships; the real file is the user's.
- Endpoints (all keyless, public):
  - Greenhouse: `GET https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true`
    → `jobs[].{id,title,location.name,absolute_url,updated_at,content}` (HTML-escaped).
    Detail: `.../embed/job?for={slug}&id={id}` or `.../boards/{slug}/jobs/{id}`.
  - Lever: `GET https://api.lever.co/v0/postings/{slug}?mode=json`
    → `[].{id,text,categories.{team,location,commitment},workplaceType,descriptionPlain,hostedUrl,createdAt}`.
  - Ashby: `GET https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true`
    → `jobs[].{id,title,location,department,employmentType,isRemote,compensation,jobUrl,publishedAt,descriptionPlain}`.
- None of the three take a keyword param — `--query` filters client-side against
  title + (when cheap) content. `--jobage` filters on the posting's own date field.
- `id` is namespaced `"{ats}:{slug}:{externalId}"` so `detail` can route.
- `search` with no `--company` fans across every row in the CSV, in parallel, per-host
  throttle, skip a company on error and continue.
- Tests: fixture JSON per ATS → expected normalized `results`; bad slug → empty + logged;
  client-side `--query` / `--jobage` filtering.

### B2. `usajobs-search` skill (federal)

- `GET https://data.usajobs.gov/api/search?Keyword=&LocationName=&ResultsPerPage=`
  headers `Host: data.usajobs.gov`, `User-Agent: <your email>`, `Authorization-Key: <key>`.
- Credential per the contract: `USAJOBS_API_TOKEN` env var (+ `USAJOBS_USER_AGENT` email);
  missing → exit 1, `code: MISSING_CREDENTIALS`. Free key at developer.usajobs.gov.
- Map `SearchResult.SearchResultItems[].MatchedObjectDescriptor` →
  `{id:PositionID, title:PositionTitle, company:OrganizationName,
  location:PositionLocationDisplay, date:PublicationStartDate, url:PositionURI}`.
  Detail adds `UserArea.Details.{JobSummary,MajorDuties,Requirements,Qualifications}`.

### B3. `adzuna-search` skill (broad aggregator) ✅ (2026-09-07, commit 80a033f)

Delivered. Zero-dep bun CLI, `search` + `detail`, `ADZUNA_APP_ID`/`ADZUNA_APP_KEY` from
env (repo-root `.env`, bun-autoloaded). 20 offline tests, live-verified with the user's key.
Deviations found in build:
- **No per-posting endpoint** and search descriptions are truncated to ~200 chars.
  `detail` returns `{id, url, detail_supported:false, note}` — `/scrape` Step 2 WebFetches
  the `url` for the body. Documented in SKILL.md + url-reference.md.
- `comp` surfaced only when `salary_is_predicted === "0"` (posting stated it); Adzuna's ML
  salary estimates are dropped.
- Env vars documented in each SKILL.md "Setup" + `CAREERPILOT.md`, not a committed
  `.env.example` (the repo's `.gitignore` treats `.env.*` as a required-ignore rule).

### B4. Wire-up

- [x] `.claude/settings.json` + `tools/security_guards.py`: `ats-search` + `adzuna-search`
      allowlist entries. (`usajobs-search` lands with B2.)
- [x] Danish portals — already `enabled: false` upstream; nothing to do.
- [x] `.claude/skills/job-scraper/search-queries.md` rewritten for the US (ats-search
      primary, adzuna + LinkedIn/freehire for breadth, Danish off, WebSearch fallback = US boards).
- [x] Env-var docs: per-skill `SKILL.md` "Setup" + `CAREERPILOT.md` "Local secrets".
      No committed `.env.example` (`.gitignore` treats `.env.*` as required-ignore).

**Ships:** `/scrape` searches curated US companies + federal + an aggregator, dedupes into
`seen_jobs.json` as today, `/rank` and `/apply` consume the results unchanged.

---

## Phase C — US application conventions

Goal: `/apply` produces US-correct résumés and handles US application forms.

### C1. Work-authorization eligibility gate — `04-job-evaluation.md`

Replace the citizenship "Eligibility Gate" with a US version (bump `framework_version`):

| Posting wording | Verdict |
|---|---|
| "No visa sponsorship" / "must be authorized to work in the US without sponsorship now or in the future" — and candidate needs sponsorship | **FAIL**, quote the line |
| "US Person" / ITAR / EAR / export-controlled | **FAIL** unless candidate is citizen or GC; verify |
| Active security clearance required | **FAIL** unless candidate holds it; clearance ≈ citizen-gated |
| "US citizens only" (federal, some defense) | **FAIL** unless citizen |
| Names the candidate's status positively ("OPT/CPT welcome", "we sponsor H-1B/GC") | **PASS**, note as a plus |
| Silent | **PROCEED, mark unverified** — check the careers page; large firms gate sponsorship there |

Keep the existing separate second gate for permit **timing** (OPT end date, STEM extension
window, H-1B transfer lead time) captured during `/setup` with the specific dates.

### C2. US résumé — `05-cv-templates.md` + `cv/`

- [ ] "Resume" not "CV" throughout; US spelling.
- [ ] **1 page** for students, new-grad, and <10 years experience; 2-page path kept for
      senior. The PDF verification loop in `/apply` changes its page-count assertion to
      match the active length rule.
- [ ] Remove photo, date of birth, marital status, nationality, full address (city + state
      only) from the template — US EEO norms and many ATS parsers.
- [ ] Reverse-chronological, month-year dates, standard section order
      (Summary/Skills optional → Experience → Projects → Education; Education first only for
      current students / <1 yr out).
- [ ] Add a US résumé template variant under `cv/` (`main_example.tex` stays; add
      `main_us_example.tex` or adjust the default and note it). Keep it single-column for
      ATS text-layer extraction (upstream already warns about multi-column).
- [ ] `/add-template` still works for a user's own résumé.

### C3. `10-us-application-specifics.md` (new reference file)

New file in `.claude/skills/job-application-assistant/`, linked from `SKILL.md`'s reference
table and from `08-application-forms.md`:

- **Work-auth form questions** — "Are you legally authorized to work in the US?" (yes/no)
  and "Will you now or in the future require sponsorship?" — how to answer truthfully from
  the profile's work-auth record; never guess.
- **EEO / voluntary self-identification** — race/ethnicity, gender, veteran status,
  disability (form CC-305). These are voluntary, collected separately from the hiring team,
  and "I don't wish to answer / decline to self-identify" is always a valid answer. The
  assistant fills what the user pre-declared in `/setup` and defaults every unspecified
  field to decline — it never infers demographics.
- **Salary expectations vs. salary history** — many states/cities ban asking salary
  *history* (CA, NY, CO, WA, IL, MA, NJ, and more) and several require the employer to post
  a *range*. Guidance: give a researched expected-range for "desired compensation", never a
  prior-salary figure; if a form hard-requires salary history, flag it to the user.
- **References** — "available upon request"; don't list on the résumé.
- **At-will / background check / drug test** acknowledgements — informational, user decides.

### C4. `/setup` — `setup.md`

- [ ] Capture US work authorization (citizen / permanent resident / OPT / STEM OPT /
      H-1B / needs sponsorship / other) and, if time-limited, the key dates.
- [ ] Ask résumé length preference and confirm "Resume" (US) vs "CV" (academic).
- [ ] Optional pre-declared EEO answers (or "decline all", the default).
- [ ] US location + work-eligible states / remote timezone.
- [ ] `01-candidate-profile.md` / `CLAUDE.md` templates gain a **Work Authorization** block.

**Ships:** an end-to-end `/apply` on a US posting yields a 1-page (or length-correct) US
résumé, a correctly-gated fit eval, and correct answers to work-auth + EEO form fields.

---

## Phase D — US tracking & prep polish

- [ ] **Salary**: document a US `salary_data.json` shape sourced from a levels.fyi export
      or BLS OES data; `salary_lookup.py` already takes BYO data — add a US example +
      `tools/` converter if the format differs.
- [ ] **Company research** (`09-web-research.md`): add Glassdoor, Blind, Levels.fyi, and
      US trade press to the research checklist; keep the verify-before-use rule.
- [ ] Review `/gmail-sync`, `/interview`, `/html-report`, `/outcome` for Danish-isms
      (labels, date formats, "notice period" expectations) — expected to be light.
- [ ] `/notion-sync` unchanged.

**Ships:** the full loop, US-tuned end to end.

---

## Phase E — Upstream cadence

- [ ] Weekly `python3 tools/upstream_triage.py --remote upstream`; the inherited
      `upstream-watch.yml` workflow can post it to a rolling issue once `origin` exists.
- [ ] On each upstream release: `check_upstream_updates.py`, review touched methodology
      files, `git merge <tag>`, resolve by keeping US changes + adopting the method change,
      record any deliberately-skipped commits in `.github/upstream-wontport.txt`.
- [ ] Keep a short CareerPilot changelog section (or a `docs/careerpilot/CHANGELOG.md`)
      separate from upstream's `CHANGELOG.md`.

---

## Explicitly not doing

- Indeed / Glassdoor / ZipRecruiter scraping — no usable public API; LinkedIn + aggregators
  + ATS boards cover the ground. (Aggregator/board links still point at them.)
- Auto-submitting applications — upstream doesn't, we don't. Human sends.
- Rebuilding any core command. If a US need can't be met by a methodology-file edit or a
  portal skill, that's a discussion, not a default.
