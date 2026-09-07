import { readFile } from "node:fs/promises";
import { CONNECTORS } from "../connectors/index.js";
import {
  CompanyListError,
  parseCompanyCsv,
  parseId,
  writeError,
  type Company,
  type Posting,
} from "../helpers.js";

export interface DetailOpts {
  companiesFile: string;
  id: string; // "{ats}:{slug}:{externalId}" or a job-board URL
  format: "json" | "plain";
}

/** Recover {ats, slug, externalId} from an `id` or, failing that, a known board URL. */
function resolveTarget(
  id: string,
  companies: Company[],
): { ats: Company["ats"]; slug: string; externalId: string } | null {
  const parsed = parseId(id);
  if (parsed) return parsed;

  // Greenhouse: https://boards.greenhouse.io/{slug}/jobs/{id}  or  ...?gh_jid={id}
  let m = id.match(/greenhouse\.io\/(?:embed\/job_app\?for=)?([^/?#]+)[/?].*?(?:jobs\/|gh_jid=)(\d+)/i);
  if (m) return { ats: "greenhouse", slug: m[1]!, externalId: m[2]! };
  // Lever: https://jobs.lever.co/{slug}/{uuid}
  m = id.match(/jobs\.lever\.co\/([^/?#]+)\/([0-9a-f-]{36})/i);
  if (m) return { ats: "lever", slug: m[1]!, externalId: m[2]! };
  // Ashby: https://jobs.ashbyhq.com/{slug}/{uuid}
  m = id.match(/jobs\.ashbyhq\.com\/([^/?#]+)\/([0-9a-f-]{36})/i);
  if (m) return { ats: "ashby", slug: m[1]!, externalId: m[2]! };
  // SmartRecruiters: https://jobs.smartrecruiters.com/{slug}/{numericId}-{optional-slug}
  m = id.match(/smartrecruiters\.com\/([^/?#]+)\/(\d{6,})/i);
  if (m) return { ats: "smartrecruiters", slug: m[1]!, externalId: m[2]! };
  return null;
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  let companies: Company[] = [];
  try {
    companies = parseCompanyCsv(await readFile(opts.companiesFile, "utf8"));
  } catch (e) {
    // The company list is only needed for the display name; a missing/broken
    // list is not fatal for detail. Only a genuine parse error is worth noting.
    if (e instanceof CompanyListError) {
      writeError(e.message, "BAD_COMPANY_LIST");
      return 1;
    }
  }

  const target = resolveTarget(opts.id, companies);
  if (!target) {
    writeError(
      `could not parse an ats id or job-board URL from "${opts.id}" (expected "{ats}:{slug}:{externalId}" or a Greenhouse/Lever/Ashby job URL)`,
      "BAD_ID",
    );
    return 1;
  }

  const company: Company =
    companies.find((c) => c.ats === target.ats && c.slug.toLowerCase() === target.slug.toLowerCase()) ??
    { name: target.slug, ats: target.ats, slug: target.slug, priority: "normal" };

  let posting: Posting | null;
  try {
    posting = await CONNECTORS[target.ats].getOne(company, target.externalId);
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED");
    return 1;
  }
  if (!posting) {
    writeError("posting not found (it may have been closed or removed)", "NOT_FOUND");
    return 1;
  }

  const { snippet, ...full } = posting;

  if (opts.format === "plain") {
    const f = (label: string, v: string | null | undefined) => (v ? `${label}: ${v}` : "");
    const lines = [
      full.title,
      `${full.company} · ${full.location ?? "—"}${full.remote ? " · remote" : ""}`,
      f("Team", full.team),
      f("Posted", full.date?.slice(0, 10)),
      f("Deadline", full.deadline?.slice(0, 10)),
      f("Compensation", full.comp),
      "",
      full.description ?? "(no description provided by the ATS)",
      "",
      `URL: ${full.url}`,
      `id: ${full.id}`,
    ].filter((l) => l !== "");
    process.stdout.write(lines.join("\n") + "\n");
  } else {
    process.stdout.write(JSON.stringify(full, null, 2) + "\n");
  }
  return 0;
}
