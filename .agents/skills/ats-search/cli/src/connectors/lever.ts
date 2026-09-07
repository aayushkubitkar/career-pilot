// Lever Postings API — public, keyless.
//   list:   GET https://api.lever.co/v0/postings/{slug}?mode=json   -> RawPosting[]
//   detail: GET https://api.lever.co/v0/postings/{slug}/{id}?mode=json -> RawPosting
// An unknown slug returns 404. `createdAt` is epoch milliseconds. Descriptions
// come as both HTML and *Plain variants; `lists` holds the requirement bullets.

import {
  fetchJson,
  makeId,
  snippetOf,
  type Company,
  type ListOpts,
  type Posting,
} from "../helpers.js";

const BASE = "https://api.lever.co/v0/postings";

interface LeverList {
  text?: string;
  content?: string;
}

export interface LeverPosting {
  id: string;
  text: string;
  categories?: {
    location?: string;
    team?: string;
    department?: string;
    commitment?: string;
    allLocations?: string[];
  };
  workplaceType?: string; // "remote" | "on-site" | "hybrid" | "unspecified"
  country?: string;
  createdAt?: number;
  hostedUrl: string;
  applyUrl?: string;
  descriptionPlain?: string;
  descriptionBodyPlain?: string;
  additionalPlain?: string;
  lists?: LeverList[];
}

function fullText(p: LeverPosting): string | null {
  const parts: string[] = [];
  if (p.descriptionPlain) parts.push(p.descriptionPlain.trim());
  for (const l of p.lists ?? []) {
    const label = l.text ? `${l.text}:` : "";
    const items = (l.content ?? "")
      .replace(/<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .trim();
    if (items) parts.push(`${label}\n${items}`.trim());
  }
  if (p.additionalPlain) parts.push(p.additionalPlain.trim());
  const joined = parts.join("\n\n").trim();
  return joined || null;
}

export function toPosting(company: Company, p: LeverPosting): Posting {
  const location = p.categories?.location?.trim() || p.categories?.allLocations?.[0] || null;
  const wt = (p.workplaceType ?? "").toLowerCase();
  const remote = wt === "remote" ? true : wt === "on-site" || wt === "onsite" ? false : null;
  const description = fullText(p);
  return {
    id: makeId("lever", company.slug, p.id),
    ats: "lever",
    slug: company.slug,
    externalId: p.id,
    title: p.text.trim(),
    company: company.name,
    team: p.categories?.team?.trim() || p.categories?.department?.trim() || null,
    location,
    remote,
    date: p.createdAt ? new Date(p.createdAt).toISOString() : null,
    url: p.hostedUrl,
    comp: null,
    deadline: null,
    snippet: snippetOf(description),
    description,
  };
}

export async function list(company: Company, _opts: ListOpts): Promise<Posting[]> {
  const data = await fetchJson<LeverPosting[]>(
    `${BASE}/${encodeURIComponent(company.slug)}?mode=json`,
  );
  if (!data) throw new Error(`board "${company.slug}" not found on Lever (404)`);
  return data.map((p) => toPosting(company, p));
}

export async function getOne(company: Company, externalId: string): Promise<Posting | null> {
  const data = await fetchJson<LeverPosting>(
    `${BASE}/${encodeURIComponent(company.slug)}/${encodeURIComponent(externalId)}?mode=json`,
  );
  if (!data || Array.isArray(data)) return null;
  return toPosting(company, data);
}
