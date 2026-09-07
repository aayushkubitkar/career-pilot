import { readFile } from "node:fs/promises";
import { CONNECTORS } from "../connectors/index.js";
import {
  CompanyListError,
  matches,
  parseCompanyCsv,
  pool,
  writeError,
  type AtsType,
  type Company,
  type CompanyError,
  type Filters,
  type Posting,
} from "../helpers.js";

export interface SearchOpts {
  companiesFile: string;
  query?: string;
  location?: string;
  remote?: "remote" | "hybrid" | "onsite";
  jobage?: number;
  ats?: AtsType;
  company?: string[]; // restrict to these board slugs
  priority?: "high" | "normal" | "low";
  page: number;
  limit?: number;
  format: "json" | "table" | "plain";
}

const CONCURRENCY = 6;

function selectCompanies(all: Company[], opts: SearchOpts): Company[] {
  let sel = all;
  if (opts.ats) sel = sel.filter((c) => c.ats === opts.ats);
  if (opts.priority) sel = sel.filter((c) => c.priority === opts.priority);
  if (opts.company && opts.company.length) {
    const want = new Set(opts.company.map((s) => s.toLowerCase()));
    sel = sel.filter((c) => want.has(c.slug.toLowerCase()));
  }
  return sel;
}

const PRIORITY_RANK: Record<Company["priority"], number> = { high: 0, normal: 1, low: 2 };

export async function runSearch(opts: SearchOpts): Promise<number> {
  let companies: Company[];
  try {
    const text = await readFile(opts.companiesFile, "utf8");
    companies = parseCompanyCsv(text);
  } catch (e) {
    if (e instanceof CompanyListError) {
      writeError(e.message, "BAD_COMPANY_LIST");
    } else if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      writeError(
        `company list not found at ${opts.companiesFile} — copy companies.example.csv to companies.csv and edit it`,
        "NO_COMPANY_LIST",
      );
    } else {
      writeError(e instanceof Error ? e.message : String(e), "COMPANY_LIST_READ_FAILED");
    }
    return 1;
  }

  const selected = selectCompanies(companies, opts);
  if (selected.length === 0) {
    writeError(
      "no companies match the given --ats / --company / --priority filters",
      "NO_COMPANIES_SELECTED",
    );
    return 1;
  }

  const priorityBySlug = new Map(selected.map((c) => [c.slug, c.priority] as const));
  const errors: CompanyError[] = [];

  const perCompany = await pool(selected, CONCURRENCY, async (c) => {
    try {
      return await CONNECTORS[c.ats].list(c);
    } catch (e) {
      errors.push({
        company: c.name,
        ats: c.ats,
        slug: c.slug,
        error: e instanceof Error ? e.message : String(e),
      });
      return [] as Posting[];
    }
  });

  const filters: Filters = {
    query: opts.query,
    location: opts.location,
    remote: opts.remote,
    jobageDays: opts.jobage,
  };

  let all = perCompany.flat().filter((p) => matches(p, filters));

  all.sort((a, b) => {
    const pr =
      PRIORITY_RANK[priorityBySlug.get(a.slug) ?? "normal"] -
      PRIORITY_RANK[priorityBySlug.get(b.slug) ?? "normal"];
    if (pr !== 0) return pr;
    const da = a.date ? Date.parse(a.date) : 0;
    const db = b.date ? Date.parse(b.date) : 0;
    return db - da;
  });

  const total = all.length;
  const limit = opts.limit ?? total;
  const start = (opts.page - 1) * limit;
  const pageRows = all.slice(start, start + limit);

  // Search output carries a snippet, not the full description (keeps the payload
  // scannable; `detail` fetches the body).
  const results = pageRows.map(({ description, ...rest }) => rest);

  if (opts.format === "table") {
    process.stdout.write(renderTable(results) + "\n");
  } else if (opts.format === "plain") {
    process.stdout.write(renderPlain(results) + "\n");
  } else {
    process.stdout.write(
      JSON.stringify(
        {
          meta: {
            count: results.length,
            page: opts.page,
            total,
            companies: selected.length,
            errors,
          },
          results,
        },
        null,
        2,
      ) + "\n",
    );
  }
  return 0;
}

function renderTable(rows: Omit<Posting, "description">[]): string {
  if (rows.length === 0) return "No results.";
  const w = {
    ats: 10,
    title: 40,
    company: 20,
    loc: 22,
    date: 10,
  };
  const line = (c: string[]) =>
    [
      c[0]!.padEnd(w.ats),
      c[1]!.slice(0, w.title).padEnd(w.title),
      c[2]!.slice(0, w.company).padEnd(w.company),
      c[3]!.slice(0, w.loc).padEnd(w.loc),
      c[4]!,
    ].join("  ");
  const header = line(["ATS", "TITLE", "COMPANY", "LOCATION", "DATE"]);
  const body = rows.map((r) =>
    line([
      r.ats,
      r.title,
      r.company,
      r.remote ? `${r.location ?? "—"} (rem)` : r.location ?? "—",
      (r.date ?? "—").slice(0, 10),
    ]),
  );
  return [header, "-".repeat(header.length), ...body].join("\n");
}

function renderPlain(rows: Omit<Posting, "description">[]): string {
  if (rows.length === 0) return "No results.";
  return rows
    .map((r) =>
      [
        r.title,
        `  ${r.company} · ${r.location ?? "—"}${r.remote ? " · remote" : ""} · ${(r.date ?? "—").slice(0, 10)}`,
        `  id: ${r.id}`,
        `  ${r.url}`,
      ].join("\n"),
    )
    .join("\n\n");
}
