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

You install two things; **`/doctor` handles the rest** (it runs automatically at the start
of `/setup`, and detects + offers to install anything missing):

- **[Claude Code](https://claude.com/claude-code)** — how you run everything.
- **[Bun](https://bun.sh)** and a **LaTeX distribution** with `lualatex` + `xelatex`
  ([TinyTeX](https://yihui.org/tinytex/) is lightest). If you skip these, `/doctor` will
  offer to install them for you on the first run.
- Python 3.9+ (stock macOS / any current Linux is fine — the helper scripts run on 3.9).

`/doctor` does the project-local setup for you: a starter `companies.csv`, a `.env` skeleton,
and an `import pypdf` check. The portal CLIs have zero dependencies — they just need Bun on
PATH. Optional external keys (Adzuna, USAJOBS) are free and `/scrape` works without them.

## Quick start

```bash
git clone git@github.com:<you>/career-pilot.git
cd career-pilot
claude
```
then, inside Claude Code:
```
/doctor          # checks the environment, installs the local pieces, offers the rest
/setup           # import your résumé, work authorization, targets
/scrape          # find openings
/rank            # score them against your profile + work-auth gate
/apply <url>     # evaluate fit, draft a tailored résumé + cover letter, compile, verify
```
`/setup` runs `/doctor` for you, so `/setup` alone is enough on a fresh clone — run
`/doctor` on its own whenever you want to re-check or install a prerequisite you deferred.

## Privacy

Everything runs locally. The only outbound calls are to the Anthropic API and to the public
job APIs you opt into.

**`/setup` writes your personal data** (name, contact details, employment history, salary
expectations, work-authorization status) **into tracked profile files.** A GitHub fork of a
public repo is **always public**, so if you plan to push:

- push to a **private** repository, **or**
- keep your profile on a **local branch** and push only the framework to your public repo —
  the two-command recipe is in [`CAREERPILOT.md`](CAREERPILOT.md#repo-setup), and the same
  private-remote / upstream-sync flow is in [`SETUP.md` section 8](SETUP.md#8-pulling-upstream-updates-into-your-fork).

The tracker (`job_search_tracker.csv`), generated documents, `documents/`, `companies.csv`,
and `.env` are gitignored and never committed.

## Credits

- **[MadsLorentzen/ai-job-search](https://github.com/MadsLorentzen/ai-job-search)** — the
  core framework, the `/apply` drafter-reviewer pipeline, the portal-skill pattern, and Pip
  the courier bird. MIT.
- Job-search CLI skill pattern originally by [Mikkel Krogholm](https://github.com/mikkelkrogsholm).
- Built with [Claude Code](https://claude.com/claude-code). Independent project; not
  affiliated with or endorsed by Anthropic or the upstream author.

## License

MIT — see [`LICENSE`](LICENSE).
