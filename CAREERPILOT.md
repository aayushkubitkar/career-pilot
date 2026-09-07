# CareerPilot — US-market adaptation of `ai-job-search`

CareerPilot is a personal, local, Claude-Code-native job-search workspace. It is built on
**[MadsLorentzen/ai-job-search](https://github.com/MadsLorentzen/ai-job-search)** (MIT),
vendored at **v1.7.1**, and adapted for the **United States** job market.

The upstream framework is country-agnostic in its core (self-profiling, fit evaluation, the
drafter–reviewer application pipeline, interview prep, tracking) but ships Danish job-portal
skills and European CV conventions. CareerPilot keeps the core, swaps the market layer.

- Upstream docs — [`README.md`](README.md), [`SETUP.md`](SETUP.md), [`CLAUDE.md`](CLAUDE.md)
- Upstream methodology — [`.claude/skills/job-application-assistant/`](.claude/skills/job-application-assistant/)
- This project's north-star spec (pre-adoption) — [`docs/careerpilot/SPEC.md`](docs/careerpilot/SPEC.md)

## Repo setup

This is a **private** repository. Upstream is a git remote, not a fork (a GitHub fork of a
public repo is always public, and `/setup` writes personal data into tracked files).

```
origin    <your private repo>              # push your personalized workspace here
upstream  github.com/MadsLorentzen/ai-job-search   # pull vetted releases from here
```

Sync cadence (see [`SETUP.md` §8](SETUP.md#8-pulling-upstream-updates-into-your-fork)):

```bash
git fetch upstream --tags
python3 tools/check_upstream_updates.py     # which personalized files a release touches
python3 tools/upstream_triage.py --remote upstream   # which commits are worth reviewing
git merge v1.8.0                            # adopt a release; resolve conflicts by keeping
                                            # your data and adopting the methodology change
```

CareerPilot's own US-adaptation commits live on `master` on top of the `v1.7.1` tag, so a
`git merge <newer-tag>` three-way-merges upstream changes around them.

## What changes for the US

| Area | Upstream (Denmark) | CareerPilot (US) |
|---|---|---|
| Job portals | Jobindex, Jobnet, Akademikernes Jobbank, Jobdanmark | Greenhouse / Lever / Ashby ATS APIs, USAJOBS, Adzuna; keep LinkedIn + freehire |
| Eligibility gate | Citizenship / PR of the country | US work authorization: citizen · GC · OPT / STEM OPT · H-1B transfer · needs sponsorship; detect "no sponsorship", ITAR "US Person", clearance |
| CV / résumé | "CV", 2-page moderncv | "Resume", 1 page for students / new-grad / <10 yrs (2-page option kept for senior); no photo, DOB, marital status, nationality |
| Behavioral profile | PI / DISC assumed | PI / DISC optional; self-assessment path is primary |
| Application forms | EU free-text fields | + US EEO / voluntary self-identification questions, work-auth form questions, salary-history-ban awareness by state |
| Salary data | Danish union statistics | BYO US data (levels.fyi export, BLS OES); format documented |
| Company research | Jobindex reviews | Glassdoor, Blind, Levels.fyi, US press |

Everything else — `/scrape` orchestration, `/rank`, the `/apply` drafter–reviewer + PDF
verification loop, `/interview`, `/outcome`, `/gmail-sync`, `/notion-sync`, `/html-report`,
`/upskill`, `/expand`, the security model — is used as-is.

## Adaptation roadmap

Detailed phase specs: [`docs/careerpilot/us-adaptation-roadmap.md`](docs/careerpilot/us-adaptation-roadmap.md).

- **Phase A — Adopt & orient** ✅ vendor v1.7.1, upstream remote, this doc. `/setup` runs as-is.
- **Phase B — US discovery** — 🚧 `ats-search` (Greenhouse+Lever+Ashby, one skill) ✅ done;
  `usajobs-search` + `adzuna-search` next. US `search-queries.md` + settings allowlist ✅.
- **Phase C — US application conventions** — US work-auth eligibility gate; US résumé
  templates + rules; `10-us-application-specifics.md` (EEO, work-auth form Qs, salary
  history); `/setup` captures US work auth. Ships: `/apply` produces US-correct résumés.
- **Phase D — US tracking & prep polish** — US salary data source; US company-research
  sources; review `/gmail-sync` / `/interview` / `/html-report` for US-ism. Ships: full loop.
- **Phase E — Upstream cadence** — weekly triage, adopt releases.

## Attribution

Built on `ai-job-search` by [Mads Lorentzen](https://github.com/MadsLorentzen), MIT-licensed
(see [`LICENSE`](LICENSE)). Job-search CLI skill pattern originally by
[Mikkel Krogholm](https://github.com/mikkelkrogsholm). CareerPilot is an independent personal
adaptation, not affiliated with or endorsed by the upstream author.
