// SmartRecruiters Posting API — public, keyless.
//   list:   GET https://api.smartrecruiters.com/v1/companies/{id}/postings?q=&country=us&limit=&offset=
//   detail: GET https://api.smartrecruiters.com/v1/companies/{id}/postings/{postingId}
//
// Unlike Greenhouse/Lever/Ashby this API PAGINATES (limit 100, `totalFound`) and
// takes a server-side `q`, so `list()` uses the active --query and caps the
// number of pages — some SmartRecruiters boards hold thousands of postings.
// It also returns 200 + `totalFound: 0` for an unknown company identifier (not
// 404); the caller surfaces that as a note, not a crash. Identifiers are
// case-sensitive (`BoschGroup`, not `boschgroup`).

import {
  fetchJson,
  htmlToText,
  makeId,
  snippetOf,
  type Company,
  type ListOpts,
  type Posting,
} from "../helpers.js";

const BASE = "https://api.smartrecruiters.com/v1/companies";
const PAGE = 100; // API max
const DEFAULT_CAP = 150; // when no --query narrows the board

interface SrLabeled {
  label?: string;
}
interface SrPostingSummary {
  id: string;
  name: string;
  refNumber?: string;
  releasedDate?: string;
  company?: { identifier?: string; name?: string };
  location?: {
    city?: string;
    region?: string;
    country?: string;
    remote?: boolean;
    hybrid?: boolean;
    fullLocation?: string;
  };
  department?: SrLabeled;
  function?: SrLabeled;
  typeOfEmployment?: SrLabeled;
}
interface SrList {
  offset: number;
  limit: number;
  totalFound: number;
  content: SrPostingSummary[];
}
interface SrPostingDetail extends SrPostingSummary {
  postingUrl?: string;
  applyUrl?: string;
  jobAd?: {
    sections?: Record<string, { title?: string; text?: string } | undefined>;
  };
}

function locString(loc: SrPostingSummary["location"]): string | null {
  if (!loc) return null;
  const raw = loc.fullLocation || [loc.city, loc.region, loc.country?.toUpperCase()].filter(Boolean).join(", ");
  if (!raw) return null;
  // Some boards (e.g. Experian) send "United States, United States" — collapse repeats.
  const parts: string[] = [];
  for (const p of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
    if (parts[parts.length - 1]?.toLowerCase() !== p.toLowerCase()) parts.push(p);
  }
  return parts.join(", ") || null;
}

function publicUrl(company: Company, id: string, detail?: SrPostingDetail): string {
  return detail?.postingUrl || `https://jobs.smartrecruiters.com/${company.slug}/${id}`;
}

export function toPosting(company: Company, p: SrPostingSummary, detail?: SrPostingDetail): Posting {
  const loc = p.location;
  const remote = loc?.remote === true ? true : loc?.remote === false && loc?.hybrid !== true ? false : null;

  let description: string | null = null;
  const sections = detail?.jobAd?.sections;
  if (sections) {
    description =
      [
        sections.jobDescription?.text,
        sections.qualifications?.text,
        sections.additionalInformation?.text,
      ]
        .map((t) => htmlToText(t))
        .filter(Boolean)
        .join("\n\n") || null;
  }

  return {
    id: makeId("smartrecruiters", company.slug, p.id),
    ats: "smartrecruiters",
    slug: company.slug,
    externalId: p.id,
    title: p.name.trim(),
    company: company.name,
    team: p.department?.label?.trim() || p.function?.label?.trim() || null,
    location: locString(loc),
    remote,
    date: p.releasedDate || null,
    url: publicUrl(company, p.id, detail),
    comp: null,
    deadline: null,
    snippet: description ? snippetOf(description) : null,
    description,
  };
}

export async function list(company: Company, opts: ListOpts): Promise<Posting[]> {
  const cap = opts.maxResults && opts.maxResults > 0 ? opts.maxResults : DEFAULT_CAP;
  const params = new URLSearchParams({ country: "us", limit: String(PAGE) });
  if (opts.query) params.set("q", opts.query);
  // A city-looking --location is passed through server-side; state/region matches
  // still get caught by the CLI's own client-side location filter.
  if (opts.location && !/^(remote|us|usa|united states)$/i.test(opts.location.trim())) {
    params.set("city", opts.location.trim());
  }

  const out: Posting[] = [];
  let offset = 0;
  let total = Infinity;
  while (offset < total && out.length < cap) {
    params.set("offset", String(offset));
    const data = await fetchJson<SrList>(
      `${BASE}/${encodeURIComponent(company.slug)}/postings?${params.toString()}`,
    );
    if (!data) throw new Error(`SmartRecruiters returned no response for "${company.slug}"`);
    total = data.totalFound ?? 0;
    if (offset === 0 && total === 0 && !opts.query && !params.get("city")) {
      // Unfiltered and empty — most likely a wrong identifier (SmartRecruiters
      // 200s on unknown companies). Signal it without failing the whole run.
      const err = new Error(
        `0 SmartRecruiters postings for "${company.slug}" — verify the identifier ` +
          `(case-sensitive; SmartRecruiters returns empty, not 404, for a wrong one)`,
      );
      (err as { soft?: boolean }).soft = true;
      throw err;
    }
    const batch = data.content ?? [];
    if (batch.length === 0) break;
    for (const p of batch) {
      out.push(toPosting(company, p));
      if (out.length >= cap) break;
    }
    offset += PAGE;
  }
  return out;
}

export async function getOne(company: Company, externalId: string): Promise<Posting | null> {
  const data = await fetchJson<SrPostingDetail>(
    `${BASE}/${encodeURIComponent(company.slug)}/postings/${encodeURIComponent(externalId)}`,
  );
  if (!data) return null;
  return toPosting(company, data, data);
}
