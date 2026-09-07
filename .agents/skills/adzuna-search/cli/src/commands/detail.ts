import { COUNTRY, parseRef, writeError } from "../helpers.js";

export interface DetailOpts {
  ref: string; // "adzuna:us:{id}", a redirect URL, or a bare numeric id
  format: "json" | "plain";
}

/**
 * Adzuna has no per-posting API endpoint and its search results carry only a
 * ~200-char truncated description. `detail` therefore cannot return a full
 * posting — it resolves the reference to the canonical URL and tells the caller
 * to fetch that (which `/scrape` Step 2 and `/apply` already do for aggregator
 * results via WebFetch). This is a documented limitation of the source, not a
 * bug; see SKILL.md "No detail endpoint".
 */
export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = parseRef(opts.ref);
  if (!id) {
    writeError(
      `could not parse an Adzuna reference from "${opts.ref}" (expected "adzuna:${COUNTRY}:<id>", ` +
        `an adzuna.com/land/ad/<id> URL, or a bare numeric id)`,
      "BAD_ID",
    );
    return 1;
  }

  // If the caller passed a full (signed) redirect URL, keep it — it's the only
  // link that reliably resolves. Otherwise hand back the unsigned land URL.
  const passedUrl = opts.ref.match(/https?:\/\/[^\s]*adzuna\.com\/land\/ad\/\d+[^\s]*/i)?.[0];
  const url = passedUrl ?? `https://www.adzuna.com/land/ad/${id}`;

  const payload = {
    id: `adzuna:${COUNTRY}:${id}`,
    source: "adzuna",
    url,
    detail_supported: false,
    note:
      "Adzuna's API has no per-posting endpoint and search returns only a truncated " +
      "description. Fetch `url` for the full posting text (WebFetch/browser). If the " +
      "unsigned land URL 403s, use the signed redirect_url from the original search result.",
  };

  if (opts.format === "plain") {
    process.stdout.write(
      [`Adzuna posting ${payload.id}`, `URL: ${payload.url}`, "", payload.note].join("\n") + "\n",
    );
  } else {
    process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
  }
  return 0;
}
