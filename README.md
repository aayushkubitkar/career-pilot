<p align="center">
  <img src="assets/mascot/pip_flight_loop.gif" alt="Pip, the courier bird" width="160">
</p>

# CareerPilot

*A job search that runs on your machine — tuned for the US market.*

CareerPilot turns [Claude Code](https://claude.com/claude-code) into an end-to-end job-search
assistant: it discovers openings, scores them against your profile, tailors a résumé and
cover letter for each one, preps you for interviews, and tracks the whole pipeline — all
locally, with you approving anything that goes to an employer.

It is a **US-market adaptation of [MadsLorentzen/ai-job-search](https://github.com/MadsLorentzen/ai-job-search)**
(MIT), which built the core workflow and the job-portal-skill pattern. CareerPilot keeps
that engine and swaps the market layer: US ATS job boards, US work-authorization handling,
US résumé conventions, and US application-form guidance. See [`CAREERPILOT.md`](CAREERPILOT.md)
for exactly what differs and why.

```
/setup            /scrape                 /rank                 /apply <url>
  |                  |                       |                       |
  v                  v                       v                       v
Import résumé,   Search ATS boards +     Batch-score against     Evaluate fit, draft a
work auth,       aggregators, dedupe     the fit framework +     tailored résumé + cover
targets          into one list          work-auth gate          letter, compile & verify
                                          |                       |
                                          v                       v
                                     Ranked shortlist        Reviewer pass → revise →
                                     with reasons            you review and submit
```

## What you get

- **Discovery** — `ats-search` (Greenhouse / Lever / Ashby / SmartRecruiters company boards,
  fuzzy-matched), `adzuna-search` (broad aggregator), `linkedin-search`, `freehire-search`.
  All public APIs; no scraping of walled boards.
- **Ranking** — a five-dimension fit rubric, a **US work-authorization gate** (citizen / GC /
  OPT / H-1B / needs-sponsorship), a language gate, deal-breaker vetoes.
- **Applications** — a drafter/reviewer pipeline that produces a US résumé (1-page for early
  career, 2-page otherwise), compiles the PDF, and verifies the ATS text layer. Nothing is
  fabricated — every claim traces to your profile.
- **US application specifics** — work-auth dropdowns, EEO / voluntary self-ID (defaults to
  "decline"), salary-history-ban awareness, references.
- **Tracking & prep** — a pipeline tracker, `/interview` prep packs, `/gmail-sync`,
  `/html-report`, `/upskill`, and more.

Full command list and the design spec: [`CAREERPILOT.md`](CAREERPILOT.md),
[`docs/careerpilot/`](docs/careerpilot/). The upstream framework's own README (workflow
internals, the `/apply` drafter-reviewer design, community forks) is preserved at
[`docs/UPSTREAM_README.md`](docs/UPSTREAM_README.md).

## Prerequisites

- **[Claude Code](https://claude.com/claude-code)** (CLI).
- **[Bun](https://bun.sh)** — runs the job-search CLIs.
- **Python 3.10+** — the `tools/` helpers (`/rank`, PDF checks). A repo `.venv` is the
  simplest way: `python3.12 -m venv .venv && .venv/bin/pip install pyyaml pypdf`.
- **A LaTeX distribution** with `lualatex` + `xelatex` — [TinyTeX](https://yihui.org/tinytex/)
  is the lightest. `/apply` compiles and visually inspects every PDF. First run,
  `tlmgr install` the packages `moderncv` pulls (`fontawesome6`, `fontspec`, `needspace`,
  `titlesec`, …).
- Optional: `pip install pypdf` for the ATS text-layer check (Poppler `pdftotext` is a fallback).

## Quick start

```bash
git clone <your fork of this repo>
cd career-pilot

# job-search CLIs
for d in .agents/skills/*/cli; do (cd "$d" && bun install); done

# python helpers
python3.12 -m venv .venv && .venv/bin/pip install pyyaml pypdf

# aggregator key (optional, free — https://developer.adzuna.com)
cp -n /dev/null .env && printf 'ADZUNA_APP_ID=...\nADZUNA_APP_KEY=...\n' >> .env

# curate your company list
cp .agents/skills/ats-search/companies.example.csv .agents/skills/ats-search/companies.csv

claude          # then, inside Claude Code:
/setup          # import your résumé, work authorization, targets
/scrape         # find openings
/rank           # score them
/apply <url>    # tailor + draft for one
```

## Privacy

Everything runs locally. The only outbound calls are to the Anthropic API and to the public
job APIs you opt into. `/setup` writes your personal data into **tracked** profile files, so
if you push anywhere, use a **private** repo (or keep your profile on a local branch and
push only the framework — see [`CAREERPILOT.md`](CAREERPILOT.md#repo-setup)). The tracker,
generated documents, `documents/`, and `.env` are gitignored and never committed.

## Credits

- **[MadsLorentzen/ai-job-search](https://github.com/MadsLorentzen/ai-job-search)** — the
  core framework, the `/apply` drafter-reviewer pipeline, the portal-skill pattern, and Pip
  the courier bird. MIT.
- Job-search CLI skill pattern originally by [Mikkel Krogholm](https://github.com/mikkelkrogsholm).
- Built with [Claude Code](https://claude.com/claude-code). Independent project; not
  affiliated with or endorsed by Anthropic or the upstream author.

## License

MIT — see [`LICENSE`](LICENSE).
