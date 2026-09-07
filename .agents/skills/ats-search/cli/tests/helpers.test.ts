import { describe, expect, test } from "bun:test";
import {
  CompanyListError,
  htmlToText,
  makeId,
  matches,
  parseCompanyCsv,
  parseId,
  snippetOf,
  type Posting,
} from "../src/helpers";

describe("makeId / parseId", () => {
  test("round-trips, including an externalId containing colons", () => {
    const id = makeId("greenhouse", "stripe", "a:b:c");
    expect(id).toBe("greenhouse:stripe:a:b:c");
    expect(parseId(id)).toEqual({ ats: "greenhouse", slug: "stripe", externalId: "a:b:c" });
  });
  test("rejects an unknown ats or a malformed id", () => {
    expect(parseId("monster:x:1")).toBeNull();
    expect(parseId("nope")).toBeNull();
    expect(parseId("greenhouse:only")).toBeNull();
  });
});

describe("parseCompanyCsv", () => {
  test("parses rows, skips comments/blank lines and a header anywhere", () => {
    const csv = [
      "# a comment",
      "",
      "name,ats,slug,priority",
      "Stripe,greenhouse,stripe,high",
      "Spotify,lever,spotify",
      "  Ramp , ashby , ramp , low ",
    ].join("\n");
    const rows = parseCompanyCsv(csv);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ name: "Stripe", ats: "greenhouse", slug: "stripe", priority: "high" });
    expect(rows[1]!.priority).toBe("normal"); // default
    expect(rows[2]).toEqual({ name: "Ramp", ats: "ashby", slug: "ramp", priority: "low" });
  });

  test("throws with a line number on an unknown ats", () => {
    expect(() => parseCompanyCsv("Foo,workday,foo")).toThrow(CompanyListError);
    expect(() => parseCompanyCsv("Foo,workday,foo")).toThrow(/line 1/);
  });

  test("throws on a bad priority and on a short row", () => {
    expect(() => parseCompanyCsv("Foo,greenhouse,foo,urgent")).toThrow(/priority/);
    expect(() => parseCompanyCsv("Foo,greenhouse")).toThrow(/name,ats,slug/);
  });
});

describe("matches — client-side filters", () => {
  const p = (o: Partial<Posting> = {}): Posting => ({
    id: "greenhouse:acme:1",
    ats: "greenhouse",
    slug: "acme",
    externalId: "1",
    title: "Senior Backend Engineer",
    company: "Acme",
    team: null,
    location: "New York, NY",
    remote: false,
    date: new Date().toISOString(),
    url: "https://x",
    comp: null,
    deadline: null,
    ...o,
  });

  test("query: every token must appear in the title", () => {
    expect(matches(p(), { query: "backend engineer" })).toBe(true);
    expect(matches(p(), { query: "Senior BACKEND" })).toBe(true);
    expect(matches(p(), { query: "backend rust" })).toBe(false);
  });

  test("location: case-insensitive substring", () => {
    expect(matches(p(), { location: "new york" })).toBe(true);
    expect(matches(p(), { location: "berlin" })).toBe(false);
  });

  test("remote flag and remote-in-location both satisfy --remote remote", () => {
    expect(matches(p({ remote: true }), { remote: "remote" })).toBe(true);
    expect(matches(p({ remote: null, location: "Remote - US" }), { remote: "remote" })).toBe(true);
    expect(matches(p(), { remote: "remote" })).toBe(false);
  });

  test("onsite excludes remote postings", () => {
    expect(matches(p({ remote: true }), { remote: "onsite" })).toBe(false);
    expect(matches(p(), { remote: "onsite" })).toBe(true);
  });

  test("jobage drops old postings but keeps undated ones", () => {
    const old = p({ date: new Date(Date.now() - 40 * 86400_000).toISOString() });
    expect(matches(old, { jobageDays: 14 })).toBe(false);
    expect(matches(p({ date: null }), { jobageDays: 14 })).toBe(true);
  });
});

describe("htmlToText / snippetOf", () => {
  test("htmlToText keeps block breaks and decodes entities", () => {
    expect(htmlToText("<p>One</p><ul><li>a</li><li>b</li></ul>")).toBe("One\na\nb");
  });
  test("htmlToText double-encoded pass", () => {
    expect(htmlToText("&lt;p&gt;Caf&#xE9;&lt;/p&gt;", true)).toBe("Café");
  });
  test("snippetOf truncates on a word boundary with an ellipsis", () => {
    const s = snippetOf("word ".repeat(60), 50)!;
    expect(s.length).toBeLessThanOrEqual(51);
    expect(s.endsWith("…")).toBe(true);
  });
  test("snippetOf returns null for empty input", () => {
    expect(snippetOf(null)).toBeNull();
  });
});
