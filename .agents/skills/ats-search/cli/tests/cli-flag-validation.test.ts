import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { runCLI } from "./helpers";

// Network-free: every case here asserts on a validation error emitted before any
// HTTP call, or (for the valid case) the absence of a validation error code.

function err(stderr: string): { error?: string; code?: string } {
  try {
    return JSON.parse(stderr);
  } catch {
    return {};
  }
}

const GOOD_LIST = join(import.meta.dir, "fixtures", "companies.csv");

describe("ats-search CLI validation", () => {
  test("unknown flag -> exit 1, UNKNOWN_FLAG on stderr", async () => {
    const r = await runCLI(["search", "--frob", "x"]);
    expect(r.exitCode).toBe(1);
    expect(err(r.stderr).code).toBe("UNKNOWN_FLAG");
  });

  test("--ats with a bad value -> BAD_ARG", async () => {
    const r = await runCLI(["search", "--ats", "workday"]);
    expect(r.exitCode).toBe(1);
    expect(err(r.stderr).code).toBe("BAD_ARG");
  });

  for (const v of ["1.5", "0", "foo"]) {
    test(`--jobage ${v} -> BAD_ARG (not silently truncated/ignored)`, async () => {
      const r = await runCLI(["search", "--jobage", v]);
      expect(r.exitCode).toBe(1);
      expect(err(r.stderr).code).toBe("BAD_ARG");
    });
  }

  test("--remote bad value -> BAD_ARG", async () => {
    const r = await runCLI(["search", "--remote", "sometimes"]);
    expect(err(r.stderr).code).toBe("BAD_ARG");
  });

  test("detail with no id -> NO_ID", async () => {
    const r = await runCLI(["detail"]);
    expect(r.exitCode).toBe(1);
    expect(err(r.stderr).code).toBe("NO_ID");
  });

  test("detail with an unparseable id -> BAD_ID", async () => {
    const r = await runCLI(["detail", "just-a-string"]);
    expect(err(r.stderr).code).toBe("BAD_ID");
  });

  test("missing company list -> NO_COMPANY_LIST", async () => {
    const r = await runCLI(["search", "--companies-file", "/no/such/file.csv"]);
    expect(r.exitCode).toBe(1);
    expect(err(r.stderr).code).toBe("NO_COMPANY_LIST");
  });

  test("malformed company list -> BAD_COMPANY_LIST", async () => {
    const bad = join(import.meta.dir, "fixtures", "bad-companies.csv");
    const r = await runCLI(["search", "--companies-file", bad]);
    expect(err(r.stderr).code).toBe("BAD_COMPANY_LIST");
  });

  test("--company matching nothing -> NO_COMPANIES_SELECTED", async () => {
    const r = await runCLI(["search", "--companies-file", GOOD_LIST, "--company", "nope"]);
    expect(err(r.stderr).code).toBe("NO_COMPANIES_SELECTED");
  });

  test("no command -> help on stdout, exit 1 (matches the shipped portal skills)", async () => {
    const r = await runCLI([]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("ats-search");
  });

  test("<command> --help -> help on stdout, exit 0", async () => {
    const r = await runCLI(["search", "--help"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("SEARCH FLAGS");
  });

  test("valid numeric flags produce no BAD_ARG", async () => {
    // Uses the bundled fixture list so it never hits the network for the parse
    // step; it may still exit non-zero if offline, but never with BAD_ARG.
    const r = await runCLI([
      "search", "--companies-file", GOOD_LIST,
      "--jobage", "7", "--page", "1", "--limit", "1", "--company", "nope",
    ]);
    expect(err(r.stderr).code).not.toBe("BAD_ARG");
  });
});
