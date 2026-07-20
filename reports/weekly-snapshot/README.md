# Weekly health snapshot

`template.html` is the GlutenOrNot weekly health snapshot page — a self-contained
HTML file (fonts embedded as data URIs, no external requests) in the app's
"Clinic" design system. It is published as a Claude artifact and refreshed by a
scheduled Monday-morning routine:

- **Artifact URL (stable, update in place — never mint a new one):**
  `https://claude.ai/code/artifact/792616b2-6d2c-48eb-9e08-06edd1bed6e5`
- **Data sources:** PostHog `scan` / `scan_failed` events (project 457245) and
  Sentry (`aaron-roy` org, `glutenornot-mobile` project).

## Update contract

The file in this directory always holds the **last published week** — it doubles
as a worked example. To produce a new week, copy it and edit ONLY the data
listed below; never touch styles, fonts, or layout.

| Region | What to change |
|---|---|
| Header `.range` | `Jul 13 – Jul 18, 2026` → new window (UTC dates) |
| Tile 1 `.num` + | successful `scan` count |
| Tile 2 `.num` | success rate % = scans / (scans + scan_failed), rounded |
| Tile 2 `.hint` | `of N scan attempts` |
| Tile 3 `.num` + `.hint` | `uniq(person_id)` over both events; hint = users with ≥1 success |
| Tile 4 | stays `0` unless PostHog shows `claude_error`/`server_error`/`rate_limited` failures — then use that count and drop the `good` class |
| Chart gridlines | keep 3–4 lines; labels + `bottom` % must match `MAX` in the script |
| `DAYS` array (script) | one entry per day: `ok` (scans), `bc`/`ocr` (method split of ok), `fail` |
| `MAX` (script) | smallest round number ≥ the biggest `ok + fail` day, with ~10% headroom |
| "How people scan" band + rows | barcode vs OCR counts of successful scans (`flex` = count) |
| "Verdicts delivered" band + rows | safe / caution / unsafe counts (`flex` = count) |
| "Why scans miss" rows | `scan_failed` reasons desc by count; bar widths relative to the max; keep the zero row for backend errors |
| `.fnote` | one honest sentence about the misses |
| Sentry card | `0 events` + `quiet` chip + "verified silence" note when clean; if events exist, use the count, a `warn`/`unsafe` chip, and an issue box naming the top issue (see git history of this file for the event-week variant) |

Sanity checks before publishing: tile 1 = Σ `DAYS[].ok` = band totals on both
split cards; tile 2 denominator = Σ ok + Σ fail; failure rows sum to Σ fail.

Verdicts render caution-heavy by design (all oats → caution, uncertain →
caution) — a caution-majority week is normal, not a data error.

Privacy: counts only. Never add product names, barcodes, or any scanned
content — the privacy policy promises "no record of what you scanned."
