#!/usr/bin/env bun
// Self-contained CLI for searching company job boards on the Greenhouse, Lever,
// Ashby, and SmartRecruiters ATS platforms. Public keyless APIs, zero runtime dependencies — runs
// anywhere `bun` is available with nothing installed beyond the repo clone.
//
// ATS boards are company-scoped, so this one skill fans out across a
// user-maintained company list (companies.csv, next to this skill) instead of
// there being one skill per ATS.

import { join } from "node:path";
import { runSearch, type SearchOpts } from "./commands/search.js";
import { runDetail, type DetailOpts } from "./commands/detail.js";
import { ATS_TYPES, type AtsType } from "./helpers.js";

const DEFAULT_COMPANIES_FILE = join(import.meta.dir, "..", "..", "companies.csv");

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
    if (key === "company") {
      const acc = Array.isArray(flags.company) ? flags.company : [];
      if (typeof value === "string") acc.push(...value.split(",").map((s) => s.trim()).filter(Boolean));
      flags.company = acc;
    } else {
      flags[key] = value;
    }
  }
  return flags;
}

const HELP = `ats-search — search Greenhouse / Lever / Ashby / SmartRecruiters company job boards

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

The company list is companies.csv next to this skill (name,ats,slug[,priority]).
Copy companies.example.csv to companies.csv and edit it.

SEARCH FLAGS
  --query, -q <text>       Keywords, matched LENIENTLY against the title/team/snippet and
                           scored 0..1 (see --match). A posting is kept unless the query
                           named a role type the title clearly isn't — so a
                           "Transaction Risk Decisioning" PM still shows for -q "product
                           manager fraud". Results carry a match_score; sort/filter on it
                           downstream (this is the /scrape-wide, /rank-deep split).
  --match <mode>           fuzzy (default) | strict | any.
                           fuzzy  = keep any role-type match, ranked by topic-word overlap.
                           strict = keep only titles covering every topic word.
                           any    = keep on a single topic-word (or stem) hit.
  --min-match <0..1>       Explicit keep-threshold on match_score; overrides --match.
  --location, -l <text>    Token-overlap match on the posting location; remote always passes.
  --remote <mode>          remote | hybrid | onsite.
  --jobage <days>          Drop postings older than N days (postings with no date are kept).
  --ats <type>             Restrict to one ATS: ${ATS_TYPES.join(" | ")}.
  --company <slug[,slug]>  Restrict to these board slugs (repeatable, comma-separated).
  --priority <level>       Restrict to companies marked high | normal | low.
  --page <n>               1-indexed page. Default 1.
  --limit, -n <n>          Results per page (also the page size). Default: all.
  --format <fmt>           json (default) | table | plain.
  --companies-file <path>  Override the company-list path.

DETAIL
  <id|url>   An id from a search result ("greenhouse:stripe:12345") or a
             Greenhouse / Lever / Ashby / SmartRecruiters job-board URL.

EXAMPLES
  bun run src/cli.ts search -q "product manager fraud risk" --jobage 30 --format table
  bun run src/cli.ts search -q "backend" -l "New York" --priority high
  bun run src/cli.ts search -q "product manager payments" --match strict --format table
  bun run src/cli.ts search --ats ashby --remote remote --format table
  bun run src/cli.ts detail lever:leverdemo:681fbc53-1e34-4a46-8677-3a78118674eb --format plain

Public keyless ATS APIs. Keep the company list to a curated set (tens to low
hundreds); each run fetches every listed board. SmartRecruiters boards can be
huge, so a SmartRecruiters company without a --query is capped at ~150 recent
postings; SmartRecruiters identifiers are case-sensitive (e.g. BoschGroup).
`;

const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set([
    "query", "match", "min-match", "location", "remote", "jobage", "ats", "company", "priority",
    "page", "limit", "format", "companies-file", "help", "h",
  ]),
  detail: new Set(["format", "companies-file", "help", "h"]),
};

function parseIntFlag(name: string, raw: unknown): number | null {
  const val = typeof raw === "string" ? Number(raw.trim()) : NaN;
  if (!Number.isInteger(val) || val < 1) {
    process.stderr.write(
      JSON.stringify({ error: `--${name} must be a whole number of at least 1, got "${raw}"`, code: "BAD_ARG" }) + "\n",
    );
    return null;
  }
  return val;
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

  const companiesFile =
    typeof flags["companies-file"] === "string"
      ? (flags["companies-file"] as string)
      : DEFAULT_COMPANIES_FILE;

  if (cmd === "search") {
    const fmt = (flags.format as string) || "json";

    for (const name of ["jobage", "page", "limit"] as const) {
      if (flags[name] !== undefined) {
        const v = parseIntFlag(name, flags[name]);
        if (v === null) return 1;
        flags[name] = String(v);
      }
    }

    const ats = typeof flags.ats === "string" ? (flags.ats.toLowerCase() as AtsType) : undefined;
    if (ats && !ATS_TYPES.includes(ats)) {
      process.stderr.write(
        JSON.stringify({ error: `--ats must be one of ${ATS_TYPES.join(", ")}, got "${flags.ats}"`, code: "BAD_ARG" }) + "\n",
      );
      return 1;
    }

    const remote = typeof flags.remote === "string" ? flags.remote.toLowerCase() : undefined;
    if (remote && !["remote", "hybrid", "onsite"].includes(remote)) {
      process.stderr.write(
        JSON.stringify({ error: `--remote must be remote|hybrid|onsite, got "${flags.remote}"`, code: "BAD_ARG" }) + "\n",
      );
      return 1;
    }

    const priority = typeof flags.priority === "string" ? flags.priority.toLowerCase() : undefined;
    if (priority && !["high", "normal", "low"].includes(priority)) {
      process.stderr.write(
        JSON.stringify({ error: `--priority must be high|normal|low, got "${flags.priority}"`, code: "BAD_ARG" }) + "\n",
      );
      return 1;
    }

    const matchMode = typeof flags.match === "string" ? flags.match.toLowerCase() : "fuzzy";
    if (!["fuzzy", "strict", "any"].includes(matchMode)) {
      process.stderr.write(
        JSON.stringify({ error: `--match must be fuzzy|strict|any, got "${flags.match}"`, code: "BAD_ARG" }) + "\n",
      );
      return 1;
    }
    let minMatch: number | undefined;
    if (flags["min-match"] !== undefined) {
      const v = typeof flags["min-match"] === "string" ? Number(flags["min-match"]) : NaN;
      if (!Number.isFinite(v) || v < 0 || v > 1) {
        process.stderr.write(
          JSON.stringify({ error: `--min-match must be a number 0..1, got "${flags["min-match"]}"`, code: "BAD_ARG" }) + "\n",
        );
        return 1;
      }
      minMatch = v;
    }

    const opts: SearchOpts = {
      companiesFile,
      query: typeof flags.query === "string" ? flags.query : undefined,
      matchMode: matchMode as SearchOpts["matchMode"],
      minMatch,
      location: typeof flags.location === "string" ? flags.location : undefined,
      remote: remote as SearchOpts["remote"],
      jobage: flags.jobage ? parseInt(flags.jobage as string, 10) : undefined,
      ats,
      company: Array.isArray(flags.company) ? (flags.company as string[]) : undefined,
      priority: priority as SearchOpts["priority"],
      page: flags.page ? parseInt(flags.page as string, 10) : 1,
      limit: flags.limit ? parseInt(flags.limit as string, 10) : undefined,
      format: (["json", "table", "plain"].includes(fmt) ? fmt : "json") as SearchOpts["format"],
    };
    return runSearch(opts);
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1];
    if (!id) {
      process.stderr.write(JSON.stringify({ error: "detail requires an <id|url>", code: "NO_ID" }) + "\n");
      return 1;
    }
    const fmt = (flags.format as string) || "json";
    const opts: DetailOpts = {
      companiesFile,
      id,
      format: fmt === "plain" ? "plain" : "json",
    };
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
