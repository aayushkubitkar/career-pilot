# adzuna-search CLI

Broad-market US job search via the Adzuna aggregator's public JSON API. Zero runtime
dependencies (plain `bun` + `fetch`).

```bash
bun install                 # dev types only
bun run typecheck
bun test                    # offline: parsing + CLI validation (credentials blanked)

export ADZUNA_APP_ID=... ADZUNA_APP_KEY=...   # or put them in the repo-root .env
bun run src/cli.ts search -q "software engineer" -l "New York" --jobage 14 --format table
```

- Credentials: `ADZUNA_APP_ID` + `ADZUNA_APP_KEY`, environment only. Free at
  <https://developer.adzuna.com>.
- Contract, flags, examples, and the "no detail endpoint" limitation: `../SKILL.md`.
- Endpoint shapes + category tags: `../url-reference.md`.

```
src/
  cli.ts              arg parsing, flag validation, dispatch
  helpers.ts          credentials(), apiGet() with backoff, toResult(), stripHtml(), parseRef()
  commands/
    search.ts         build the query, fetch, shape, render
    detail.ts         resolve a reference -> canonical URL (Adzuna has no per-posting API)
tests/
  parsing.test.ts             toResult / stripHtml / parseRef / comp gating
  cli-flag-validation.test.ts  error codes + MISSING_CREDENTIALS, network-free
```
