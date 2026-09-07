#!/usr/bin/env bun
// Self-contained CLI for the Adzuna public jobs API (US). Broad-market aggregator
// search — company sites, boards, and recruiters pooled into one index.
// Zero runtime dependencies. Needs a free key pair in the environment:
//   ADZUNA_APP_ID, ADZUNA_APP_KEY   (https://developer.adzuna.com)
//
// Adzuna has no per-posting endpoint; see `detail --help` / SKILL.md.

import { runSearch, type SearchOpts } from "./commands/search.js";
import { runDetail, type DetailOpts } from "./commands/detail.js";

interface Flags {
  _: string[];
  [k: string]: string | boolean | string[];
}

const ALIAS: Record<string, string> = { q: "query", l: "location", n: "limit" };

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("-")) {
      (flags._ as string[]).push(a);
      continue;
    }
    const name = a.replace(/^-+/, "");
    const key = ALIAS[name] ?? name;
    const next = argv[i + 1];
    let value: string | boolean = true;
    if (next !== undefined && !next.startsWith("-")) {
      value = next;
      i++;
    }
    flags[key] = value;
  }
  return flags;
}

const HELP = `adzuna-cli — search the Adzuna jobs API (US, broad-market aggregator)

USAGE
  bun run src/cli.ts search [-q "<keywords>"] [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SETUP (required)
  export ADZUNA_APP_ID=...     free key pair at https://developer.adzuna.com
  export ADZUNA_APP_KEY=...    (or put both in the repo-root .env — bun loads it)

SEARCH FLAGS
  --query, -q <text>     Keyword match (what).
  --phrase <text>        Exact-phrase match (what_phrase).
  --exclude <text>       Exclude postings with these words (what_exclude).
  --location, -l <text>  Location (where), e.g. "New York", "Remote", "94105".
  --distance <km>        Radius around --location (kilometres).
  --jobage <days>        Posted within N days (max_days_old).
  --category <tag>       Adzuna category tag, e.g. it-jobs, engineering-jobs, graduate-jobs.
  --full-time            Full-time only.
  --permanent            Permanent (non-contract) only.
  --salary-min <n>       Minimum advertised salary (USD).
  --sort <mode>          date (default) | relevance | salary.
  --page <n>             1-indexed page. Default 1.
  --limit, -n <n>        Results per page (Adzuna max 50). Default 25.
  --format <fmt>         json (default) | table | plain.

DETAIL
  <id|url>   "adzuna:us:<id>" from a search result, an adzuna.com/land/ad/<id>
             URL, or a bare numeric id. NOTE: Adzuna has no per-posting endpoint —
             detail returns the canonical URL to fetch, not the full text.

EXAMPLES
  bun run src/cli.ts search -q "software engineer" -l "New York" --jobage 14 --format table
  bun run src/cli.ts search --phrase "machine learning engineer" -l Remote --sort date
  bun run src/cli.ts search -q "new grad" --category graduate-jobs --full-time --format table

Reads only. Credentials come from the environment, never a flag.
`;

const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set([
    "query", "phrase", "exclude", "location", "distance", "jobage", "category",
    "full-time", "permanent", "salary-min", "sort", "page", "limit", "format", "help", "h",
  ]),
  detail: new Set(["format", "help", "h"]),
};

function intFlag(name: string, raw: unknown): number | null {
  const v = typeof raw === "string" ? Number(raw.trim()) : NaN;
  if (!Number.isInteger(v) || v < 1) {
    process.stderr.write(
      JSON.stringify({ error: `--${name} must be a whole number of at least 1, got "${raw}"`, code: "BAD_ARG" }) + "\n",
    );
    return null;
  }
  return v;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const flags = parseFlags(argv);
  const cmd = (flags._ as string[])[0];

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP);
    return cmd ? 0 : 1;
  }

  const known = KNOWN_FLAGS[cmd];
  if (known) {
    for (const key of Object.keys(flags)) {
      if (key === "_" || known.has(key)) continue;
      process.stderr.write(
        JSON.stringify({
          error: `unknown flag --${key} for '${cmd}' — flags are never silently ignored; see --help`,
          code: "UNKNOWN_FLAG",
        }) + "\n",
      );
      return 1;
    }
  }

  if (cmd === "search") {
    const fmt = (flags.format as string) || "json";
    for (const name of ["distance", "jobage", "salary-min", "page", "limit"] as const) {
      if (flags[name] !== undefined) {
        const v = intFlag(name, flags[name]);
        if (v === null) return 1;
        flags[name] = String(v);
      }
    }
    const sort = typeof flags.sort === "string" ? flags.sort.toLowerCase() : "date";
    if (!["date", "relevance", "salary"].includes(sort)) {
      process.stderr.write(
        JSON.stringify({ error: `--sort must be date|relevance|salary, got "${flags.sort}"`, code: "BAD_ARG" }) + "\n",
      );
      return 1;
    }

    const opts: SearchOpts = {
      query: typeof flags.query === "string" ? flags.query : undefined,
      queryPhrase: typeof flags.phrase === "string" ? flags.phrase : undefined,
      exclude: typeof flags.exclude === "string" ? flags.exclude : undefined,
      location: typeof flags.location === "string" ? flags.location : undefined,
      distanceKm: flags.distance ? parseInt(flags.distance as string, 10) : undefined,
      jobage: flags.jobage ? parseInt(flags.jobage as string, 10) : undefined,
      category: typeof flags.category === "string" ? flags.category : undefined,
      fullTime: flags["full-time"] === true,
      permanent: flags.permanent === true,
      salaryMin: flags["salary-min"] ? parseInt(flags["salary-min"] as string, 10) : undefined,
      sort: sort as SearchOpts["sort"],
      page: flags.page ? parseInt(flags.page as string, 10) : 1,
      limit: flags.limit ? parseInt(flags.limit as string, 10) : 25,
      format: (["json", "table", "plain"].includes(fmt) ? fmt : "json") as SearchOpts["format"],
    };
    return runSearch(opts);
  }

  if (cmd === "detail") {
    const ref = (flags._ as string[])[1];
    if (!ref) {
      process.stderr.write(JSON.stringify({ error: "detail requires an <id|url>", code: "NO_ID" }) + "\n");
      return 1;
    }
    const fmt = (flags.format as string) || "json";
    const opts: DetailOpts = { ref, format: fmt === "plain" ? "plain" : "json" };
    return runDetail(opts);
  }

  process.stderr.write(JSON.stringify({ error: `Unknown command "${cmd}"`, code: "BAD_CMD" }) + "\n");
  return 1;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e), code: "INTERNAL_ERROR" }) + "\n",
    );
    process.exit(1);
  });
