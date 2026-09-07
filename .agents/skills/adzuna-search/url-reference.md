# adzuna-search — endpoint reference

Data source: **Adzuna public jobs API**. Docs: <https://developer.adzuna.com/docs/search>
Connector code: `cli/src/helpers.ts` + `cli/src/commands/search.ts`.

## Auth

Key pair, from the environment only:

- `ADZUNA_APP_ID` — the "Application ID" (`app_id` query param)
- `ADZUNA_APP_KEY` — an "Application Key" (`app_key` query param)

Both are sent as query params (the API has no header auth). Free signup at
<https://developer.adzuna.com>. A 401/403 from the API means bad/expired credentials.

## Search

```
GET https://api.adzuna.com/v1/api/jobs/us/search/{page}
      ?app_id={id}&app_key={key}
      &content-type=application/json
      &results_per_page={1..50}
      &sort_by=date|relevance|salary
      [&what=...] [&what_phrase=...] [&what_exclude=...]
      [&where=...] [&distance={km}]
      [&max_days_old={n}]
      [&category={tag}]
      [&full_time=1] [&permanent=1]
      [&salary_min={usd}]
```

`{page}` is a path segment, 1-indexed. Response:

```jsonc
{
  "count": 1947,           // total matches (our meta.total)
  "mean": 128000,          // Adzuna's mean salary estimate for the query (unused)
  "results": [
    {
      "id": "5868641518",           // -> our id "adzuna:us:5868641518"
      "title": "Senior <strong>Software</strong> Engineer",  // may contain <strong> match highlights — stripped
      "company": { "display_name": "Pearson" },
      "location": { "display_name": "Hoboken, Hudson County", "area": ["US","New Jersey","Hudson County"] },
      "created": "2026-09-03T06:02:40Z",   // -> our date
      "redirect_url": "https://www.adzuna.com/land/ad/5868641518?se=<sig>&utm_...",  // -> our url
      "description": "…truncated to ~200 chars, ends with an ellipsis…",  // -> our snippet
      "salary_min": 150000,
      "salary_max": 200000,
      "salary_is_predicted": "0",   // "1" = Adzuna's ML estimate -> we drop comp; "0" = from the posting
      "category": { "label": "IT Jobs", "tag": "it-jobs" },
      "contract_time": "full_time",
      "contract_type": "permanent"
    }
  ]
}
```

### Category tags (`/v1/api/jobs/us/categories`)

```
accounting-finance-jobs, it-jobs, sales-jobs, customer-services-jobs, engineering-jobs,
hr-jobs, healthcare-nursing-jobs, hospitality-catering-jobs, pr-advertising-marketing-jobs,
logistics-warehouse-jobs, teaching-jobs, trade-construction-jobs, admin-jobs, legal-jobs,
creative-design-jobs, graduate-jobs, retail-jobs, consultancy-jobs, manufacturing-jobs,
scientific-qa-jobs, social-work-jobs, travel-jobs, energy-oil-gas-jobs, property-jobs,
charity-voluntary-jobs, domestic-help-cleaning-jobs, maintenance-jobs, part-time-jobs,
other-general-jobs, unknown
```

## Detail — not available

Adzuna exposes **no** `/jobs/{id}` endpoint. `redirect_url` is a signed
`adzuna.com/land/ad/{id}?se=<sig>&…` link that 403s to non-browser clients, and the
unsigned `adzuna.com/land/ad/{id}` also 403s. So `detail` cannot fetch a posting body — it
parses the reference, echoes the canonical URL, and returns `detail_supported: false`. The
full JD must be fetched from `url` by a browser/WebFetch.

## HTTP

`User-Agent: ats-search-cli/1.0 (adzuna-search)`, `Accept: application/json`, 20s timeout,
exp backoff (max 5) on 429/5xx, explicit message on 401/403, throw on hard failure.
