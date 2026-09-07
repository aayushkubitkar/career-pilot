import { describe, expect, test } from "bun:test";
import { runCLI } from "./helpers";

// Network-free. Validation errors and the missing-credentials guard all fire
// before (or instead of) any HTTP call. Credentials are explicitly blanked so
// the suite behaves identically whether or not the runner has real keys set.
const NO_CREDS = { ADZUNA_APP_ID: "", ADZUNA_APP_KEY: "" };

function err(stderr: string): { error?: string; code?: string } {
  try {
    return JSON.parse(stderr);
  } catch {
    return {};
  }
}

describe("adzuna-search CLI validation", () => {
  test("unknown flag -> UNKNOWN_FLAG", async () => {
    const r = await runCLI(["search", "--frob", "x"], NO_CREDS);
    expect(r.exitCode).toBe(1);
    expect(err(r.stderr).code).toBe("UNKNOWN_FLAG");
  });

  test("--sort bad value -> BAD_ARG (before any network call or creds check)", async () => {
    const r = await runCLI(["search", "--sort", "cheapest"], NO_CREDS);
    expect(err(r.stderr).code).toBe("BAD_ARG");
  });

  for (const v of ["1.5", "0", "abc"]) {
    test(`--jobage ${v} -> BAD_ARG`, async () => {
      const r = await runCLI(["search", "--jobage", v], NO_CREDS);
      expect(err(r.stderr).code).toBe("BAD_ARG");
    });
  }

  test("search without credentials -> MISSING_CREDENTIALS", async () => {
    const r = await runCLI(["search", "-q", "engineer"], NO_CREDS);
    expect(r.exitCode).toBe(1);
    const e = err(r.stderr);
    expect(e.code).toBe("MISSING_CREDENTIALS");
    expect(e.error).toMatch(/ADZUNA_APP_ID/);
  });

  test("detail with no id -> NO_ID", async () => {
    const r = await runCLI(["detail"], NO_CREDS);
    expect(err(r.stderr).code).toBe("NO_ID");
  });

  test("detail with an unparseable ref -> BAD_ID", async () => {
    const r = await runCLI(["detail", "banana"], NO_CREDS);
    expect(err(r.stderr).code).toBe("BAD_ID");
  });

  test("detail with a valid ref -> exit 0, documented no-detail payload (no creds needed)", async () => {
    const r = await runCLI(["detail", "adzuna:us:5868641518"], NO_CREDS);
    expect(r.exitCode).toBe(0);
    const p = JSON.parse(r.stdout);
    expect(p.id).toBe("adzuna:us:5868641518");
    expect(p.detail_supported).toBe(false);
    expect(p.url).toContain("5868641518");
  });

  test("no command -> help on stdout, exit 1", async () => {
    const r = await runCLI([], NO_CREDS);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("adzuna-cli");
  });

  test("search --help -> exit 0", async () => {
    const r = await runCLI(["search", "--help"], NO_CREDS);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("SEARCH FLAGS");
  });
});
