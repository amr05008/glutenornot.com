# Honor the gluten-free label claim — a regulated claim beats ambiguous-ingredient heuristics

**Status 2026-08-28: open — scoped from the weak-LTE farm-stand incident, not started.**
Sibling plan: `plans/weak-signal-upload-2026-08-28.md` (mobile client, different agent
session — see "Coordination" below). This plan is **server-only** (`api/`), ships on push to
`main` via Vercel, and reaches both clients with no app build.

## Why (the incident, in numbers)

2026-08-28, a farm stand in rural Connecticut: a bag of kettle corn **labeled gluten-free** came back
`caution`. Claude's own explanation opened with *"Good news — this kettle corn is labeled
gluten-free and lists no wheat, barley, or rye"* — and then flagged *natural & artificial
flavor*, *natural smoke flavor*, and *hydrolyzed soy protein*. The explanation and the verdict
disagree; that is the tell that the rubric forced the verdict.

Aaron's hunch — "the app's general thing it prescribes is caution" — is measurable. PostHog
(project 457245), 90 days to 2026-08-28:

- OCR verdicts: **172 caution / 56 safe / 23 unsafe → 69% caution**, 3:1 over safe.
  Barcode: 400 / 110 / 71 → also 69% (mostly "no OFF ingredient data"; out of scope here).
- Of the 172 OCR cautions, only **4** are `confidence: high`; 133 are medium/low. The model
  isn't warning — it's hedging.

The cause is one missing rule. `api/analyze.js` label rubric (lines ~138–152):
"natural flavors", maltodextrin, modified food starch, dextrin, "spices", hydrolyzed
vegetable protein → caution, unconditionally; `safe` requires *no* ambiguous ingredients.
**There is no rule for a gluten-free claim on the label.** The only mentions of GF labels
are the oats rule (a label does *not* clear oats — correct, keep) and the per-language
glossary entries ("still verify ingredients"). "Hydrolyzed vegetable protein" is also
matching *hydrolyzed soy protein*, which names its source and is not a gluten risk.

Domain facts the rule rests on: in the US, "gluten-free" on a package is a regulated claim
(FDA, 21 CFR 101.91: <20 ppm, manufacturer liable) covering every ingredient including
flavors and starches; FALCPA separately requires wheat in a "natural flavor" to be declared.
The EU rule (Reg. 828/2014) is the same 20 ppm. Celiac organizations treat a GF label as
the green light, with oats as the one community carve-out — which the app already has.

The real safety cost of the status quo is alert fatigue: when 7 in 10 scans say caution,
caution carries no information and users stop reading it — including when it matters.

Goal: a product bearing an explicit gluten-free claim returns `safe` (with the claim named
as the reason) unless a specific, stronger signal overrides it — with zero new false-safe
paths, proven by an eval that stays in the repo this time.

---

## Decisions & toggles (read this first — everything below is derived from it)

Confirmed 2026-08-28:

| Decision | Choice | Why | Reversibility |
|---|---|---|---|
| Core rule | Explicit GF claim on the product → ambiguous ingredients don't downgrade → `safe`; explanation names the claim as what's carrying the verdict | FDA 21 CFR 101.91 / EU 828/2014: <20 ppm, manufacturer liable — beats ingredient heuristics | Prompt text |
| Oats | Bare claim does **not** clear oats; a **certified** mark (GFCO / CSA / "Certified Gluten-Free") does | Matches CLAUDE.md "unless certified GF" and the existing oats rule | Prompt line |
| Listed gluten source despite claim | wheat / barley / rye / malt / wheat starch in the list → `caution`, explanation says the label and list disagree | A claim isn't a license to ignore a listed source | Toggle T3 |
| "May contain wheat" on a labeled-GF product | **`caution`** | Legally still GF; community split; rare on labeled products | Toggle T1 — the flip most likely |
| HVP | Narrow to hydrolyzed protein of unstated or wheat source | "hydrolyzed soy protein" names its source | Prompt line |
| Negation guard | Claim must be affirmative about *this* product — not "not gluten-free", "gluten-free options", "gluten-free facility/equipment" alone | OCR carries marketing noise | Prompt line |
| Safety floor | `applySafeVerdictFloor` untouched | A claim only counts if it's in the OCR text; the 100-char floor still gates everything | — |
| Analytics | `gf_claim_present` boolean on `scan` (OCR only), detected server-side by regex on the OCR text, not by Claude | Deterministic, testable, a flag not content (privacy invariant holds); measures the rule's effect | Toggle T4 |
| Validation | Frozen eval set checked into the repo, run live against Opus 4.8 before merge, **zero false-safe** required, env-gated so `npm test` stays offline | Verdict semantics change needs evidence; the decision-002 harness wasn't kept | — |
| Barcode path | Out of scope | Its 69% caution is mostly "no ingredient data" | Toggle T5 |
| Ship | Push to main → Vercel, both clients | api is shared | — |

Toggles — flip by editing here, then the prompt text in step 3 and the eval expectations:

- **T1 advisory on a labeled product** — default `caution`. Alternative: `safe`, with the
  explanation noting the advisory ("labeled gluten-free, which is regulated; it also carries
  a shared-equipment note — fine for most people, worth knowing if you're very sensitive").
  Flip = one prompt bullet + eval case 13's expectation.
- **T2 certified clears oats** — default yes. Alternative: no (oats always caution, full
  stop). Flip = one prompt bullet + eval case 6.
- **T3 listed gluten source despite claim** — default `caution` + "label and list disagree".
  Alternative: `unsafe` (treat the listed source as authoritative). Either is never `safe`;
  the eval only asserts not-safe.
- **T4 claim detection for analytics** — default a server-side regex
  (`detectGlutenFreeClaim`). Alternative: have Claude emit `"label_claim": true|false` in
  its JSON (faithful to what drove the verdict, but depends on model compliance and adds
  prompt surface). The prompt *rule* is Claude's either way; this toggle is only about the
  metric.
- **T5 barcode path** — default out. If in: mirror the claim in `assessGlutenSignal`
  (`api/barcode.js`) using Open Food Facts' `labels_tags` (`en:gluten-free`,
  `en:no-gluten`) — CLAUDE.md requires the two vocabularies stay in sync.
- **T6 explanation copy** — default the example in step 3. Cosmetic; edit freely.
- **T7 languages in the claim list** — default en/es/nl/ca/fr/it/de/pt (the prompt's
  existing vocabularies plus the traveler-context set). Add as needed; keep the regex in
  step 4 in sync.

## Coordination with the sibling plan (two sessions in parallel)

Both plans touch the same three api spots: `api/_analytics.js` `buildScanProperties`
(new props), `api/analyze.js` handler (the `trackScan({...})` call around line 348 and the
hoisted metrics block around line 308), and `api/ANALYTICS.md` (the `scan` property list).
Plus `ROADMAP.md` and `CLAUDE.md`.

- Work in your own worktree/branch: **`gf-label-claim-2026-08-28`**
  (`superpowers:using-git-worktrees`). Sibling branch is `weak-signal-upload-2026-08-28`.
- **This plan merges first** — it is smaller and server-only. Move quickly through steps
  1–8 so the sibling's api phase can rebase on it. Conflicts, if any, are additive on both
  sides — keep both sets of properties.
- The only prompt file is `api/analyze.js`; the sibling does not edit `CLAUDE_PROMPT`.

## Skills / conventions the executing session must use

`superpowers:test-driven-development` (the eval is written and run *before* the prompt
changes, to capture the baseline); `npm test` (vitest, root `web`) green before every
commit; `/grill` before the PR; `/ship` per chunk; `/wrap-up` at the end (session log +
this file's status line). Privacy invariant: `gf_claim_present` is a boolean — never the
claim text, never the product. Eval fixtures are **synthetic** label text written for the
eval, not copied from real user scans.

---

## Execution steps (build order)

**1. Export `analyzeWithClaude`** from `api/analyze.js` (it is currently module-private;
the eval needs the real `CLAUDE_PROMPT` + `callClaude` + `parseClaudeResponse` path — the
same thing the decision-002 A/B exercised). Nothing else changes.

**2. Write the eval first and capture the baseline.**
- Fixtures: `web/tests/api/evals/gf-claim-cases.js` — an array of
  `{ id, ocrText, expect: 'safe' | 'not-safe' | 'caution', why }`. OCR text is synthetic
  and label-shaped (brand line, "Ingredients: …", allergen line, claim line). Cases:
  1. US kettle corn — labeled "Gluten Free"; corn, sugar, oil, salt, natural & artificial
     flavor, natural smoke flavor, hydrolyzed soy protein → **safe** (the incident).
  2. Labeled GF + maltodextrin + modified food starch + spices → **safe**.
  3. "Sin gluten" + "aromas naturales" + "almidón modificado" (es) → **safe**.
  4. "Glutenvrij" + "gemodificeerd zetmeel" + "natuurlijke aroma's" (nl) → **safe**.
  5. Labeled GF + "rolled oats", no certification → **caution** (oats rule holds).
  6. "Certified Gluten-Free (GFCO)" + rolled oats → **safe** (T2).
  7. Labeled GF + "malt extract" → **not-safe** (T3).
  8. Labeled GF + "wheat starch" (EU-style) → **not-safe** (T3).
  9. "This product is not gluten-free" + natural flavors → **caution** (negation guard).
  10. "Gluten-free options available" on a multi-product sheet + natural flavors → **caution**.
  11. No claim + natural flavors → **caution** (baseline — unchanged behavior).
  12. No claim + rice, salt, sunflower oil → **safe** (baseline — unchanged behavior).
  13. Labeled GF + "may contain wheat" → **caution** (T1).
  14. Labeled GF + "processed on equipment that also processes wheat" → **caution** (T1).
  15. Labeled GF + "hydrolyzed vegetable protein" (source unstated) → **safe** (the claim
      covers it — the HVP narrowing only matters *without* a claim; add case 16 for that).
  16. No claim + "hydrolyzed soy protein" only → **safe** (HVP narrowing).
- Runner: `web/tests/api/evals/gf-claim.live.test.js`, wrapped in
  `describe.skipIf(!process.env.RUN_LIVE_EVALS)` — vitest's root is `web`, so this file is
  inside the default glob and **must** be gated or `npm test` will hit the network.
  Temperature is not pinned in `callClaude` (`api/_utils.js` — default 1.0), so run every
  **not-safe / caution** case **3×** and require not-safe on all runs; run **safe** cases
  **2×** and require safe on both. Assert with the real `parseClaudeResponse` output.
  Direct Anthropic calls: no PostHog events, no scan-quota consumption — but ~16 cases ×
  2–3 runs of Opus 4.8 ≈ 40 calls ≈ cents; fine.
- Run it against the **unchanged** prompt:
  `set -a; source .env; set +a; RUN_LIVE_EVALS=1 npx vitest run --root web tests/api/evals`
  Expected baseline: cases 1–4, 6, 15 (and likely 16) **fail** with `caution`; everything
  else passes. Paste the baseline table into the session log — it is the "before" for the
  PR description.

**3. The prompt change** — `api/analyze.js`, label section (~lines 138–155).
- In the `caution` bullet, replace `hydrolyzed vegetable protein` with
  `hydrolyzed vegetable/plant protein of unstated source (a named non-gluten source such as "hydrolyzed soy protein" or "hydrolyzed corn protein" is not ambiguous)`.
- Add a new block after the Verdict Criteria (before Guidelines). Proposed text — adjust
  wording, keep the structure:

  ```
  #### Gluten-free label claims
  - If the text contains an explicit, affirmative gluten-free claim about this product —
    "gluten-free" / "gluten free", "sin gluten" / "libre de gluten", "glutenvrij",
    "sense gluten", "sans gluten", "senza glutine", "glutenfrei", "sem glúten", or a
    certification mark such as GFCO, CSA, or "Certified Gluten-Free" — treat it as the
    strongest evidence on the label. In the US and EU that claim is regulated (<20 ppm
    gluten) and covers every ingredient, including flavors, starches, and hydrolyzed proteins.
  - With such a claim present, the ambiguous ingredients listed under "caution" (natural
    flavors, maltodextrin, modified food starch, dextrin, spices, hydrolyzed protein of
    unstated source) do NOT lower the verdict. Return "safe", and say in the explanation
    that the gluten-free label is what covers those ingredients.
  - The claim does NOT override:
    - Oats — still "caution", unless the claim is a third-party certification mark (GFCO,
      CSA, "Certified Gluten-Free").
    - A listed gluten source (wheat, barley, rye, malt, wheat starch, or their equivalents
      in any language) — return "caution" and say that the label and the ingredient list
      disagree.
    - An explicit "may contain wheat/gluten" or shared-equipment/facility advisory —
      return "caution".
  - Only honor a claim about this product. Ignore negated or unrelated phrasing:
    "not gluten-free", "gluten-free options available", a "gluten-free facility" or
    "equipment" statement on its own, or a claim that refers to a different product.
  ```
- Tone section, "For safe products": add
  `"Labeled gluten-free — that's a regulated claim, so the natural flavors are covered. You're good to go."`
- Keep `- Be conservative—when uncertain, use "caution"` — it still governs everything the
  new block doesn't name.
- Unit tests (`web/tests/api/analyze.test.js`, mirror the `CLAUDE_PROMPT multilingual
  support` describe): the prompt contains the claim rule, the oats exception, the
  negation guard, the narrowed HVP wording, and the multilingual claim phrases (T7).

**4. `gf_claim_present` on the `scan` event.**
- `detectGlutenFreeClaim(text)` in `api/analyze.js`, exported: case-insensitive match on
  the T7 phrase list (`gluten[\s-]*free`, `sin gluten`, `libre de gluten`, `glutenvrij`,
  `sense gluten`, `sans gluten`, `senza glutine`, `glutenfrei`, `sem gl[uú]ten`,
  `certified gluten[\s-]*free`, `gfco`), with a `(?<!not\s)` guard on the English form.
  Returns a boolean. Document that it is a *presence* signal for the metric, not the
  verdict rule — Claude still reads the text.
- Handler: compute after OCR; pass `gfClaimPresent` to `trackScan`;
  `buildScanProperties` adds `if (gfClaimPresent != null) props.gf_claim_present = …`
  (OCR only — omit on barcode).
- Tests: `detectGlutenFreeClaim` positives/negatives per language and the negation;
  `web/tests/api/analytics.test.js` includes/omits the property.

**5. Run the live eval against the new prompt.** Iterate on wording until: every `safe`
case is safe on both runs, every `not-safe`/`caution` case is never safe across 3 runs,
and baseline cases 11–12 are unchanged. If a `not-safe` case ever returns `safe`, that is
a blocker — tighten the override text before touching anything else. Paste the final table
into the session log.

**6. Docs.**
- `CLAUDE.md` Guidelines: extend "Be conservative with verdicts" with one line — an
  explicit gluten-free claim (regulated, <20 ppm) lifts ambiguous-ingredient cautions to
  `safe`; oats, a listed gluten source, and may-contain advisories still win; point here.
- `api/ANALYTICS.md`: `gf_claim_present` under `scan` (OCR only; boolean; why).
- `ROADMAP.md`: this plan's line, with the 69%-caution / 4-high-confidence numbers.
- `.claude/decisions/003-honor-gf-label-claim.md`: short record — context (regulation,
  alert fatigue), the overrides, the eval as the gate. Follow the 001/002 format.

**7. `/grill`, then PR.** PR body: the before/after eval tables, the 90-day verdict
distribution, and the T1/T2/T3 defaults so a reviewer can disagree with a specific line.
`npm test` green (the live eval is skipped there by design).

**8. Merge → Vercel.** Tell the sibling session it can rebase. Then Aaron re-scans the
kettle corn bag (or any labeled-GF product with natural flavors) from the app: expect
`safe` with the claim named in the explanation.

**9. Read the effect (2–4 weeks; hand to the weekly review).**
```sql
SELECT properties.gf_claim_present AS claim, properties.verdict AS verdict, count() AS n
FROM events WHERE event='scan' AND properties.method='ocr' AND timestamp >= now() - INTERVAL 28 DAY
GROUP BY claim, verdict ORDER BY claim, n DESC
```
Expect the caution share among `claim = true` scans to fall sharply and `claim = false` to
be roughly unchanged. Overall OCR caution share should drop from 69% toward whatever the
unlabeled-processed-food share actually is. If `claim = true` cautions stay high, read a
sample of explanations' *reasons* (not content) and revisit T1/T3. Then close this plan
with a CLOSED header in the style of `plans/ocr-capture-assist-2026-07-18.md`.

## Definition of done

- Eval in repo, env-gated, with a recorded before/after; zero false-safe on adversarial
  cases across repeated runs.
- The incident label returns `safe` in production with the claim named.
- `gf_claim_present` populated on OCR `scan` events; docs + decision record written.
- Sibling plan notified to rebase.

## Out of scope (deliberately)

Relaxing the ambiguous-ingredient list itself when *no* claim is present (a much bigger
semantic change with real downside — revisit only with data from step 9); the barcode
path (T5); menu mode (a GF claim on a menu item is already a per-item judgement); any
client change.
