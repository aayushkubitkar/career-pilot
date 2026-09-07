import { describe, expect, test } from "bun:test";
import {
  CompanyListError,
  htmlToText,
  makeId,
  matches,
  parseCompanyCsv,
  parseId,
  scoreQuery,
  snippetOf,
  stemLite,
  type Posting,
} from "../src/helpers";

describe("makeId / parseId", () => {
  test("round-trips, including an externalId containing colons", () => {
    const id = makeId("greenhouse", "stripe", "a:b:c");
    expect(id).toBe("greenhouse:stripe:a:b:c");
    expect(parseId(id)).toEqual({ ats: "greenhouse", slug: "stripe", externalId: "a:b:c" });
  });
  test("accepts every known ats", () => {
    expect(parseId("smartrecruiters:BoschGroup:744000147347753")).toEqual({
      ats: "smartrecruiters",
      slug: "BoschGroup",
      externalId: "744000147347753",
    });
    expect(parseId("ashby:ramp:abc")!.ats).toBe("ashby");
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

  test("location: token overlap, remote always passes", () => {
    expect(matches(p(), { location: "new york" })).toBe(true);
    expect(matches(p(), { location: "New York, NY" })).toBe(true);
    expect(matches(p(), { location: "berlin" })).toBe(false);
    expect(matches(p({ location: "Remote - US", remote: true }), { location: "Seattle" })).toBe(true);
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

describe("scoreQuery — lenient fuzzy title matching", () => {
  const p = (title: string, extra: Partial<Posting> = {}): Posting => ({
    id: "greenhouse:acme:1", ats: "greenhouse", slug: "acme", externalId: "1",
    title, company: "Acme", team: null, location: null, remote: null, date: null,
    url: "https://x", comp: null, deadline: null, ...extra,
  });

  test("a real PM role is NOT dropped for a wording mismatch", () => {
    // The bug this fixes: `-q "product manager fraud"` returned 0 because Chime
    // titles the role "Transaction Risk Decisioning", not "...Fraud".
    const chime = p("Product Manager, Transaction Risk Decisioning");
    expect(scoreQuery(chime, "product manager fraud")).toBeGreaterThan(0);
    // ...and "risk" IS in the title, so it scores higher than a pure guess
    expect(scoreQuery(p("Product Manager, Transaction Risk Decisioning"), "product manager risk"))
      .toBeGreaterThan(scoreQuery(chime, "product manager fraud"));
  });

  test("full topic coverage scores 1", () => {
    expect(scoreQuery(p("Senior Product Manager, Payments Risk"), "product manager payments risk")).toBe(1);
  });

  test("seniority words never gate — a Senior posting still matches `product manager`", () => {
    expect(scoreQuery(p("Senior Product Manager, Checkout"), "product manager")).toBe(1);
    expect(scoreQuery(p("Product Manager II, Growth"), "senior product manager")).toBe(1);
  });

  test("role gate: a non-PM title scores 0 for a PM query", () => {
    expect(scoreQuery(p("Software Engineer, Payments"), "product manager payments")).toBe(0);
    expect(scoreQuery(p("Data Scientist, Fraud"), "product manager fraud")).toBe(0);
  });

  test("off-function titles are penalised, not excluded", () => {
    const mktg = scoreQuery(p("Product Marketing Manager, Payments"), "product manager payments");
    const real = scoreQuery(p("Product Manager, Payments"), "product manager payments");
    expect(mktg).toBeGreaterThan(0);
    expect(mktg).toBeLessThan(real);
  });

  test("stemming: 'payments' matches 'payment', 'decisioning' matches 'decision'", () => {
    expect(scoreQuery(p("Product Manager, Payment Systems"), "product manager payments")).toBe(1);
    expect(scoreQuery(p("Product Manager, Risk Decisioning"), "product manager decision")).toBe(1);
  });

  test("team and snippet count toward topic hits, not just the title", () => {
    const withTeam = p("Product Manager, Core Experience", { team: "Trust & Safety" });
    expect(scoreQuery(withTeam, "product manager trust safety")).toBeGreaterThan(
      scoreQuery(p("Product Manager, Core Experience"), "product manager trust safety"),
    );
  });

  test("empty query -> 1", () => {
    expect(scoreQuery(p("Anything"), "")).toBe(1);
  });
});

describe("stemLite", () => {
  test("strips common suffixes, keeps short words", () => {
    expect(stemLite("payments")).toBe("payment");
    expect(stemLite("disputes")).toBe("disput");
    expect(stemLite("decisioning")).toBe("decision");
    expect(stemLite("risk")).toBe("risk");
    expect(stemLite("is")).toBe("is"); // too short to stem
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
