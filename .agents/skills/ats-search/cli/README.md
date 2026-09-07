# ats-search CLI

Searches Greenhouse, Lever, and Ashby company job boards across a curated company list.
Public keyless JSON APIs, zero runtime dependencies (plain `bun` + `fetch`).

```bash
bun install            # dev types only; not needed to run
bun run typecheck
bun test               # offline: fixtures + CLI validation, no network
bun run src/cli.ts search -q "software engineer" --jobage 30 --format table
```

- Company list: `../companies.csv` (`name,ats,slug[,priority]`). `../companies.example.csv`
  is the annotated reference. Override with `--companies-file`.
- Contract, flags, and examples: `../SKILL.md`.
- Endpoint shapes and parsing anchors: `../url-reference.md`.

Layout:

```
src/
  cli.ts                 arg parsing, flag validation, dispatch
  helpers.ts             Posting shape, fetch+backoff, CSV parse, client-side filters, concurrency pool, HTML→text
  connectors/
    index.ts             ats -> connector map
    greenhouse.ts        list + per-job detail
    lever.ts             list + per-posting detail
    ashby.ts             list (+ detail refetches the board — no per-posting endpoint)
  commands/
    search.ts            fan out, filter, sort, paginate, render
    detail.ts            resolve id/URL -> one posting
tests/
  helpers.test.ts        makeId/parseId, parseCompanyCsv, matches(), htmlToText, snippetOf
  connectors.test.ts     per-ATS raw JSON -> normalized Posting
  cli-flag-validation.test.ts   error codes, network-free
  fixtures/              sample company lists
```
