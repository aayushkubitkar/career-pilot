import { describe, expect, test } from "bun:test";
import { toPosting as gh, type GhJob } from "../src/connectors/greenhouse";
import { toPosting as lever, type LeverPosting } from "../src/connectors/lever";
import { toPosting as ashby, type AshbyJob } from "../src/connectors/ashby";
import { toPosting as sr } from "../src/connectors/smartrecruiters";
import type { Company } from "../src/helpers";

const company = (over: Partial<Company> = {}): Company => ({
  name: "Acme",
  ats: "greenhouse",
  slug: "acme",
  priority: "normal",
  ...over,
});

describe("greenhouse.toPosting", () => {
  const job = (o: Partial<GhJob> = {}): GhJob => ({
    id: 12345,
    title: "  Senior Software Engineer  ",
    absolute_url: "https://acme.com/jobs/12345",
    location: { name: "Remote - US" },
    first_published: "2026-08-01T00:00:00-04:00",
    updated_at: "2026-08-20T00:00:00-04:00",
    departments: [{ name: "Engineering" }],
    ...o,
  });

  test("id, title trim, url, team, date prefers first_published", () => {
    const p = gh(company(), job());
    expect(p.id).toBe("greenhouse:acme:12345");
    expect(p.externalId).toBe("12345");
    expect(p.title).toBe("Senior Software Engineer");
    expect(p.company).toBe("Acme");
    expect(p.team).toBe("Engineering");
    expect(p.url).toBe("https://acme.com/jobs/12345");
    expect(p.date).toBe("2026-08-01T00:00:00-04:00");
  });

  test("falls back to updated_at when first_published is absent", () => {
    expect(gh(company(), job({ first_published: null })).date).toBe("2026-08-20T00:00:00-04:00");
  });

  test("infers remote from the location string", () => {
    expect(gh(company(), job()).remote).toBe(true);
    expect(gh(company(), job({ location: { name: "New York, NY" } })).remote).toBe(false);
  });

  test("decodes double-encoded HTML content into text", () => {
    const p = gh(company(), job({ content: "&lt;p&gt;Build &amp;amp; ship&lt;/p&gt;&lt;p&gt;Own it&lt;/p&gt;" }));
    expect(p.description).toBe("Build & ship\nOwn it");
  });
});

describe("lever.toPosting", () => {
  const job = (o: Partial<LeverPosting> = {}): LeverPosting => ({
    id: "681fbc53-1e34-4a46-8677-3a78118674eb",
    text: "Backend Engineer",
    categories: { location: "Baltimore, MD", team: "Platform" },
    workplaceType: "remote",
    createdAt: 1565990241800,
    hostedUrl: "https://jobs.lever.co/acme/681fbc53-1e34-4a46-8677-3a78118674eb",
    descriptionPlain: "Do the work.",
    lists: [{ text: "Requirements", content: "<li>Go</li><li>SQL</li>" }],
    ...o,
  });

  test("maps uuid id, epoch createdAt -> ISO date, workplaceType -> remote", () => {
    const p = lever(company({ slug: "acme" }), job());
    expect(p.id).toBe("lever:acme:681fbc53-1e34-4a46-8677-3a78118674eb");
    expect(p.date).toBe(new Date(1565990241800).toISOString());
    expect(p.remote).toBe(true);
    expect(p.team).toBe("Platform");
  });

  test("on-site -> remote:false, unspecified -> null", () => {
    expect(lever(company(), job({ workplaceType: "on-site" })).remote).toBe(false);
    expect(lever(company(), job({ workplaceType: "unspecified" })).remote).toBeNull();
  });

  test("folds lists into the description", () => {
    const p = lever(company(), job());
    expect(p.description).toContain("Do the work.");
    expect(p.description).toContain("Requirements");
    expect(p.description).toContain("Go");
  });
});

describe("ashby.toPosting", () => {
  const job = (o: Partial<AshbyJob> = {}): AshbyJob => ({
    id: "34413f8d-26bf-4bbc-8ade-eb309a0e2245",
    title: " Security Engineer, Cloud",
    department: "Engineering",
    team: "Backend",
    location: "New York, NY (HQ)",
    publishedAt: "2026-04-07T17:12:35.753+00:00",
    isListed: true,
    isRemote: true,
    jobUrl: "https://jobs.ashbyhq.com/acme/34413f8d",
    descriptionPlain: "Keep the cloud safe.",
    compensation: { compensationTierSummary: "$215K – $275K" },
    ...o,
  });

  test("maps fields, trims title, keeps isRemote and comp", () => {
    const p = ashby(company({ slug: "acme" }), job());
    expect(p.id).toBe("ashby:acme:34413f8d-26bf-4bbc-8ade-eb309a0e2245");
    expect(p.title).toBe("Security Engineer, Cloud");
    expect(p.remote).toBe(true);
    expect(p.date).toBe("2026-04-07T17:12:35.753+00:00");
    expect(p.comp).toBe("$215K – $275K");
    expect(p.team).toBe("Backend");
  });

  test("isRemote false is preserved, not coerced to null", () => {
    expect(ashby(company(), job({ isRemote: false })).remote).toBe(false);
  });
});

describe("smartrecruiters.toPosting", () => {
  const summary = {
    id: "744000147545499",
    name: "  Quality Engineer  ",
    refNumber: "REF1",
    releasedDate: "2026-09-04T12:00:00.000Z",
    company: { identifier: "AveryDennison", name: "Avery Dennison" },
    location: { city: "Painesville", region: "OH", country: "us", remote: false, hybrid: false, fullLocation: "Painesville, OH, United States" },
    department: { label: "Engineering Services" },
    function: { label: "Engineering" },
  };

  test("summary form: id, trimmed title, team, url, date; no description/snippet", () => {
    const p = sr(company({ slug: "AveryDennison", name: "Avery Dennison" }), summary as never);
    expect(p.id).toBe("smartrecruiters:AveryDennison:744000147545499");
    expect(p.title).toBe("Quality Engineer");
    expect(p.team).toBe("Engineering Services");
    expect(p.date).toBe("2026-09-04T12:00:00.000Z");
    expect(p.url).toBe("https://jobs.smartrecruiters.com/AveryDennison/744000147545499");
    expect(p.remote).toBe(false);
    expect(p.snippet).toBeNull();
    expect(p.description).toBeNull();
  });

  test("collapses a duplicated location segment", () => {
    const p = sr(company(), { ...summary, location: { ...summary.location, fullLocation: "United States, United States" } } as never);
    expect(p.location).toBe("United States");
  });

  test("detail form: folds jobAd sections into the description", () => {
    const detail = {
      ...summary,
      postingUrl: "https://jobs.smartrecruiters.com/AveryDennison/744000147545499-quality-engineer",
      jobAd: {
        sections: {
          jobDescription: { title: "The role", text: "<p>Lead quality improvements.</p>" },
          qualifications: { title: "You have", text: "<ul><li>1+ years in Quality</li></ul>" },
        },
      },
    };
    const p = sr(company({ slug: "AveryDennison" }), detail as never, detail as never);
    expect(p.url).toBe(detail.postingUrl);
    expect(p.description).toContain("Lead quality improvements.");
    expect(p.description).toContain("1+ years in Quality");
    expect(p.snippet).toBeTruthy();
  });
});
