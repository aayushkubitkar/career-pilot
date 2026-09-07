// Ashby job-board API — public, keyless.
//   list: GET https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true
// There is no per-posting endpoint; the list already carries `descriptionPlain`
// in full, so `detail` refetches the board and picks the row out.

import {
  fetchJson,
  makeId,
  snippetOf,
  type Company,
  type ListOpts,
  type Posting,
} from "../helpers.js";

const BASE = "https://api.ashbyhq.com/posting-api/job-board";

export interface AshbyJob {
  id: string;
  title: string;
  department?: string;
  team?: string;
  employmentType?: string;
  location?: string;
  secondaryLocations?: Array<{ location?: string }>;
  publishedAt?: string;
  isListed?: boolean;
  isRemote?: boolean;
  workplaceType?: string;
  jobUrl: string;
  applyUrl?: string;
  descriptionPlain?: string;
  descriptionHtml?: string;
  compensation?: {
    compensationTierSummary?: string | null;
    scrapeableCompensationSalarySummary?: string | null;
  };
}

interface AshbyBoard {
  jobs: AshbyJob[];
}

export function toPosting(company: Company, j: AshbyJob): Posting {
  const description = j.descriptionPlain?.trim() || null;
  const comp =
    j.compensation?.compensationTierSummary?.trim() ||
    j.compensation?.scrapeableCompensationSalarySummary?.trim() ||
    null;
  return {
    id: makeId("ashby", company.slug, j.id),
    ats: "ashby",
    slug: company.slug,
    externalId: j.id,
    title: j.title.trim(),
    company: company.name,
    team: j.team?.trim() || j.department?.trim() || null,
    location: j.location?.trim() || null,
    remote: typeof j.isRemote === "boolean" ? j.isRemote : null,
    date: j.publishedAt || null,
    url: j.jobUrl,
    comp,
    deadline: null,
    snippet: snippetOf(description),
    description,
  };
}

async function fetchBoard(slug: string): Promise<AshbyJob[]> {
  const data = await fetchJson<AshbyBoard>(
    `${BASE}/${encodeURIComponent(slug)}?includeCompensation=true`,
  );
  if (!data) throw new Error(`board "${slug}" not found on Ashby (404)`);
  return (data.jobs ?? []).filter((j) => j.isListed !== false);
}

export async function list(company: Company, _opts: ListOpts): Promise<Posting[]> {
  const jobs = await fetchBoard(company.slug);
  return jobs.map((j) => toPosting(company, j));
}

export async function getOne(company: Company, externalId: string): Promise<Posting | null> {
  const jobs = await fetchBoard(company.slug);
  const found = jobs.find((j) => j.id === externalId);
  return found ? toPosting(company, found) : null;
}
