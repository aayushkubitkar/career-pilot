import {
  apiGet,
  COUNTRY,
  credentials,
  toResult,
  writeError,
  type AdzunaSearchResponse,
  type JobResult,
} from "../helpers.js";

export interface SearchOpts {
  query?: string; // `what` — keyword match
  queryPhrase?: string; // `what_phrase` — exact phrase
  exclude?: string; // `what_exclude`
  location?: string; // `where`
  distanceKm?: number; // `distance` around `where`
  jobage?: number; // `max_days_old`
  category?: string; // Adzuna category tag, e.g. "it-jobs"
  fullTime?: boolean;
  permanent?: boolean;
  salaryMin?: number;
  sort: "date" | "relevance" | "salary";
  page: number;
  limit: number; // results_per_page (Adzuna max 50)
  format: "json" | "table" | "plain";
}

function buildParams(o: SearchOpts): URLSearchParams {
  const { appId, appKey } = credentials();
  const p = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    results_per_page: String(Math.min(o.limit, 50)),
    "content-type": "application/json",
    sort_by: o.sort,
  });
  if (o.query) p.set("what", o.query);
  if (o.queryPhrase) p.set("what_phrase", o.queryPhrase);
  if (o.exclude) p.set("what_exclude", o.exclude);
  if (o.location) p.set("where", o.location);
  if (o.distanceKm != null) p.set("distance", String(o.distanceKm));
  if (o.jobage != null) p.set("max_days_old", String(o.jobage));
  if (o.category) p.set("category", o.category);
  if (o.fullTime) p.set("full_time", "1");
  if (o.permanent) p.set("permanent", "1");
  if (o.salaryMin != null) p.set("salary_min", String(o.salaryMin));
  return p;
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  let data: AdzunaSearchResponse;
  try {
    data = await apiGet<AdzunaSearchResponse>(
      `${COUNTRY}/search/${opts.page}`,
      buildParams(opts),
    );
  } catch (e) {
    const code = (e as { code?: string }).code ?? "SEARCH_FAILED";
    writeError(e instanceof Error ? e.message : String(e), code);
    return 1;
  }

  const results = (data.results ?? []).map(toResult);

  if (opts.format === "table") {
    process.stdout.write(renderTable(results) + "\n");
  } else if (opts.format === "plain") {
    process.stdout.write(renderPlain(results) + "\n");
  } else {
    process.stdout.write(
      JSON.stringify(
        { meta: { count: results.length, page: opts.page, total: data.count ?? results.length }, results },
        null,
        2,
      ) + "\n",
    );
  }
  return 0;
}

function renderTable(rows: JobResult[]): string {
  if (rows.length === 0) return "No results.";
  const line = (c: string[]) =>
    [
      c[0]!.slice(0, 44).padEnd(44),
      c[1]!.slice(0, 22).padEnd(22),
      c[2]!.slice(0, 24).padEnd(24),
      c[3]!,
    ].join("  ");
  const header = line(["TITLE", "COMPANY", "LOCATION", "DATE"]);
  return [
    header,
    "-".repeat(header.length),
    ...rows.map((r) => line([r.title, r.company ?? "—", r.location ?? "—", (r.date ?? "—").slice(0, 10)])),
  ].join("\n");
}

function renderPlain(rows: JobResult[]): string {
  if (rows.length === 0) return "No results.";
  return rows
    .map((r) =>
      [
        r.title,
        `  ${r.company ?? "—"} · ${r.location ?? "—"} · ${(r.date ?? "—").slice(0, 10)}${r.comp ? ` · ${r.comp}` : ""}`,
        `  id: ${r.id}`,
        `  ${r.url}`,
      ].join("\n"),
    )
    .join("\n\n");
}
