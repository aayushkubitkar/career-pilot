import { describe, expect, test } from "bun:test";
import { parseRef, stripHtml, toResult, type AdzunaJob } from "../src/helpers";

const job = (o: Partial<AdzunaJob> = {}): AdzunaJob => ({
  id: "5868641518",
  title: "Senior <strong>Software</strong> Engineer",
  description: "Build things &amp; ship them. LangGraph, LLMs&#8230;",
  created: "2026-09-03T06:02:40Z",
  redirect_url: "https://www.adzuna.com/land/ad/5868641518?se=abc&v=DEF",
  company: { display_name: "Pearson" },
  location: { display_name: "Hoboken, Hudson County", area: ["US", "New Jersey", "Hudson County"] },
  category: { label: "IT Jobs", tag: "it-jobs" },
  contract_time: "full_time",
  salary_min: 173201.69,
  salary_max: 173201.69,
  salary_is_predicted: "1",
  ...o,
});

describe("toResult", () => {
  test("namespaces the id, strips HTML from title, maps core fields", () => {
    const r = toResult(job());
    expect(r.id).toBe("adzuna:us:5868641518");
    expect(r.title).toBe("Senior Software Engineer");
    expect(r.company).toBe("Pearson");
    expect(r.location).toBe("Hoboken, Hudson County");
    expect(r.date).toBe("2026-09-03T06:02:40Z");
    expect(r.url).toBe("https://www.adzuna.com/land/ad/5868641518?se=abc&v=DEF");
    expect(r.category).toBe("it-jobs");
  });

  test("snippet is the decoded, de-tagged description", () => {
    expect(toResult(job()).snippet).toBe("Build things & ship them. LangGraph, LLMs…");
  });

  test("comp is null when Adzuna predicted the salary", () => {
    expect(toResult(job({ salary_is_predicted: "1" })).comp).toBeNull();
  });

  test("comp is a formatted range only when the posting stated it", () => {
    expect(toResult(job({ salary_is_predicted: "0", salary_min: 150000, salary_max: 200000 })).comp).toBe(
      "$150,000–$200,000",
    );
    expect(toResult(job({ salary_is_predicted: "0", salary_min: 180000, salary_max: 180000 })).comp).toBe(
      "$180,000",
    );
  });

  test("missing company/location -> null, never omitted", () => {
    const r = toResult(job({ company: undefined, location: undefined }));
    expect(r.company).toBeNull();
    expect(r.location).toBeNull();
  });
});

describe("stripHtml", () => {
  test("removes tags and decodes named + numeric entities", () => {
    expect(stripHtml("<p>A &amp; B &#8211; C&#x2014;D</p>")).toBe("A & B – C—D");
  });
  test("null/empty -> null", () => {
    expect(stripHtml(null)).toBeNull();
    expect(stripHtml("")).toBeNull();
  });
});

describe("parseRef", () => {
  test("accepts adzuna:us:<id>, land URL, and bare id", () => {
    expect(parseRef("adzuna:us:5868641518")).toBe("5868641518");
    expect(parseRef("https://www.adzuna.com/land/ad/5868641518?se=x")).toBe("5868641518");
    expect(parseRef("5868641518")).toBe("5868641518");
  });
  test("rejects junk", () => {
    expect(parseRef("not-an-id")).toBeNull();
    expect(parseRef("adzuna:us:")).toBeNull();
  });
});
