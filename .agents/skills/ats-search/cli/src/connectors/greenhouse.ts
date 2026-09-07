// Greenhouse Boards API — public, keyless.
//   list:   GET https://boards-api.greenhouse.io/v1/boards/{slug}/jobs
//   detail: GET https://boards-api.greenhouse.io/v1/boards/{slug}/jobs/{id}?questions=false
// The base list is light (no description); the per-job endpoint carries `content`
// as *double-encoded* HTML (&lt;p&gt;…). See url-reference.md.

import {
  fetchJson,
  htmlToText,
  makeId,
  snippetOf,
  type Company,
  type ListOpts,
  type Posting,
} from "../helpers.js";

const BASE = "https://boards-api.greenhouse.io/v1/boards";

export interface GhJob {
  id: number;
  title: string;
  company_name?: string;
  updated_at?: string;
  first_published?: string | null;
  application_deadline?: string | null;
  absolute_url: string;
  location?: { name?: string } | null;
  content?: string;
  departments?: Array<{ name?: string }>;
}

interface GhList {
  jobs: GhJob[];
  meta?: { total?: number };
}

export function toPosting(company: Company, j: GhJob): Posting {
  const location = j.location?.name?.trim() || null;
  const team = j.departments?.map((d) => d.name).filter(Boolean).join(", ") || null;
  const description = j.content ? htmlToText(j.content, true) : null;
  return {
    id: makeId("greenhouse", company.slug, String(j.id)),
    ats: "greenhouse",
    slug: company.slug,
    externalId: String(j.id),
    title: j.title.trim(),
    company: company.name,
    team,
    location,
    remote: location ? /\bremote\b/i.test(location) : null,
    date: j.first_published || j.updated_at || null,
    url: j.absolute_url,
    comp: null,
    deadline: j.application_deadline || null,
    snippet: description ? snippetOf(description) : null,
    description,
  };
}

export async function list(company: Company, _opts: ListOpts): Promise<Posting[]> {
  const data = await fetchJson<GhList>(`${BASE}/${encodeURIComponent(company.slug)}/jobs`);
  if (!data) throw new Error(`board "${company.slug}" not found on Greenhouse (404)`);
  return (data.jobs ?? []).map((j) => {
    const p = toPosting(company, j);
    p.snippet = null; // base list has no content; snippet comes from detail
    p.description = null;
    return p;
  });
}

export async function getOne(company: Company, externalId: string): Promise<Posting | null> {
  const data = await fetchJson<GhJob>(
    `${BASE}/${encodeURIComponent(company.slug)}/jobs/${encodeURIComponent(externalId)}?questions=false`,
  );
  if (!data) return null;
  return toPosting(company, data);
}
