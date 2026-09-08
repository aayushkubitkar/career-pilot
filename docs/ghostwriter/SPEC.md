# Ghostwriter — Product Spec

> **Status: historical / north-star (2026-09-06).** Written before Ghostwriter adopted
> [`ai-job-search`](https://github.com/MadsLorentzen/ai-job-search) as its base
> (see [`../../GHOSTWRITER.md`](../../GHOSTWRITER.md)). The *principles* here still hold and
> guided the decision to adopt. The *tech-stack* and *phased-build* sections describe a
> standalone TypeScript/SQLite CLI that was **not** pursued — the adopted framework is
> Claude-Code-native with flat-file state. Kept for the requirements it captures (data
> model, guardrails, US-market intent) which the adaptation roadmap now delivers on top of
> upstream. Live plan: [`us-adaptation-roadmap.md`](us-adaptation-roadmap.md).

A local, single-user, command-line agent that runs a job search end to end: discovery →
matching → document tailoring → assisted application → pipeline tracking → interview prep.

Owner: kc101@rice.edu. Not a product; optimized for one person's search.

---

## 1. Principles

1. **Local-first.** All data (career profile, job database, generated documents, application
   history) lives on disk under `$GHOSTWRITER_HOME` (default `~/.ghostwriter`). No server, no
   account. Nothing leaves the machine except calls to the Anthropic API and to public job
   APIs the user opted into.
2. **Human-in-the-loop for anything outward-facing.** The agent never submits an application,
   sends an email, or contacts a person without an explicit confirm step. It prepares; the
   user commits.
3. **No fabrication.** Every generated résumé bullet, cover-letter claim, or talking point
   must trace to a fact in the user's structured profile. Tailoring re-emphasizes and
   rephrases real experience; it never invents titles, dates, metrics, or skills. Generated
   documents carry a provenance map (claim → profile source).
4. **Respect platforms.** Discovery uses official APIs and public ATS JSON endpoints only.
   No scraping of LinkedIn / Indeed / Glassdoor. Browser automation is used solely to
   pre-fill forms the user is actively applying through, at human pace, one at a time.
5. **Quality over volume.** The tool exists to make each application better and each hour of
   prep sharper — not to carpet-bomb job boards. Rate limits and a review queue are
   features, not friction.
6. **Spec-driven & phased.** Every phase has a spec in `specs/`, ships a working vertical
   slice the user can run, and leaves the tool in a usable state. See `ROADMAP.md`.

---

## 2. Tech stack

| Concern | Choice | Rationale |
|---|---|---|
| Language / runtime | **TypeScript on Node 22+** | Node 26 present and current on this machine; system Python is 3.9. One language for CLI + Playwright + PDF. |
| CLI framework | `commander` | Small, stable, subcommand-friendly. |
| Storage | **SQLite** via Node's built-in `node:sqlite` | Synchronous, zero-config, single file, no native-module build. Migrations in `src/db/migrations.ts`. |
| Profile file | `profile.yaml` (human-editable) + validated into DB | User owns and edits the source of truth in a text editor. |
| LLM | Anthropic API via `@anthropic-ai/sdk` | Structured output via tool-use; model configurable. |
| Browser automation | `playwright` (Chromium) | Phase 4+. Form-fill only. |
| Document rendering | HTML template → PDF via Playwright's Chromium | No extra binary; consistent output. Résumé/cover-letter templates in `src/templates`. |
| Config | `.env` (secrets) + `config.json` under `$GHOSTWRITER_HOME` (preferences) | Secrets never in the data dir; preferences never in the repo. |
| Testing | `vitest` | Fast, TS-native. |

Command surface: a single binary `ghostwriter` (alias `cp`), organized as
`ghostwriter <noun> <verb>` (e.g. `ghostwriter jobs list`, `ghostwriter profile edit`).

---

## 3. Data model (target state; built up phase by phase)

```
profile            one row — the active career profile, parsed + validated from profile.yaml
  identity, contacts, locations, work_authorization, preferences (roles, comp, remote, industries)
experiences        jobs / projects / education; each has bullets[] with metrics + skill tags
stories            STAR narratives for behavioral prep, tagged by competency
skills             normalized skill list with proficiency + evidence (which experience)

companies          user-curated targets: name, ats_type, ats_slug, priority, notes
jobs               discovered postings: source, external_id, title, team, location, remote,
                   description, comp_range, url, posted_at, first_seen_at, status, hash
job_scores         per job: fit_score, verdict, rationale, constraint_flags[], model, scored_at

applications       one per job the user pursues: state, applied_at, resume_doc, cover_doc,
                   form_answers (json), external_confirmation, notes
application_events  state-machine transitions + timestamps + source (manual | email-sync)
documents          generated artifacts: type (resume|cover|dossier|prep), job_id, path,
                   provenance (json), created_at

contacts           recruiters / referrers / interviewers tied to a company or application
reminders          follow-up nudges: due_at, application_id, kind, done
prep_packs         per-job prep bundle: dossier, likely_topics, star_gaps, study_plan
```

Application state machine:

```
discovered → queued → drafting → ready_to_submit → applied
applied → screening → oa → phone → onsite → offer | rejected | withdrawn
(any) → stale   (no movement past a threshold)
```

---

## 4. External interfaces

| Interface | Used for | Phase | Notes |
|---|---|---|---|
| Anthropic API | profile parse, ranking, tailoring, dossiers, mock interview | 0+ | Only external dependency that's always required. |
| Greenhouse Boards API | discovery | 1 | `https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true` |
| Lever Postings API | discovery | 1 | `https://api.lever.co/v0/postings/{slug}?mode=json` |
| Ashby Job Board API | discovery | 1 | `https://api.ashbyhq.com/posting-api/job-board/{slug}` |
| SmartRecruiters Posting API | discovery | 1 (stretch) | public postings endpoint |
| Adzuna API | aggregator discovery | 4 | free tier, keyed |
| USAJOBS API | aggregator discovery | 4 | free, keyed; federal roles |
| HN "Who is Hiring" | aggregator discovery | 4 | via Algolia HN Search API |
| Playwright / Chromium | form pre-fill, HTML→PDF | 3 (PDF), 4 (forms) | local browser, visible window for apply |
| Gmail API | application status sync, follow-up send (draft only) | 5 | OAuth desktop flow; read + drafts scope |

---

## 5. Guardrails, enforced in code

- `applications`: no transition to `applied` without `--confirm` on the CLI or an interactive yes.
- Tailoring: generation runs through a validator that checks each output claim against the
  profile; unverifiable claims are stripped and reported, not silently kept.
- Email: Gmail integration creates **drafts** only; it never sends.
- Discovery: per-host request throttle + on-disk response cache; `robots`/ToS-respecting
  source list is hard-coded, not user-extensible to arbitrary scrapers.
- All LLM calls log prompt + response to `$GHOSTWRITER_HOME/logs` for auditability.

---

## 6. Out of scope (for now)

Multi-user / hosting · auto-submit without review · LinkedIn automation · recruiter
cold-outreach at scale · salary negotiation automation (prep only) · mobile app.
