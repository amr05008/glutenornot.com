# Weekly health snapshot

`template.html` is the GlutenOrNot weekly health snapshot page — a self-contained
HTML file (fonts embedded as data URIs, no external requests) in the app's
"Clinic" design system. It is published as a Claude artifact and refreshed by a
scheduled Monday-morning routine:

- **Artifact URL (stable, update in place — never mint a new one):**
  `https://claude.ai/code/artifact/792616b2-6d2c-48eb-9e08-06edd1bed6e5`
- **Data sources:** PostHog `scan` / `scan_failed` events (project 457245) and
  Sentry (`aaron-roy` org, `glutenornot-mobile` project).

## The Monday routine (2026-07-27 shape)

The cloud routine that refreshes this page pulls PostHog via **direct query-API
curl calls authenticated with a personal API key** embedded in the routine
config (PostHog is not an attachable MCP connector for cloud routines — don't
"fix" it back to MCP). Rotating or revoking that key means updating the routine
config; a dead key makes the routine abort loudly to #glutenornot rather than
publish a partial week. Sentry stays on MCP (non-fatal if unavailable).

Besides refreshing this artifact, the routine posts **two Discord messages**:
the snapshot summary and an "analyst read" (week-over-week deltas, patterns
after a per-person cluster triage that excludes App Store review / RC-testing
traffic, 1–3 recommendations). The analyst content is Discord-only — it never
adds sections to this page, and the update contract below is unchanged by it.

## Exclude App Review traffic (do this in every query)

Apple's App Store review runs the app once per submission and never gets a
successful scan: bursts of 3–6 OCR attempts inside ~3 minutes, zero successes,
tiny images. Left in, it inflates the OCR failure count after **every** release —
over the 30 days to 2026-08-13 it was **14 of 35 `ocr_failed` events (40%)**,
which pushed the OCR failure rate from a real 12.1% to a reported 18.7%.

The identities are not stable (`distinct_id` is a SHA-256 of the client IP, so a
new one appears per submission), so the exclusion is a **rule, not a list**: the
traffic geolocates to Cupertino, CA. Two equivalent forms — use either:

```sql
-- PostHog cohort (id 481139), auto-picks up each new submission
AND person_id NOT IN COHORT 'App Review traffic (Cupertino)'

-- or the same rule inline, no cohort dependency
AND coalesce(properties.$geoip_city_name, '') != 'Cupertino'
```

Apply it to **every** tile, chart, and split on this page. Two rules to keep it honest:

- Say so on the page: the `.fnote` must state that App Review traffic is excluded
  and how many events that removed, so an excluded real user can never hide silently.
- **Do not** exclude by city anywhere else. Cupertino is Apple HQ and has never
  produced a real user; every other city that looks like a failure cluster has
  turned out to hold several genuine users, so a city rule there deletes real
  signal. Aaron's own RC-testing device needs a per-identity exclusion, kept in
  the routine config — never a city rule, and never an identifier committed to
  this repo.

Un-upgraded clients (`platform: unknown`) are **not** internal traffic — see the
2026-08-13 session log. They are real users on an iOS build older than 1.2.0.
Keep them in.

## Update contract

The file in this directory always holds the **last published week** — it doubles
as a worked example. To produce a new week, copy it and edit ONLY the data
listed below; never touch styles, fonts, or layout.

| Region | What to change |
|---|---|
| Header `.range` | `Jul 13 – Jul 18, 2026` → new window (UTC dates) |
| Tile 1 `.num` + | successful `scan` count |
| Tile 2 `.num` | success rate % = scans / (scans + scan_failed), rounded. Since 2026-08-28 the denominator includes `reason: cancelled` (user gave up on a slow attempt) — by design; see `api/ANALYTICS.md` "Metric caveats" |
| Tile 2 `.hint` | `of N scan attempts` |
| Tile 3 `.num` + `.hint` | `uniq(person_id)` over both events; hint = users with ≥1 success |
| Tile 4 | stays `0` unless PostHog shows `claude_error`/`server_error`/`rate_limited` failures — then use that count and drop the `good` class |
| Chart gridlines | keep 3–4 lines; labels + `bottom` % must match `MAX` in the script |
| `DAYS` array (script) | one entry per day: `ok` (scans), `bc`/`ocr` (method split of ok), `fail` |
| `MAX` (script) | smallest round number ≥ the biggest `ok + fail` day, with ~10% headroom |
| "How people scan" band + rows | barcode vs OCR counts of successful scans (`flex` = count) |
| "Verdicts delivered" band + rows | safe / caution / unsafe counts (`flex` = count) |
| "Why scans miss" rows | `scan_failed` reasons desc by count; bar widths relative to the max; keep the zero row for backend errors. `cancelled` (client beacon, iOS ≥ 1.4.3) = the user tapped Cancel, almost always weak signal — read it with `elapsed_ms` (how long they waited) and `image_kb`, not as an app failure. `interrupted` (same build) = the app went to the background mid-scan (user switched apps, took a call); no `elapsed_ms`, and not "gave up" |
| `.fnote` | one honest sentence about the misses |
| Sentry card | `0 events` + `quiet` chip + "verified silence" note when clean. If events exist: use the count (drop the `quiet` class on `.num`), a `warn` chip, and replace `.sentry-note` with an issue box (CSS already present): `<div class="sentry-issue"><span class="iid">GLUTENORNOT-MOBILE-N</span><div class="ititle">Error title</div><div class="imeta">N users · date · one-line interpretation</div></div>`. Client timeouts report at `level:warning` — count warnings, not just errors. |

Sanity checks before publishing: tile 1 = Σ `DAYS[].ok` = band totals on both
split cards; tile 2 denominator = Σ ok + Σ fail; failure rows sum to Σ fail.

Verdicts render caution-heavy by design (all oats → caution, uncertain →
caution) — a caution-majority week is normal, not a data error. **But since
2026-08-28** a product with an explicit gluten-free label returns `safe`
(decision 003, `plans/gf-label-claim-2026-08-28.md`), so the OCR caution share
should fall from the ~69% it ran at for the prior 90 days. The plan's step 9
(~2026-09-25) is the check: split OCR `scan` verdicts by the boolean
`properties.gf_claim_present` over 28 days — labeled products' caution share
should drop sharply, unlabeled roughly unchanged. Mention it in the analyst
read once the window is in; it does not add a section to this page.

Privacy: counts only. Never add product names, barcodes, or any scanned
content — the privacy policy promises "no record of what you scanned."
