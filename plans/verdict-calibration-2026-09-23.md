# Verdict Calibration — caution means a specific reason to worry

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop "caution" from being the default answer. Every caution must name one specific, nameable reason, and an ingredient whose source labeling law already covers is no longer a reason.

**Architecture:**
- Both Claude prompts (`api/analyze.js` for photos, `api/barcode.js` for barcodes) get the same new caution rule, plus a required `caution_reason` field.
- The parsers normalize `caution_reason` to a fixed enum.
- The code-side cautions (the char floor, the list gate, the no-data barcode branch) set the field themselves.
- Analytics records the enum, so it's measurable which reasons drive caution.
- A new live eval set holds the rule to zero false-safes.
- It's server-only and ships via Vercel. Clients ignore the new field.

**Tech Stack:** Node/Vercel serverless (`api/`), vitest (`web/tests`), live evals against Claude Opus 4.8 (`web/tests/api/evals`), PostHog HogQL.

**Spec:** the Decided block below, plus decision 006 (written in Task 1). Background:
- `plans/jev-findings-handoff-2026-09-18.md`, findings 3 and 4
- jev-sandbox `experiments/05-llm-side-by-side/RESULTS.md` and `06-vague-ingredients/RESULTS.md`

---

## Decided

- **Aaron, 2026-09-23:** *"'I found a specific reason to worry' is what this app should deliver — not 'I can't rule everything out'. Celiac people in general are cautious by default, that's why they are using a scanner in the first place."*
- **Consequence 1: every caution names exactly one reason** from a fixed list (T1). There is no "just in case" caution.
- **Consequence 2: some ingredients are no longer a reason on their own:**
  - unnamed natural flavors / aroma, spices / seasoning, maltodextrin, dextrin, modified starch, glucose syrup, caramel color, and hydrolyzed vegetable protein of unstated source
  - Why: US, EU, UK, Canadian and Australian law makes wheat be named wherever it's used, including inside those ingredients. EU/UK/CA/AU law also covers barley and rye.
  - With nothing else to worry about, the verdict is `safe`.
- **Menus are out of scope.** A menu's caution already has a specific reason ("ask your server"), so menus get no `caution_reason`.
- **Part B is a separate plan, written after this one ships:** "unreadable" (the char floor, the cut-off gate, garbled text) becomes a neutral *retake* screen instead of an amber caution. It needs the iOS release and bundles with the parked 1.5.1. This plan's `caution_reason: "incomplete"` is the contract Part B builds on.
- **Order: PR #31 (the cut-off list gate) merges first.** This plan branches from `main` after it.
- **Out of scope:**
  - the Jev workstream, which has its own session and plan
  - wheat-derived glucose syrup under the EU exemption (a clinical call; see Not yet known)

## Toggles (still flippable)

| # | Toggle | Default | Flip to |
|---|---|---|---|
| T1 | The reason list (`caution_reason` enum) | `oats`, `may_contain`, `conflict`, `undeclared_source`, `incomplete`, `other` | add or split reasons; any change touches both prompts, `CAUTION_REASONS`, the eval cases and ANALYTICS.md |
| T2 | Unnamed natural flavors on US labels. The residual risk is barley malt: US law requires wheat to be named, not barley | `safe`, optionally with a one-line note | `caution` / `undeclared_source` for English-language labels with no gluten-free claim |
| T3 | Meat and poultry products (sausage, hot dogs, deli meat, jerky, meatballs, marinated meat). US meat products are USDA-regulated, outside the FDA wheat-labeling law | `caution` / `undeclared_source` for their flavorings, spices, seasoning and hydrolyzed protein | treat them like any other product |
| T4 | Yeast extract of unstated source (can come from spent brewer's yeast, which is barley) | `caution` / `undeclared_source` | `safe` |
| T5 | Soy sauce / teriyaki / tamari with no wheat declaration and no gluten-free claim | `caution` / `undeclared_source` | none planned |
| T6 | The optional one-line reassurance on a safe verdict that lists a no-longer-a-reason ingredient | allowed, one sentence, never framed as a risk | forbidden (a bare "You're good to go") |
| T7 | `other` as an escape hatch | allowed and measured | removed if it exceeds 10% of cautions at the day-28 read |
| T9 | Database records with no allergen data (USDA, Nutritionix, UPCitemdb): their text may drop the "Contains:" line, where a US label may declare wheat | `caution` / `incomplete` for an unstated-source ingredient (PR #32 grill) | treat them like Open Food Facts records |
| T8 | Success target at day 28 | caution ≤ 40% of readable label scans (from 68% photo / 65% barcode), `other` ≤ 10% of cautions, zero false-safe reports | revise after the read |

## Not yet known

- **What today's cautions are made of in production.** The `caution_reason` field is how we find out.
  - The Jev experiments are the only evidence so far. On 460 labels with no gluten word that the database marks safe, Claude said caution 43% of the time.
  - 155 of those 204 cautions cited an unnamed flavor, aroma or spice.
- **No clinician has reviewed this policy.** Recommended but not required: a celiac-specialist dietitian reads T2–T5 and the "not a reason" list before merge. Aaron's call.
- **The gluten-free-claim step-9 read (~2026-09-25)** is this plan's baseline. See Task 0.

## Global Constraints

- **Zero false-safes:** no adversarial eval case (`caution` / `unsafe` / `not-safe`) may return `safe` on any sample of the FULL run.
- **Live-eval spend:**
  - Iterate with the default single-sample mode, using `-t` to filter.
  - Run FULL mode once, before merge, with a human approving the command (`.claude/settings.json` asks). A review or grill agent never runs live evals.
- **Privacy invariant:** analytics carry enums, flags and counts only. Never ingredient text, product names or barcodes.
- **Same rule on both paths** (the decision 004 precedent): any rule change lands in `api/analyze.js` *and* `api/barcode.js` in the same PR.
- **The oats caveat sentence is unchanged, verbatim:** `Heads-up: a small share of people with celiac disease react to oats themselves.`
- **A web file change means bumping `CACHE_NAME` in `web/sw.js`** to the next version after whatever `main` has.
- **`npm test` passes before every commit.**
- **`plans/` and `reports/` are gitignored but tracked,** so add them with `git add -f <path>`.

## Review Focus

1. **A US sausage listing "spices, natural flavorings" must stay `caution` / `undeclared_source`** (T3). Pinned by eval case C14 and barcode case BC5.
2. **"Malt" hiding in a longer word.** "maltodextrin" is safe; "malt flavoring", "barley malt syrup" and "malt vinegar" are unsafe. Pinned by cases C19–C22.
3. **Non-English equivalents behave like English.**
   - "aromas naturales", "arôme naturel", "natuurlijk aroma" and "Aroma" are safe.
   - "puede contener trazas de trigo" is `may_contain`.
   - Pinned by cases C5–C7 and C13.
4. **A model reply with a missing or unknown `caution_reason`, or a reason on a non-caution verdict,** is normalized (`other`, or dropped). It never reaches the client or analytics raw. Pinned by the Task 2 unit tests.
5. **An existing claim-rule eval case must not pass vacuously.** Cases whose caution came only from natural flavors would now pass without testing their rule. Task 7 rewrites each one so it still exercises the rule it was written for.

---

### Task 0: Preconditions and baseline

**Files:** none changed. The results are pasted into this plan's "Baseline" section below.

- [ ] **Step 1: Confirm PR #31 is merged, then branch**

```bash
cd /Users/aaronroy/repos/glutenornot.com
git checkout main && git pull
git log --oneline -1 --grep "ingredient list is cut off"   # must print the PR #31 commit
git checkout -b verdict-calibration-2026-09-23
```

- [ ] **Step 2: Record the baseline caution mix (last 60 days, readable label scans)**

```bash
KEY=$(grep -m1 '^POSTHOG_PERSONAL_API_KEY=' .env | cut -d= -f2-)
SQL="SELECT properties.method, properties.verdict, count() FROM events WHERE event='scan' AND timestamp > now() - INTERVAL 60 DAY AND coalesce(properties.\$geoip_city_name,'') != 'Cupertino' AND coalesce(properties.app_version,'') NOT LIKE '%-rc%' AND (properties.method='ocr' AND properties.mode='label' OR properties.method='barcode' AND properties.had_ingredient_data = true) GROUP BY 1,2 ORDER BY 1,2"
curl -sS -X POST "https://us.posthog.com/api/projects/457245/query/" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d "$(jq -n --arg q "$SQL" '{query:{kind:"HogQLQuery",query:$q},refresh:"force_blocking"}')" | jq -c '.results'
```

Expected: roughly the 2026-09-23 numbers.
- Photo labels: 152 caution / 50 safe / 23 unsafe.
- Barcode with ingredient data: 258 / 89 / 52.

Paste the result under **Baseline**.

- [ ] **Step 3: Do the gluten-free-claim step-9 read, grouped by `list_gate`**

```bash
SQL="SELECT properties.gf_claim_present AS claim, properties.list_gate AS gate, properties.verdict AS verdict, count() AS n FROM events WHERE event='scan' AND properties.method='ocr' AND properties.mode='label' AND timestamp >= '2026-08-28' AND coalesce(properties.\$geoip_city_name,'') != 'Cupertino' GROUP BY claim, gate, verdict ORDER BY claim, gate, n DESC"
# same curl as Step 2
```

Paste it under **Baseline**. Then close `plans/gf-label-claim-2026-08-28.md` with a CLOSED header, as that plan's step 9 prescribes.

### Baseline

Recorded 2026-09-23, ~15:25 ET, with `refresh: force_blocking`.

**Step 2: caution mix of readable label scans.** Window: `now() - INTERVAL 60 DAY` at 2026-09-23T19:25:41Z, so from 2026-07-25T19:25Z. Cupertino and `-rc` builds are excluded. This matches the plan's expected numbers exactly.

| method | caution | safe | unsafe | caution share |
|---|---|---|---|---|
| ocr (label) | 152 | 50 | 23 | 68% |
| barcode (with ingredient data) | 258 | 89 | 52 | 65% |

**Step 3: the gluten-free-claim step-9 baseline** (photo labels, grouped by `list_gate`). Window: 2026-08-28T00:00Z to 2026-09-23T19:25:55Z, with Cupertino excluded.

| gf_claim_present | list_gate | caution | safe | unsafe |
|---|---|---|---|---|
| false | null | 76 | 17 | 11 |
| true | null | 5 | 6 | 2 |
| null | null | 1 | — | — |

- **`list_gate` is null on every row, and that is expected.** PR #31 merged at 2026-09-23 15:11 ET. The last photo scan in the window was at 02:55 ET the same day. So no scan in this window had been through the gate yet, and the verdicts above are Claude's own.
- **Decision 004's barcode read is folded in:** `gf_label_present` on barcode `scan` events since 2026-09-16 (the flag shipped in PR #29). Only `true` rows count toward the caution share.
  - true: 3 safe, 1 caution. That is n = 4, too small to judge.
  - false: 12 caution, 7 safe, 1 unsafe.
  - null (no-data or older records): 4 unsafe, 3 caution, 2 safe.
- **The plan stays open.** Per Aaron (2026-09-23), this is the baseline only. The real step-9 read runs on ~2026-09-25, and `plans/gf-label-claim-2026-08-28.md` gets its CLOSED header then. It isn't closed here. That read's window will include this PR's deploy if it merges first, so it should end at this PR's deploy time. Alternatively, group it by `caution_reason IS NULL` to separate pre- and post-decision-006 scans.

### Execution notes (2026-09-23/24, inline execution in the worktree)

These are the places where execution departed from the task text. Each one is in the PR description too.

- **B9 was a false safe, and the fix changed both prompts.** The first all-runner single-sample run returned `safe` on the rewritten B9: "gluten-free rolled oats … whole grain oats" plus a free-text `gluten-free-oats` tag.
  - The model's reason quoted the barcode prompt almost word for word: the list "calls the oats gluten-free", and a claim "clears the oats only". Either reading lets one labeled oat ingredient clear every oat in the list.
  - Both prompts now say "It clears only the oats it names" and "Judge each oat ingredient on its own: 'gluten-free rolled oats, oat flour' still lists plain oat flour." Two offline tests pin the new wording.
  - The re-run passed all 74 cases.
- **gf-claim #25 uses plain oat flour, not "may contain wheat".** An advisory keeps the case at caution even if the model wrongly lifts the ingredient-level claim to the whole product, so it could no longer catch the mistake it exists for (Review Focus 5). The rewrite mirrors B9.
- **The one FULL run happens after the grill settles, still before merge.** Every past grill here produced fix rounds. A prompt fix after a FULL run would force a second one.
- **The live commands point at a different vitest.** In a worktree, `node_modules/vitest/vitest.mjs` doesn't exist, because dependencies resolve up the tree. The runs used the main checkout's `node_modules/vitest/vitest.mjs`, the same install `npm test` uses.
- **Smaller changes, in the task's direction:**
  - The old "be conservative" guard test is now "never safe on a guess".
  - Two safe-tone examples still said a claim covers natural flavor. They now name yeast extract and oats.
  - README step 4 was rewritten as a whole. The prescribed splice would have kept "the claim clears natural flavors" and the stale "oats (unless certified)".
  - The simple diagram's "Unsure? Says caution" became "Caution names its reason", along with its aria-label.
  - The unit test that checks eval labels against the cut-off gate now covers the calibration safe cases.

---

### Task 1: Decision 006 and the CLAUDE.md principle

**Files:**
- Create: `.claude/decisions/006-caution-means-a-specific-reason.md`
- Modify: `CLAUDE.md` (the "Be conservative with verdicts" bullet, and the ambiguous-ingredient wording in the gluten-free-claim bullet)

**Interfaces:**
- Produces: the reason list T1, which every later task uses verbatim: `oats`, `may_contain`, `conflict`, `undeclared_source`, `incomplete`, `other`.

- [ ] **Step 1: Write the decision record**

```markdown
# 006 — Caution means a specific reason to worry

**Date**: 2026-09-23
**Status**: Accepted (Aaron's call, 2026-09-23 — "'I found a specific reason to worry' is what this app should deliver — not 'I can't rule everything out'.")
**Amends**: 003 (the ambiguous-ingredient list that a gluten-free claim lifted)

## Context

In the 60 days to 2026-09-23, 68% of readable photo labels and 65% of barcode
scans with ingredient data came back `caution`. Only 7 of 152 photo cautions
were high confidence. Caution had stopped carrying information.

The jev-sandbox side-by-side (experiment 05) located the source. On 460 labels
with no gluten word that the database marks safe, Claude said caution 43% of
the time. 155 of those 204 cautions cited an unnamed flavor, aroma or spice.
That was the prompt working as written: it listed natural flavors,
maltodextrin, modified starch, dextrin, spices and hydrolyzed protein as
automatic cautions.

## Decision

Every caution names exactly one reason:

- `oats`: oats with no covering gluten-free claim
- `may_contain`: a may-contain, traces, shared-equipment or shared-facility
  warning for a gluten source
- `conflict`: a claim that disagrees with the list, a package statement that
  gluten is present, or a database record that contradicts itself
- `undeclared_source`: an ingredient whose gluten source the maker isn't
  required to declare. That covers flavorings, spices or hydrolyzed protein in
  meat and poultry products; soy sauce with no wheat declaration; and yeast
  extract of unstated source
- `incomplete`: garbled, cut off, or no ingredient list
- `other`: a specific concern none of the above covers, which must be named
  in the explanation

**Not a reason on its own:** unnamed natural flavors or aroma, spices or
seasoning, maltodextrin, dextrin, modified starch, glucose syrup, caramel
color, and hydrolyzed vegetable protein of unstated source, outside a meat or
poultry product. US, EU, UK, Canadian and Australian law requires wheat to be
named wherever it's used, including inside those ingredients. EU, UK, Canadian
and Australian law also covers barley and rye.

## Toggles

T2–T8 are in `plans/verdict-calibration-2026-09-23.md`.

## Costs

- **US labels with unnamed natural flavors now return `safe`.** The residual
  risk is barley malt inside a flavoring, which US law doesn't require to be
  declared. It's usually named, and the app flags named malt as `unsafe`.
- **A gluten-free claim now matters mainly for oats and `undeclared_source`
  ingredients.** Decision 003's lift of ambiguous ingredients is now the
  default without a claim.
```

- [ ] **Step 2: Rewrite the two CLAUDE.md bullets**

Replace:

```
- **Be conservative with verdicts**: When uncertain, use "caution" rather than "safe"
```

with:

```
- **Caution means a specific reason to worry** (decision 006, 2026-09-23): every caution names one `caution_reason` — `oats`, `may_contain`, `conflict`, `undeclared_source`, `incomplete`, or (measured) `other`. An ingredient whose source labeling law already covers (unnamed natural flavors, spices, maltodextrin, dextrin, modified starch, glucose syrup, caramel color, HVP of unstated source — outside meat and poultry products) is not a reason. Conservative still means: when a nameable reason exists, caution; never `safe` on a guess
```

In the gluten-free-claim bullet, replace `that covers natural flavors, maltodextrin, modified starch, spices, and hydrolyzed protein of unstated source` with `that covers oats and the \`undeclared_source\` ingredients (decision 006 made the other ambiguous ingredients safe without a claim)`.

- [ ] **Step 3: Commit**

```bash
git add .claude/decisions/006-caution-means-a-specific-reason.md CLAUDE.md
git commit -m "Decision 006: caution means a specific reason to worry"
```

---

### Task 2: The `caution_reason` contract (offline, TDD)

**Files:**
- Modify: `api/_utils.js` (next to `normalizeVerdict`, ~line 316; export list ~line 325)
- Modify: `api/analyze.js`:
  - `parseClaudeResponse`, ~line 528
  - `applySafeVerdictFloor`
  - `applyIngredientListGate`
- Modify: `api/barcode.js`:
  - `parseClaudeResponse`, ~line 817
  - the no-data branch, ~line 207
- Modify: `web/tests/fixtures/claude-responses.json`: `expected` of `missing_optional_fields`, `invalid_verdict_value`, `no_json_found`, `malformed_json`, `empty_response`
- Test: `web/tests/api/utils.test.js`, `web/tests/api/analyze.test.js`, `web/tests/api/barcode.test.js`

**Interfaces:**
- Produces:
  - `CAUTION_REASONS: string[]`
  - `normalizeCautionReason(verdict: string, reason: unknown): string | undefined`. It returns `undefined` unless `verdict === 'caution'`.
  - Every label analysis whose `verdict` is `caution` carries `caution_reason`, one of `CAUTION_REASONS`. Menus never do.

- [ ] **Step 1: Write the failing unit tests**

In `web/tests/api/utils.test.js`, add `CAUTION_REASONS` and `normalizeCautionReason` to the import from `../../../api/_utils.js`, then:

```js
describe('normalizeCautionReason (decision 006)', () => {
  it('keeps a known reason, case- and whitespace-insensitively', () => {
    expect(normalizeCautionReason('caution', 'may_contain')).toBe('may_contain');
    expect(normalizeCautionReason('caution', ' OATS ')).toBe('oats');
  });

  it('maps a missing or unknown reason on a caution to "other"', () => {
    expect(normalizeCautionReason('caution', undefined)).toBe('other');
    expect(normalizeCautionReason('caution', 'natural flavors')).toBe('other');
    expect(normalizeCautionReason('caution', 42)).toBe('other');
  });

  it('drops any reason on a verdict that is not caution', () => {
    expect(normalizeCautionReason('safe', 'oats')).toBeUndefined();
    expect(normalizeCautionReason('unsafe', 'conflict')).toBeUndefined();
  });

  it('lists exactly the decision-006 reasons', () => {
    expect(CAUTION_REASONS).toEqual(['oats', 'may_contain', 'conflict', 'undeclared_source', 'incomplete', 'other']);
  });
});
```

In `web/tests/api/analyze.test.js`, inside `describe('parseClaudeResponse')`:

```js
  it('keeps a valid caution_reason on a label caution', () => {
    const r = parseClaudeResponse(JSON.stringify({ mode: 'label', verdict: 'caution', caution_reason: 'oats', explanation: 'Contains oats.' }));
    expect(r.caution_reason).toBe('oats');
  });

  it('never passes an unknown caution_reason through, and drops one on a safe verdict', () => {
    expect(parseClaudeResponse(JSON.stringify({ mode: 'label', verdict: 'caution', caution_reason: 'vibes' })).caution_reason).toBe('other');
    expect(parseClaudeResponse(JSON.stringify({ mode: 'label', verdict: 'safe', caution_reason: 'oats' }))).not.toHaveProperty('caution_reason');
  });

  it('gives menus no caution_reason', () => {
    const r = parseClaudeResponse(JSON.stringify({ mode: 'menu', verdict: 'caution', caution_reason: 'oats', menu_items: [{ name: 'Pan', verdict: 'unsafe' }] }));
    expect(r).not.toHaveProperty('caution_reason');
  });
```

Inside `describe('applySafeVerdictFloor')`:

```js
  it('marks a floored label as incomplete', () => {
    expect(applySafeVerdictFloor(safeLabel(), 3).caution_reason).toBe('incomplete');
  });
```

Inside `describe('applyIngredientListGate')`:

```js
  it('marks a gated label as incomplete', () => {
    const analysis = safeLabel();
    applyIngredientListGate(analysis, START_CUT);
    expect(analysis.caution_reason).toBe('incomplete');
  });
```

In `web/tests/api/barcode.test.js`, next to the existing `parseClaudeResponse` tests (~line 62):

```js
  it('normalizes caution_reason on the barcode path too', () => {
    expect(parseClaudeResponse(JSON.stringify({ verdict: 'caution', caution_reason: 'may_contain' })).caution_reason).toBe('may_contain');
    expect(parseClaudeResponse(JSON.stringify({ verdict: 'caution' })).caution_reason).toBe('other');
    expect(parseClaudeResponse(JSON.stringify({ verdict: 'unsafe', caution_reason: 'oats' }))).not.toHaveProperty('caution_reason');
  });
```

Then find the no-ingredient-data handler test (`tracks the no-ingredient-data caution with confidence low and had_ingredient_data false`, ~line 1014) and add:

```js
    expect(res.body.caution_reason).toBe('incomplete');
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run --root web tests/api/utils.test.js tests/api/analyze.test.js tests/api/barcode.test.js`
Expected: FAIL. `normalizeCautionReason` is not exported, and `caution_reason` is undefined.

- [ ] **Step 3: Implement it**

`api/_utils.js`, directly after `normalizeVerdict`:

```js
/**
 * Decision 006: a caution must name one specific reason. The prompts ask for
 * `caution_reason`; this keeps whatever the model returns inside the enum —
 * unknown or missing on a caution becomes "other" (measured, T7), and a
 * reason on any other verdict is dropped.
 */
const CAUTION_REASONS = ['oats', 'may_contain', 'conflict', 'undeclared_source', 'incomplete', 'other'];

function normalizeCautionReason(verdict, reason) {
  if (verdict !== 'caution') return undefined;
  if (typeof reason !== 'string') return 'other';
  const r = reason.toLowerCase().trim();
  return CAUTION_REASONS.includes(r) ? r : 'other';
}
```

Add `CAUTION_REASONS` and `normalizeCautionReason` to the `export { … }` block.

`api/analyze.js`:
- Import `normalizeCautionReason` from `./_utils.js`.
- In `parseClaudeResponse`, after the `menu_items` block and before `return result;`:

```js
    // Decision 006: every label caution names one reason; menus carry none.
    const cautionReason = result.mode === 'label' ? normalizeCautionReason(result.verdict, result.caution_reason) : undefined;
    if (cautionReason) result.caution_reason = cautionReason;
    else delete result.caution_reason;
```

In both fallback objects in `parseClaudeResponse` (empty input and the `catch`), add `caution_reason: 'other',`.

In `applySafeVerdictFloor`, inside `if (analysis.verdict === 'safe') { … }`, add:

```js
    if (analysis.mode !== 'menu') analysis.caution_reason = 'incomplete';
```

In `applyIngredientListGate`, inside `if (analysis.verdict === 'safe') { … }`, add:

```js
    analysis.caution_reason = 'incomplete';
```

`api/barcode.js`:
- Import `normalizeCautionReason`.
- In `parseClaudeResponse`, after `result.confidence = …`:

```js
    const cautionReason = normalizeCautionReason(result.verdict, result.caution_reason);
    if (cautionReason) result.caution_reason = cautionReason;
    else delete result.caution_reason;
```

Add `caution_reason: 'other',` to both fallback objects. In the no-data branch's `res.status(200).json({ … })`, add `caution_reason: 'incomplete',`.

`web/tests/fixtures/claude-responses.json`: add `"caution_reason": "other"` to the `expected` object of `missing_optional_fields`, `invalid_verdict_value`, `no_json_found`, `malformed_json` and `empty_response`. The menu fixtures are unchanged.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test`
Expected: PASS, with the new tests included.

- [ ] **Step 5: Commit**

```bash
git add api/_utils.js api/analyze.js api/barcode.js web/tests/api/utils.test.js web/tests/api/analyze.test.js web/tests/api/barcode.test.js web/tests/fixtures/claude-responses.json
git commit -m "Add the caution_reason contract: normalized enum on both paths, code-side cautions marked incomplete"
```

---

### Task 3: Measure it — `caution_reason` on scan events, disclosed

**Files:**
- Modify: `api/_analytics.js` (`buildScanProperties`, its destructuring, and the `trackScan` JSDoc)
- Modify: `api/analyze.js` (the `trackScan` call); `api/barcode.js` (both `trackScan` calls, ~lines 209 and 246)
- Modify: `api/ANALYTICS.md`; `web/privacy-policy.html`; `web/sw.js`
- Test: `web/tests/api/analytics.test.js`; `web/tests/api/analyze.test.js`

**Interfaces:**
- Consumes: `analysis.caution_reason` (Task 2).
- Produces: the `caution_reason` event property (the enum), present only on caution scans.

- [ ] **Step 1: Write the failing tests**

`web/tests/api/analytics.test.js`:

```js
describe('buildScanProperties (caution_reason)', () => {
  it('records the reason a caution gave', () => {
    expect(buildScanProperties({ method: 'ocr', verdict: 'caution', cautionReason: 'oats' }).caution_reason).toBe('oats');
  });

  it('omits caution_reason when there is none', () => {
    expect(buildScanProperties({ method: 'ocr', verdict: 'safe' })).not.toHaveProperty('caution_reason');
  });
});
```

`web/tests/api/analyze.test.js`, inside `describe('ingredient-list gate')`, in the test `never returns "safe" when the start of the list is out of frame`: extend the `trackScan` expectation to `expect.objectContaining({ verdict: 'caution', confidence: 'low', listGate: 'no_heading', cautionReason: 'incomplete' })`.

- [ ] **Step 2: Run and confirm they fail**

Run: `npx vitest run --root web tests/api/analytics.test.js tests/api/analyze.test.js`
Expected: FAIL. The property is missing.

- [ ] **Step 3: Implement it**

`api/_analytics.js`:
- Add `cautionReason` to the `buildScanProperties({ … })` destructuring.
- After the `list_gate` line, add:

```js
  // Decision 006: which of the fixed reasons a caution named (an enum, never
  // content). Its distribution is the day-28 read of plans/verdict-calibration.
  if (cautionReason != null) props.caution_reason = cautionReason;
```

Add to the `trackScan` JSDoc:

```js
 * @param {'oats'|'may_contain'|'conflict'|'undeclared_source'|'incomplete'|'other'} [input.cautionReason] label cautions only
```

`api/analyze.js`: in the `trackScan({ … })` call, add `cautionReason: analysis.caution_reason,`.

`api/barcode.js`:
- In the no-data branch's `trackScan`, add `cautionReason: 'incomplete',`.
- In the analyzed branch's `trackScan`, add `cautionReason: analysis.caution_reason,`.

`api/ANALYTICS.md`, after the `list_gate` bullet:

```markdown
- `caution_reason` (both paths, label cautions only) — which specific reason a
  caution named (decision 006): `oats`, `may_contain`, `conflict`,
  `undeclared_source`, `incomplete` (unreadable, cut off, no list, no database
  data — code-side cautions set it), or `other` (a named concern outside the
  list; the model's unknown or missing values normalize here). An enum, never
  content. Its share of `other` is toggle T7's trigger.
```

`web/privacy-policy.html`: in the "Each event contains:" sentence, after `the analysis confidence,`, insert `for a caution, which kind of reason it gave (for example oats or a may-contain warning),`. Re-date the Effective Date to the day this PR merges.

`web/sw.js`: bump `CACHE_NAME` to the next version after `main`'s, and add a comment line naming the policy change.

- [ ] **Step 4: Run and confirm they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/_analytics.js api/analyze.js api/barcode.js api/ANALYTICS.md web/privacy-policy.html web/sw.js web/tests/api/analytics.test.js web/tests/api/analyze.test.js
git commit -m "Record caution_reason on scan events; disclose it"
```

---

### Task 4: The calibration eval set — the failing test for the prompt change

**Files:**
- Create: `web/tests/api/evals/calibration-cases.js`
- Create: `web/tests/api/evals/calibration.live.test.js`
- Test: `web/tests/api/evals/calibration-cases.test.js` (offline shape check)

**Interfaces:**
- Consumes:
  - `analyzeWithClaude(ocrText)` from `api/analyze.js`
  - `analyzeWithClaude(context)` and `buildIngredientContext(product)` from `api/barcode.js`
  - `guardLiveRun`, `sampleRuns` and `LIVE_EVAL_STATE_DIR` from `./guard.js`
  - `CAUTION_REASONS` from `api/_utils.js`
- Produces:
  - `CALIBRATION_CASES`: `{ id, expect, reason?, why, ocrText }[]`
  - `BARCODE_CALIBRATION_CASES`: `{ id, expect, reason?, why, product }[]`
  - `reason` is required when `expect === 'caution'`, optional on `not-safe`, and forbidden otherwise.

- [ ] **Step 1: Write the case file**

Every text is synthetic. Every OCR label carries a heading and a line-ending full stop, so the cut-off gate would pass it in production too.

```js
/**
 * Frozen eval set for decision 006 — caution means a specific reason to worry.
 * SYNTHETIC label text and database records written for this eval, never a
 * user's scan. `expect` semantics match gf-claim-cases.js; `reason` is the
 * caution_reason every caution sample must carry.
 */
export const CALIBRATION_CASES = [
  // Not a reason on its own → safe
  { id: 'C1', expect: 'safe', why: 'unnamed natural flavor only', ocrText: 'SEA SALT KETTLE CHIPS\nINGREDIENTS: Potatoes, sunflower oil, sea salt, natural flavor.\nNET WT 8 OZ (227g)' },
  { id: 'C2', expect: 'safe', why: 'maltodextrin + modified food starch + spices', ocrText: 'RANCH DIP MIX\nINGREDIENTS: Buttermilk powder, maltodextrin, salt, modified food starch, onion powder, garlic powder, spices, citric acid.\nCONTAINS: MILK.' },
  { id: 'C3', expect: 'safe', why: 'spices + dextrin + caramel color', ocrText: 'CHILI SEASONING\nINGREDIENTS: Chili pepper, spices, salt, onion, garlic, dextrin, caramel color, paprika.\nNET WT 1 OZ (28g)' },
  { id: 'C4', expect: 'safe', why: 'HVP of unstated source in a rice mix (not a meat product)', ocrText: 'SAVORY RICE MIX\nINGREDIENTS: Long grain rice, salt, hydrolyzed vegetable protein, onion powder, natural flavors, turmeric.\nNET WT 6 OZ (170g)' },
  { id: 'C5', expect: 'safe', why: 'Spanish aromas naturales + almidón modificado', ocrText: 'PATATAS FRITAS\nINGREDIENTES: Patatas, aceite de girasol, sal, aromas naturales, almidón modificado.\nPeso neto 150 g' },
  { id: 'C6', expect: 'safe', why: 'French arôme naturel + sirop de glucose', ocrText: 'BISCUITS AU RIZ\nINGRÉDIENTS : Riz, sucre, sirop de glucose, huile de tournesol, arôme naturel, sel.\nPoids net 120 g' },
  { id: 'C7', expect: 'safe', why: 'Dutch natuurlijk aroma + maltodextrine', ocrText: 'RIJSTWAFELS\nINGREDIËNTEN: rijst, zonnebloemolie, maltodextrine, zout, natuurlijk aroma.\nNetto 100 g' },
  { id: 'C21', expect: 'safe', why: 'maltodextrin is not malt', ocrText: 'SPORTS DRINK POWDER\nINGREDIENTS: Sugar, maltodextrin, citric acid, natural flavor, salt, potassium chloride.\nNET WT 21 OZ (595g)' },
  // A specific reason → caution with that reason
  { id: 'C10', expect: 'caution', reason: 'oats', why: 'plain oats, no claim', ocrText: 'OAT BITES\nINGREDIENTS: Whole grain oats, honey, sunflower oil, natural flavor, sea salt.\nNET WT 7 OZ (198g)' },
  { id: 'C11', expect: 'caution', reason: 'may_contain', why: '"may contain wheat" on an otherwise clean list', ocrText: 'RICE CRACKERS\nINGREDIENTS: Rice, sunflower oil, salt, natural flavor.\nMAY CONTAIN WHEAT.' },
  { id: 'C12', expect: 'caution', reason: 'may_contain', why: 'shared-facility statement', ocrText: 'ALMOND BUTTER BITES\nINGREDIENTS: Almonds, dates, cocoa, sea salt.\nMade in a facility that also processes wheat.' },
  { id: 'C13', expect: 'caution', reason: 'may_contain', why: 'Spanish "puede contener trazas de trigo"', ocrText: 'TORTITAS DE MAÍZ\nINGREDIENTES: Maíz, aceite de girasol, sal.\nPuede contener trazas de trigo.' },
  { id: 'C14', expect: 'caution', reason: 'undeclared_source', why: 'T3 — US sausage: spices + flavorings in a meat product', ocrText: 'SMOKED SAUSAGE\nINGREDIENTS: Pork, water, salt, corn syrup, spices, dextrose, natural flavorings, sodium nitrite.\nINSPECTED AND PASSED BY DEPARTMENT OF AGRICULTURE EST. 1234.' },
  { id: 'C15', expect: 'not-safe', reason: 'undeclared_source', why: 'T5 — soy sauce with no wheat declaration and no claim', ocrText: 'TERIYAKI SAUCE\nINGREDIENTS: Sugar, water, soy sauce, rice vinegar, garlic, ginger, natural flavor.\nNET WT 10 OZ (283g)' },
  { id: 'C16', expect: 'caution', reason: 'undeclared_source', why: 'T4 — yeast extract of unstated source', ocrText: 'VEGETABLE BROTH\nINGREDIENTS: Water, carrots, celery, onions, salt, yeast extract, natural flavor.\nNET WT 32 OZ (907g)' },
  { id: 'C17', expect: 'caution', reason: 'incomplete', why: 'front of pack only — no ingredient list', ocrText: 'CRUNCHY RICE SNACK\nOnly 110 calories per serving!\nNET WT 4 OZ (113g)' },
  { id: 'C18', expect: 'caution', reason: 'incomplete', why: 'garbled OCR', ocrText: 'INGRED ENTS: Ri e, su ar, na ur l fl vo , s lt,\nC NT IN : ...' },
  // Named gluten → unsafe (the rule must not soften these)
  { id: 'C19', expect: 'unsafe', why: 'a flavor that names barley', ocrText: 'BBQ CHIPS\nINGREDIENTS: Potatoes, sunflower oil, sugar, salt, natural flavor (barley), paprika.\nNET WT 8 OZ (227g)' },
  { id: 'C20', expect: 'unsafe', why: 'malt flavoring', ocrText: 'CORN FLAKES\nINGREDIENTS: Milled corn, sugar, malt flavoring, salt.\nNET WT 12 OZ (340g)' },
  { id: 'C22', expect: 'unsafe', why: 'barley malt syrup beside natural flavor', ocrText: 'HONEY RICE CRISPS\nINGREDIENTS: Rice, sugar, barley malt syrup, honey, natural flavor, salt.\nNET WT 10 OZ (283g)' },
];

export const BARCODE_CALIBRATION_CASES = [
  { id: 'BC1', expect: 'safe', why: 'natural flavors + maltodextrin, no tags', product: { product_name: 'Sour Cream & Onion Chips', ingredients_text: 'potatoes, sunflower oil, maltodextrin, salt, onion powder, natural flavors, citric acid.', allergens_tags: [], traces_tags: [], labels_tags: [], source: 'openfoodfacts' } },
  { id: 'BC2', expect: 'safe', why: 'French arôme + amidon modifié', product: { product_name: 'Galettes de riz', ingredients_text: 'riz, huile de tournesol, amidon modifié, sel, arôme.', allergens_tags: [], traces_tags: [], labels_tags: [], source: 'openfoodfacts' } },
  { id: 'BC7', expect: 'safe', why: 'spices + dextrin + caramel color', product: { product_name: 'Chili Seasoning Mix', ingredients_text: 'chili pepper, spices, salt, dextrin, caramel color, garlic.', allergens_tags: [], traces_tags: [], labels_tags: [], source: 'openfoodfacts' } },
  { id: 'BC3', expect: 'caution', reason: 'oats', why: 'plain oats, no label, no gluten tag', product: { product_name: 'Oat Clusters', ingredients_text: 'whole grain oats, honey, sunflower oil, salt.', allergens_tags: [], traces_tags: [], labels_tags: [], source: 'openfoodfacts' } },
  { id: 'BC4', expect: 'caution', reason: 'may_contain', why: 'gluten trace tag on a clean list', product: { product_name: 'Rice Cakes', ingredients_text: 'brown rice, salt, natural flavor.', allergens_tags: [], traces_tags: ['en:gluten'], labels_tags: [], source: 'openfoodfacts' } },
  { id: 'BC5', expect: 'caution', reason: 'undeclared_source', why: 'T3 — pork sausage, spices + flavorings', product: { product_name: 'Breakfast Pork Sausage', ingredients_text: 'pork, water, salt, spices, sugar, natural flavorings.', allergens_tags: [], traces_tags: [], labels_tags: [], source: 'openfoodfacts' } },
  { id: 'BC6', expect: 'unsafe', why: 'malt extract', product: { product_name: 'Chocolate Malt Drink', ingredients_text: 'sugar, cocoa, malt extract, milk powder, natural flavor.', allergens_tags: ['en:gluten', 'en:milk'], traces_tags: [], labels_tags: [], source: 'openfoodfacts' } },
  { id: 'BC8', expect: 'caution', reason: 'incomplete', why: 'placeholder ingredient text', product: { product_name: 'Snack Mix', ingredients_text: 'see package.', allergens_tags: [], traces_tags: [], labels_tags: [], source: 'openfoodfacts' } },
];
```

- [ ] **Step 2: Write the offline shape test**

`web/tests/api/evals/calibration-cases.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { CALIBRATION_CASES, BARCODE_CALIBRATION_CASES } from './calibration-cases.js';
import { CAUTION_REASONS } from '../../../../api/_utils.js';

describe('calibration eval cases (decision 006)', () => {
  const all = [...CALIBRATION_CASES, ...BARCODE_CALIBRATION_CASES];

  it('has unique ids', () => {
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
  });

  it.each(all.map((c) => [c.id, c]))('%s is well-formed', (_id, c) => {
    expect(['safe', 'caution', 'unsafe', 'not-safe']).toContain(c.expect);
    if (c.expect === 'caution') expect(CAUTION_REASONS).toContain(c.reason);
    if (c.expect === 'safe' || c.expect === 'unsafe') expect(c.reason).toBeUndefined();
    if (c.reason) expect(c.reason).not.toBe('other');
    expect(c.ocrText ?? c.product).toBeTruthy();
  });
});
```

Run: `npx vitest run --root web tests/api/evals/calibration-cases.test.js`
Expected: PASS. It's a shape check, so it passes as soon as the data is right.

- [ ] **Step 3: Write the live runner**

`web/tests/api/evals/calibration.live.test.js`:

```js
/**
 * LIVE eval for decision 006 (caution means a specific reason) — both paths,
 * real prompts, live Claude. Same rules as the other runners: RUN_LIVE_EVALS=1
 * gates it, the default is one sample per case, FULL=1 is the once-per-PR
 * merge gate a human approves, guard.js prints the cost and refuses a second
 * FULL run within the hour. A caution must carry the case's caution_reason on
 * every sample; an adversarial case may never come back safe.
 */
import { describe, it, beforeAll, afterAll } from 'vitest';
import { analyzeWithClaude as analyzeOcr } from '../../../../api/analyze.js';
import { analyzeWithClaude as analyzeBarcode, buildIngredientContext } from '../../../../api/barcode.js';
import { CALIBRATION_CASES, BARCODE_CALIBRATION_CASES } from './calibration-cases.js';
import { guardLiveRun, sampleRuns, LIVE_EVAL_STATE_DIR } from './guard.js';

const LIVE = process.env.RUN_LIVE_EVALS === '1';
const FALLBACK_EXPLANATION = /Unable to fully analyze/;

function passes({ expect, verdicts }) {
  if (expect === 'safe') return verdicts.every((v) => v === 'safe');
  if (expect === 'caution') return verdicts.every((v) => v === 'caution');
  if (expect === 'unsafe') return verdicts.every((v) => v === 'unsafe');
  return !verdicts.includes('safe');
}

function runner({ key, label, cases, analyze }) {
  const RUNS = LIVE ? guardLiveRun({ key, cases, stateDir: LIVE_EVAL_STATE_DIR }) : sampleRuns({ full: false });
  const results = [];

  describe.skipIf(!LIVE).concurrent(`${label} (real prompt, live Claude)`, () => {
    beforeAll(async () => {
      await analyze(cases[0]);
    }, 180_000);

    for (const c of cases) {
      if (!(c.expect in RUNS)) throw new Error(`${key} case ${c.id}: unknown expect "${c.expect}"`);

      it(`${c.id} expects ${c.expect}${c.reason ? ` (${c.reason})` : ''}: ${c.why}`, { timeout: 180_000 }, async ({ expect }) => {
        const runs = await Promise.all(Array.from({ length: RUNS[c.expect] }, () => analyze(c)));
        const verdicts = runs.map((r) => r.verdict);
        results.push({ id: c.id, expect: c.expect, verdicts, reasons: runs.map((r) => r.caution_reason ?? '-'), explanation: runs[0].explanation });

        for (const r of runs) expect(r.explanation).not.toMatch(FALLBACK_EXPLANATION);
        expect(passes({ expect: c.expect, verdicts }), `verdicts: ${verdicts.join(', ')}`).toBe(true);
        if (c.reason) {
          for (const r of runs) {
            if (r.verdict === 'caution') expect(r.caution_reason, `caution_reason: ${r.explanation}`).toBe(c.reason);
          }
        }
      });
    }

    afterAll(() => {
      results.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
      const rows = results.map((r) => {
        const expl = String(r.explanation || '').replace(/\|/g, '/').replace(/\s+/g, ' ').slice(0, 120);
        return `| ${r.id} | ${r.expect} | ${r.verdicts.join(', ')} | ${r.reasons.join(', ')} | ${passes(r) ? 'PASS' : 'FAIL'} | ${expl} |`;
      });
      console.log(['', `| ${label} | expect | verdicts | caution_reason | result | explanation (run 1) |`, '|---|---|---|---|---|---|', ...rows, ''].join('\n'));
    });
  });
}

runner({ key: 'calibration-ocr', label: 'calibration: photo path', cases: CALIBRATION_CASES, analyze: (c) => analyzeOcr(c.ocrText) });
runner({ key: 'calibration-barcode', label: 'calibration: barcode path', cases: BARCODE_CALIBRATION_CASES, analyze: (c) => analyzeBarcode(buildIngredientContext(c.product)) });
```

- [ ] **Step 4: Record the BEFORE run against the current prompts** (a human approves the command; about 28 Opus calls, well under $0.50)

```bash
RUN_LIVE_EVALS=1 node --env-file=.env node_modules/vitest/vitest.mjs run --root web tests/api/evals/calibration.live.test.js
```

Expected:
- FAIL on the safe cases (C1–C7, C21, BC1, BC2, BC7), which come back `caution` today.
- FAIL on every caution case's `caution_reason`, which the prompt doesn't ask for yet.
- The unsafe cases should already PASS.

Paste both tables into the PR description as the before state.

- [ ] **Step 5: Commit**

```bash
git add web/tests/api/evals/calibration-cases.js web/tests/api/evals/calibration-cases.test.js web/tests/api/evals/calibration.live.test.js
git commit -m "Add the decision-006 calibration eval (both paths); record the before run"
```

---

### Task 5: Rewrite the photo prompt (`api/analyze.js` `CLAUDE_PROMPT`)

**Files:**
- Modify: `api/analyze.js`: `CLAUDE_PROMPT`, in the Output Format, `#### Verdict Criteria`, `#### Gluten-free label claims`, `#### Guidelines` and `### Tone` sections
- Test: `web/tests/api/analyze.test.js`, `describe('CLAUDE_PROMPT gluten-free label claims')` plus a new `describe`

**Interfaces:**
- Consumes: T1's reason names (Task 1), and the evals (Task 4).
- Produces: a prompt whose label output carries `caution_reason`.

- [ ] **Step 1: Write the failing prompt-text tests**

In `web/tests/api/analyze.test.js`, add:

```js
describe('CLAUDE_PROMPT caution reasons (decision 006)', () => {
  it('asks for one caution_reason from the fixed list on a label caution', () => {
    expect(CLAUDE_PROMPT).toContain('"caution_reason": "oats" | "may_contain" | "conflict" | "undeclared_source" | "incomplete" | "other"');
  });

  it('says ingredients whose source labeling law covers are not a reason on their own', () => {
    const [, block = ''] = CLAUDE_PROMPT.split('#### Not a reason for caution on its own');
    for (const term of ['natural flavors', 'spices', 'maltodextrin', 'dextrin', 'modified (food) starch', 'glucose syrup', 'caramel color', 'hydrolyzed vegetable/plant protein of unstated source']) {
      expect(block.split('####')[0]).toContain(term);
    }
  });

  it('keeps meat products, soy sauce and yeast extract as undeclared_source (T3–T5)', () => {
    expect(CLAUDE_PROMPT).toMatch(/`undeclared_source`[^\n]*meat or poultry product/);
    expect(CLAUDE_PROMPT).toMatch(/`undeclared_source`[\s\S]*soy sauce[\s\S]*yeast extract/);
  });

  it('no longer tells the model to caution whenever it is uncertain', () => {
    expect(CLAUDE_PROMPT).not.toContain('Be conservative—when uncertain, use "caution"');
    expect(CLAUDE_PROMPT).not.toContain("The 'natural flavors' could contain gluten");
  });
});
```

Run: `npx vitest run --root web tests/api/analyze.test.js -t "decision 006"`
Expected: FAIL. None of that text exists yet.

- [ ] **Step 2: Edit the prompt**

(a) In **Output Format → For ingredient labels**, after the `"confidence"` line, add:

```
  "caution_reason": "oats" | "may_contain" | "conflict" | "undeclared_source" | "incomplete" | "other"
```

After the menu JSON block and its `Note:` line, add:

```
Include \`caution_reason\` only for an ingredient label whose verdict is "caution" — exactly one, from the list under "Verdict Criteria". Omit it for "safe", "unsafe", and every menu.
```

(b) Replace the whole `- **caution:**` sub-list **and** the `- **safe:**` line under `#### Verdict Criteria` with:

```
- **caution** — only for a specific, nameable reason to worry. Give exactly one \`caution_reason\`:
  - \`oats\` — oats without a gluten-free claim or certification (a whole-product claim or certification mark covers them; see "Gluten-free label claims")
  - \`may_contain\` — a "may contain" / traces / shared-equipment / shared-facility warning for wheat, barley, rye, oats, or gluten (in any language, e.g., "puede contener trazas de trigo")
  - \`conflict\` — a gluten-free claim and the ingredient list disagree, or the label itself says gluten is present (near-claims such as "very low gluten" / "gluten-reduced") while no gluten grain is listed
  - \`undeclared_source\` — an ingredient whose gluten source the maker is not required to declare: flavorings, spices, seasoning, or hydrolyzed protein in a meat or poultry product (sausage, hot dogs, deli meat, jerky, meatballs, marinated meat — in the US these are USDA-regulated and outside the wheat-labeling law); soy sauce, teriyaki, or tamari with no wheat declaration and no gluten-free claim; yeast extract of unstated source
  - \`incomplete\` — the text is garbled or cut off, or there is no visible ingredient list
  - \`other\` — a real, specific concern none of the above covers; name it in the explanation
- **safe:** no gluten source, and no caution reason above

#### Not a reason for caution on its own
Unnamed "natural flavors" / flavouring / aroma, "spices" / seasoning, maltodextrin, dextrin, modified (food) starch, glucose syrup, caramel color, and hydrolyzed vegetable/plant protein of unstated source (a named source such as "hydrolyzed soy protein" is not ambiguous either) — outside a meat or poultry product. Food-labeling law in the US, EU, UK, Canada, and Australia requires wheat to be named wherever it is used, including inside these ingredients, and EU/UK/Canadian/Australian law requires barley and rye too; wheat-based maltodextrin and glucose syrup are processed to remove gluten. If one of these is the only thing you might have worried about, the verdict is "safe". You may add one short sentence saying why it is not a concern — never frame it as a risk.
```

(c) In `#### Gluten-free label claims`, replace:

```
- With such a claim present, the ambiguous ingredients listed under "caution" (natural flavors, maltodextrin, modified food starch, dextrin, spices, hydrolyzed protein of unstated source) do NOT lower the verdict. Return "safe", and say in the explanation that the gluten-free label is what covers those ingredients.
```

with:

```
- With such a claim present, an \`undeclared_source\` ingredient (see "Verdict Criteria") does NOT lower the verdict. Return "safe", and say in the explanation that the gluten-free label is what covers it.
```

Then, in the ingredient-level-claim bullet, replace `It does NOT lift the verdict: every other ambiguous ingredient (natural flavors, maltodextrin, spices, …) still returns "caution" exactly as it would on a label with no claim at all.` with `It does NOT lift the verdict: every other caution reason (plain oats elsewhere, a may-contain warning, an \`undeclared_source\` ingredient) still applies exactly as it would on a label with no claim at all.`

Also:
- Append ` (caution_reason "conflict")` to the listed-gluten-source bullet.
- Append ` (caution_reason "may_contain")` to the may-contain bullet.
- Append ` (caution_reason "incomplete")` to the "no visible ingredient list" bullet.

(d) In `#### Guidelines`:
- Replace `- Be conservative—when uncertain, use "caution"` with `- Caution needs a named reason from "Verdict Criteria". When one applies, use caution — never "safe" on a guess. Never return caution only because an ingredient's source is unstated (see "Not a reason for caution on its own")`.
- Replace `- Common hidden gluten: soy sauce, malt vinegar, some seasonings` with `- Common hidden gluten: soy sauce, malt vinegar, malt flavoring, barley malt syrup`.
- Replace `- If OCR is garbled, return "caution" explaining image quality issue` with `- If OCR is garbled, return "caution" (caution_reason "incomplete") explaining the image quality issue`.

(e) In `### Tone → For caution products`, replace the example `"The 'natural flavors' could contain gluten. If you're very sensitive, consider a certified GF alternative."` with `"This says it may contain wheat, so cross-contact is a real risk. If you want to be sure, look for a certified gluten-free version."`. Under `For safe products`, add the example `"You're good to go. The natural flavor isn't a concern — wheat would have to be named on the label."`.

- [ ] **Step 3: Run the offline tests and fix any stale assertions**

Run: `npm test`
Expected: the new `decision 006` tests PASS.
- `narrows the HVP caution …` still passes. The new block keeps both `hydrolyzed vegetable/plant protein of unstated source` and `"hydrolyzed soy protein"`.
- `keeps plain oats at caution …` still passes, because of `oats without a gluten-free claim or certification`.
- Any other failure means the edit dropped a phrase a decision-003/004 test pins. Restore the phrase rather than deleting the test.

- [ ] **Step 4: Iterate the photo-path eval** (single sample; repeat until it passes)

```bash
RUN_LIVE_EVALS=1 node --env-file=.env node_modules/vitest/vitest.mjs run --root web tests/api/evals/calibration.live.test.js -t "photo path"
```

Expected: all 20 photo cases PASS, including every `caution_reason`. If a safe case stays caution, tighten the "Not a reason" wording, never the case. If an adversarial case goes safe, stop: that's the false-safe the gate exists for.

- [ ] **Step 5: Commit**

```bash
git add api/analyze.js web/tests/api/analyze.test.js
git commit -m "Photo prompt: caution needs a named reason; unstated sources covered by labeling law are not one"
```

---

### Task 6: Rewrite the barcode prompt (`api/barcode.js` `CLAUDE_PROMPT`)

**Files:**
- Modify: `api/barcode.js`: `CLAUDE_PROMPT` Output Format, `### Gluten-free label claims`, `### Verdict Criteria`, `### Guidelines`
- Test: `web/tests/api/barcode.test.js`

**Interfaces:**
- Consumes: T1, and Task 5's wording (mirror it).
- Produces: barcode-path analyses carrying `caution_reason`.

- [ ] **Step 1: Write the failing prompt-text tests**

In `web/tests/api/barcode.test.js`:

```js
describe('CLAUDE_PROMPT caution reasons (decision 006, barcode path)', () => {
  it('asks for one caution_reason from the fixed list', () => {
    expect(CLAUDE_PROMPT).toContain('"caution_reason": "oats" | "may_contain" | "conflict" | "undeclared_source" | "incomplete" | "other"');
  });

  it('carries the same not-a-reason list as the photo prompt', () => {
    const [, block = ''] = CLAUDE_PROMPT.split('### Not a reason for caution on its own');
    for (const term of ['natural flavors', 'spices', 'maltodextrin', 'dextrin', 'modified (food) starch', 'glucose syrup', 'caramel color']) {
      expect(block.split('###')[0]).toContain(term);
    }
  });

  it('files an uncorroborated gluten tag or self-contradicting record under conflict, missing data under incomplete', () => {
    expect(CLAUDE_PROMPT).toMatch(/`conflict`[^\n]*uncorroborated/);
    expect(CLAUDE_PROMPT).toMatch(/`incomplete`[^\n]*missing/);
  });

  it('no longer cautions whenever uncertain', () => {
    expect(CLAUDE_PROMPT).not.toContain('Be conservative—when uncertain, use "caution"');
  });
});
```

Run: `npx vitest run --root web tests/api/barcode.test.js -t "decision 006"`
Expected: FAIL.

- [ ] **Step 2: Edit the prompt**

(a) In Output Format, after the `"confidence"` line, add `  "caution_reason": "oats" | "may_contain" | "conflict" | "undeclared_source" | "incomplete" | "other"`. Below the JSON block, add `Include \`caution_reason\` only when the verdict is "caution" — exactly one, from "Verdict Criteria".`

(b) In `### Gluten-free label claims`:
- Replace `- With such a label present, the ambiguous ingredients listed under "caution" do NOT lower the\n  verdict.` with `- With such a label present, an \`undeclared_source\` ingredient (see "Verdict Criteria") does NOT lower the\n  verdict.`
- In the one-ingredient-claim bullet, replace `every other ambiguous\n  ingredient (natural flavors, maltodextrin, spices, …) still returns "caution" exactly as it would\n  for a record with no label at all.` with `every other caution\n  reason still applies exactly as it would for a record with no label at all.`

(c) Replace the `- **caution:**` sub-list and the `- **safe:**` line under `### Verdict Criteria` with:

```
- **caution** — only for a specific, nameable reason to worry. Give exactly one \`caution_reason\`:
  - \`oats\` — oats without a gluten-free label or certification (a whole-product label covers them; see above)
  - \`may_contain\` — cross-contamination traces for a gluten source, or a may-contain / shared-facility statement
  - \`conflict\` — a gluten allergen tag uncorroborated by the ingredients that no gluten-free label plus oats explains; a label and list that disagree; a record that contradicts itself; a "Package states:" line saying gluten is present with no gluten grain listed
  - \`undeclared_source\` — flavorings, spices, seasoning, or hydrolyzed protein in a meat or poultry product (sausage, hot dogs, deli meat, jerky, meatballs, marinated meat); soy sauce, teriyaki, or tamari with no wheat declaration and no gluten-free label; yeast extract of unstated source
  - \`incomplete\` — ingredient data is missing, sparse, or a placeholder
  - \`other\` — a real, specific concern none of the above covers; name it in the explanation
- **safe:** no gluten source in the ingredients, and no caution reason above

### Not a reason for caution on its own
Unnamed "natural flavors" / flavouring / aroma, "spices" / seasoning, maltodextrin, dextrin, modified (food) starch, glucose syrup, caramel color, and hydrolyzed vegetable/plant protein of unstated source — outside a meat or poultry product. Food-labeling law in the US, EU, UK, Canada, and Australia requires wheat to be named wherever it is used, including inside these ingredients, and EU/UK/Canadian/Australian law requires barley and rye too. If one of these is the only thing you might have worried about, the verdict is "safe". You may add one short sentence saying why it is not a concern — never frame it as a risk.
```

(d) In `### Guidelines`:
- Replace `- Be conservative—when uncertain, use "caution"` with the same sentence as Task 5 (d).
- Replace `- If ingredient data is missing or sparse, use "caution" with low confidence` with `- If ingredient data is missing or sparse, use "caution" (caution_reason "incomplete") with low confidence`.

- [ ] **Step 3: Run the offline tests**

Run: `npm test`
Expected: PASS. The existing barcode prompt test `/oats without a gluten-free label or certification/i` still matches (a).

- [ ] **Step 4: Iterate the barcode-path eval**

```bash
RUN_LIVE_EVALS=1 node --env-file=.env node_modules/vitest/vitest.mjs run --root web tests/api/evals/calibration.live.test.js -t "barcode path"
```

Expected: all 8 barcode cases PASS.

- [ ] **Step 5: Commit**

```bash
git add api/barcode.js web/tests/api/barcode.test.js
git commit -m "Barcode prompt: same caution rule and caution_reason as the photo path"
```

---

### Task 7: Re-derive the decision-003/004 eval cases under the new rule

**Files:**
- Modify: `web/tests/api/evals/gf-claim-cases.js` (cases 10, 11, 17, 18, 21, 25; plus `namesClaim` on 1–4 and 15)
- Modify: `web/tests/api/evals/barcode-gf-claim-cases.js` (cases B9, B10; plus `namesClaim` on B3)
- Modify: `web/tests/api/evals/calibration-cases.js` (receives the retired originals as safe cases)

**Interfaces:**
- Consumes: the prompts from Tasks 5 and 6.
- Produces: claim-rule cases that still test their rule.

**Why these cases:** their caution came only from natural flavors, maltodextrin or spices. Under decision 006 they would come back `safe`, and the rule each was written for would go untested. For example, case 17 checks that "Wheat-Free" isn't a gluten-free claim. Oats are now the only caution a claim can lift, so each rewrite swaps the ambiguous ingredient for **plain oats**. That keeps the test's point.

- [ ] **Step 1: Move the originals into the calibration set as safe cases**

Append to `CALIBRATION_CASES`, copying each original case's `ocrText` verbatim from `gf-claim-cases.js`:

```js
  { id: 'C23', expect: 'safe', why: 'was gf-claim #11 — no claim + natural flavors (decision 006: not a reason)', ocrText: /* verbatim from gf-claim case 11 */ },
  { id: 'C24', expect: 'safe', why: 'was gf-claim #17 — "Wheat-Free" + natural flavors', ocrText: /* verbatim from case 17 */ },
  { id: 'C25', expect: 'safe', why: 'was gf-claim #18 — "Gluten Friendly" + maltodextrin + natural flavors', ocrText: /* verbatim from case 18 */ },
```

Replace each `/* verbatim … */` with the string literal copied from that case before editing it in Step 2. Append the barcode twin `{ id: 'BC9', expect: 'safe', why: 'was B10 — no label + natural flavors, no oats', product: /* verbatim from B10 */ }` to `BARCODE_CALIBRATION_CASES`.

- [ ] **Step 2: Rewrite the claim-rule cases to keep their intent**

For each case, open it in `gf-claim-cases.js`:
- **#10, #17, #18, #21:** replace the ambiguous ingredient(s) that carried the caution (`natural flavors`, `maltodextrin`) in the `INGREDIENTS:` line with `rolled oats`. Keep `expect: 'caution'`, add `reason: 'oats'`, and update `why` to say the non-claim / near-claim doesn't cover oats.
- **#11:** replace it with a no-claim + `whole grain oats` label: `expect: 'caution'`, `reason: 'oats'`, `why: 'baseline — no claim + plain oats'`. Its old text moved to C23.
- **#25:** ingredient-level "gluten-free oats" + natural flavors. Change `natural flavors` to `may contain wheat` on its own line after the list. Keep `expect: 'caution'`, add `reason: 'may_contain'`, and update `why`: the ingredient-level claim clears the oats, not the advisory.
- **#1–#4 and #15:** the claim is no longer why these are safe, so drop `namesClaim: true`. `expect: 'safe'` stays.

In `barcode-gf-claim-cases.js`:
- **B9:** free-text "gluten-free-oats" tag. Change the list's `natural flavors` to `whole grain oats` alongside the tag. Keep `expect: 'caution'`, add `reason: 'oats'`.
- **B10:** replace it with a no-label + plain oats record, `reason: 'oats'`. Its old record moved to BC9.
- **B3:** drop `namesClaim: true`.

Both claim runners must assert `reason` the way the calibration runner does. In `gf-claim.live.test.js` and `barcode-gf-claim.live.test.js`, add this inside the per-case `it`, after the `passes(...)` assertion:

```js
      if (c.reason) {
        for (const r of runs) {
          if (r.verdict === 'caution') expect(r.caution_reason, `caution_reason: ${r.explanation}`).toBe(c.reason);
        }
      }
```

- [ ] **Step 3: Run all three runners, one sample each**

```bash
RUN_LIVE_EVALS=1 node --env-file=.env node_modules/vitest/vitest.mjs run --root web tests/api/evals
```

Expected: every case PASSES on all three runners. That's the gf-claim, barcode-gf-claim and calibration suites, both paths.

- [ ] **Step 4: Commit**

```bash
git add web/tests/api/evals/
git commit -m "Re-derive the claim-rule eval cases under decision 006 so each still tests its rule"
```

---

### Task 8: The merge gate, docs, PR

**Files:**
- Modify: `CLAUDE.md` (the live-eval bullet's call count and cost)
- Modify: `ROADMAP.md` (the Verdict calibration section)
- Modify: `README.md` (pipeline step 4)
- Modify: `docs/how-it-works.svg` and `docs/how-it-works-dark.svg`, lines ~131–135 (the prompt-rule list), then re-render `docs/how-it-works.png` and `docs/how-it-works-dark.png`
- Modify: `web/tests/api/evals/guard.js` header comment (the FULL cost)

- [ ] **Step 1: One FULL run — the merge gate** (a human approves the command; the cost line prints first)

```bash
FULL=1 RUN_LIVE_EVALS=1 node --env-file=.env node_modules/vitest/vitest.mjs run --root web tests/api/evals
```

Expected:
- **Zero false-safes:** no adversarial case returns `safe` on any sample, across all three runners.
- Every caution carries its case's `caution_reason`.

Paste the three tables into the PR. **If any adversarial sample goes safe:** stop, fix the prompt, iterate in single-sample mode, and ask before a second FULL run. The guard refuses one within the hour unless `FORCE=1`.

- [ ] **Step 2: Update the docs**

- **CLAUDE.md, live-eval bullet:** replace the call counts and dollar figures with those printed by Step 1's cost line. Name the third runner (`calibration.live.test.js`).
- **ROADMAP.md, `### Verdict calibration`:**
  - Tick `Relaxing the ambiguous-ingredient list itself when no claim is present`, pointing at decision 006 and this plan.
  - Add `- [ ] Day-28 read (Task 9)`.
- **README.md pipeline step 4:** replace the list after "clears ambiguous ingredients like natural flavors or maltodextrin" with `every "caution" names one specific reason (oats, a may-contain warning, a label conflict, an ingredient whose source the maker needn't declare, or an unreadable label); natural flavors, maltodextrin, spices and other ingredients labeling law already covers are not a reason on their own`.
- **Both diagram SVGs,** replacing:
  - `A “gluten-free” claim covers` / `ambiguous ingredients` → `Caution needs a named reason:` / `oats · may contain · conflict · …`
  - `Unsure? Caution, never safe` → `Natural flavors etc. aren’t one`

  Then re-render both PNGs at 2x. Use the same headless-Chrome recipe as PR #31: an `<img>` wrapper page, `--force-device-scale-factor=2 --window-size=1600,510 --screenshot`. Check a crop of each render before committing.

- [ ] **Step 3: Commit, push, open the PR, grill, stop**

```bash
git add CLAUDE.md ROADMAP.md README.md docs/ web/tests/api/evals/guard.js
git add -f plans/verdict-calibration-2026-09-23.md
git commit -m "Docs + diagram for decision 006; FULL eval tables in the PR"
git push -u origin verdict-calibration-2026-09-23
gh pr create --base main --title "Caution means a specific reason to worry (decision 006)" --body-file <PR body with the before/after eval tables>
```

Then run a fresh-reviewer grill, the way PR #31 did: an Opus 5.5 session in a Herdr tab, report-only, no live evals. Fold in its findings and re-grill after changes. **Stop for Aaron's "proceed"** before merging.

- [ ] **Step 4: After merge, verify the deploy by asking a question only the new code can answer**

```bash
curl -sS -X POST https://glutenornot.com/api/barcode -H 'Content-Type: application/json' -H 'x-client: web' -d '{"barcode":"<an OFF barcode for a product whose only ambiguous ingredient is natural flavor>"}' | jq '{verdict, caution_reason}'
```

Expected: `"verdict": "safe"`, and no `caution_reason`. The old deploy returns `caution`. Pick the barcode from a public OFF record during this step, and don't record it anywhere.

---

### Task 9: The day-28 read

**Files:** results go under a new "Day-28 read" section in this plan. Then add a CLOSED header, or open follow-ups.

- [ ] **Step 1: Caution share and reason mix since deploy**

```bash
SQL="SELECT properties.method, properties.verdict, properties.caution_reason, count() FROM events WHERE event='scan' AND timestamp >= '<deploy date>' AND coalesce(properties.\$geoip_city_name,'') != 'Cupertino' AND coalesce(properties.app_version,'') NOT LIKE '%-rc%' AND (properties.method='ocr' AND properties.mode='label' OR properties.method='barcode' AND properties.had_ingredient_data = true) GROUP BY 1,2,3 ORDER BY 1,2,4 DESC"
# same curl as Task 0 Step 2
```

- [ ] **Step 2: Judge against T8 and T7**

- **Caution share of readable label scans ≤ 40%?**
- **`other` ≤ 10% of cautions?** If not, look for a missing reason. Sample the reasons, never the content, by reading what users report.
- **`incomplete` share, and how much of it is `list_gate`:** this sizes Part B (the retake screen).
- **Split the barcode read by `data_source`** (T9 holds no-allergen-data sources at `incomplete`). **`other` with `confidence: low` may be parse failures** (the parsers' fallback records `other`).
- **Any false-safe report from a user:** that one outweighs the numbers.

- [ ] **Step 3: Write Part B's plan** (`plans/retake-state-<date>.md`)

Unreadable becomes a neutral retake screen, keyed on `caution_reason === 'incomplete'` on the photo path. It ships in the parked iOS 1.5.1.
