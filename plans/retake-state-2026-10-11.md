# Retake state: a photo we can't read fully is a retake, not a verdict

**Status:** SPEC, waiting for Aaron's review (2026-10-11). Nothing is built.

**Review history** (Pi on gpt-6-sol, Herdr tab "grill retake spec"):
- **Round 1: DON'T SHIP**, with 3 🔴 and 5 🟡. All eight are folded in and marked "(R1)".
- **Round 2: DON'T SHIP.** It confirmed six of the R1 fixes and left 3 🔴 and 4 🟡. All seven are folded in and marked "(R2)".
- **Round 3: DON'T SHIP.** It confirmed all seven R2 fixes and found 1 🔴 that the R2 lock change itself introduced, plus 1 🟡. Both are folded in and marked "(R3)".
- **Round 4: DON'T SHIP**, on 2 🟡: the inert screen needed a synchronous ref guard, and a failed push could leave it stuck. Both are folded in and marked "(R4)".
- **Round 5: DON'T SHIP**, on 2 🔴. A failed push could lose the result outright, because `addRecentScan` swallows its own failures. And R4 cleared the retake state before the picker opened, so cancelling the picker lost the way out. Both are folded in and marked "(R5)".
- **Round 6: DON'T SHIP**, on 1 🔴 and 1 🟡. A pending picker could bypass the committing guard, and the push-only retry needed the original scan count. Both are folded in and marked "(R6)".
- **Round 7: SHIP.** Both R6 fixes are confirmed, and no new regression was found. Pi: "ready to implement, subject to the specified tests and review of the resulting code."

**Ships in two halves, from one PR:**
- the API half on merge, through Vercel (older apps ignore the new field);
- the app half in **iOS 1.5.1**, together with the parked write-review link.

**Background:** this is Part B of `plans/verdict-calibration-2026-09-23.md`. It builds on decision 005 (the cut-off-list gate) and decision 006 (`caution_reason`). The barcode-recovery state (`plans/barcode-recovery-2026-09-05.md`) is the model for a screen that isn't a verdict.

---

## Decisions

- **D1. Approach B** (Aaron, 2026-10-11): the API says why a retake is needed, the app shows a retake screen, and the next scan carries a content-free retake flag.
- **D2. The server decides.** The app shows the retake screen only when the response carries a known `retake_reason`. It never decides from `caution_reason` or from the explanation text. Any other value gets the normal result card, the same rule as `result_reason: 'missing_context'`. The server can then change which cases ask for a retake without an app release.
- **D3. The retake screen is not a verdict.**
  - It doesn't add to the scan count, doesn't save to Recents, and never triggers the rating prompt. That's the barcode-recovery state's rule.
  - **Exception:** if the user taps "See what I could read", the result is shown and saved exactly as it is today.
- **D4. No safety rule changes, and no warning is hidden.**
  - The char floor, the list gate, the prompt and the verdicts all stay as they are, so **no live-eval run is needed**. A reviewer who finds a verdict change in the diff should flag it as a scope breach.
  - **(R1, R2)** A response that has anything else to show never gets `retake_reason`, and stays on today's amber card. That means any of: a non-empty `flagged_ingredients`, a non-empty `allergen_warnings`, or **any `menu_items` entry**. The last one matters because `result.tsx` renders a `mode: 'label'` response that carries menu items as a menu, and the gate already handles that shape. The retake screen shows only an explanation, so it may only replace a result that has nothing else to show.
- **D5. One PR** covers the API, the app and the docs. That follows the PR #27 pattern: the API half goes live on merge, and the app half waits for the release.

## Toggles (still flippable)

- **T1. Which `incomplete` cases get the retake screen.** Default: all three below. Alternative: the first two only, leaving Claude's own `incomplete` judgement on the amber card.
  - the list gate (`no_heading`, `no_end`);
  - the char floor (`too_little_text`);
  - Claude's own `incomplete` judgement (`unclear`: garbled text, a claim with no visible list).
- **T2. The way out.** Default: a "See what I could read" link on every retake screen. It's needed because the gate can block a complete label (see Evidence). Turning it off would trap those users in a loop.
- **T3. Web.** Default: unchanged. Web ignores `retake_reason` and keeps the amber card.
- **T4. When the retake flag expires.** Default: the flag rides on the next photo scan only. It's cleared by any of these:
  - a barcode lookup starting;
  - "See what I could read";
  - opening Recents;
  - 5 minutes passing.
- **T5. The heading-term diagnostic** (`list_heading_word`). Default: recorded only on `no_heading` scans. See the API section.
- **T6. Taps on the way-out link aren't measured.** Default: no beacon. A tap on it is the user choosing a result we already record. Add a beacon only if the day-14 read can't explain what happened.
- **T7. Retake-screen copy.**
  - **Title:** "Retake the photo".
  - **Body:** the server's explanation, which is already specific to the reason and carries the barcode hint on iOS.
  - **Icon:** `camera`, in ink on a muted surface (StateScreen's defaults), deliberately not amber.
- **T8 (R1). Results that carry a warning stay on the amber card.** Default: yes (D4). Alternative: render the flagged and warning rows on the retake screen. Revisit only if the day-14 read shows many `incomplete` responses held back by this rule (`caution_reason = 'incomplete'` without a `retake_reason`).
- **T9 (R1). No client-side "screen shown" beacon.** Default: none. The read counts retake *responses* delivered to iOS 1.5.1+ as a proxy for screens shown (see the day-14 read). Add a bounded beacon only if that proxy and the real screens turn out to differ in practice.

---

## Evidence: the list-gate read (2026-10-11, decision 005's revisit)

**Scope:** photo scans since 2026-09-23 from real clients (no `-rc` builds, no Cupertino).

**How often the gate fires:**
- It withheld `safe` on **15 of 80** label scans: 8 for `no_heading`, 7 for `no_end`. That's **15 of the 33** times Claude said `safe` (45%).
- **Language:** 13 had no detected language (English), and 2 were French (both `no_end`). No language stands out.

**Likely false blocks:** **5 of the 8 `no_heading` reads had 845–1,078 characters**, which decision 005 flags as "more likely a missed heading than a cut".
- Claude had called each of them `safe`, so it believed it saw a list.
- **One cause that fits the code:** the heading has to start its line or follow a sentence. Vision often merges the Nutrition Facts column onto the same line ("…Iron 10% INGREDIENTS: …"), and the pattern rejects that by design.
- This can't be confirmed from analytics, because text is never recorded. Hence T5.

**What users did next:**
- 2 retook the photo and got `safe` within 15 seconds (763 → 552 chars; French 1,275 → 1,356).
- 2 retried and got `incomplete` again.
- At least 2 stopped scanning.
- One user on 2026-09-29 made 6 photo attempts in 60 seconds. All 6 came back `incomplete` (12–316 chars, two of them from the gate), with 4 cancels in between.

**How big the problem is (since decision 006, 2026-09-24 14:35 UTC, iOS 1.5.0):**
- **32 of 70** photo label scans came back `caution`/`incomplete`, which is 73% of photo cautions. The gate caused 15, a read under 300 characters 13 more, and the rest were Claude's own judgement.
- Barcode-recovery photos end in caution 17 times out of 28.

---

## Goal and success criteria

**Goal:** a photo that can't be read fully says "retake" instead of showing a caution verdict. People who can fix the photo should get a real verdict on the next try, and people whose label the gate wrongly blocks should still have a way through.

**How we'll judge it**, read at day 14 after the 1.5.1 public release, or day 28 if fewer than 20 retake responses were delivered.

**(R2) Every number below is a server-event proxy, not a measure of what a user saw.**
- A timed-out or cancelled request can still produce a server `scan` *and* a client `scan_failed` (`api/ANALYTICS.md`, metric caveats).
- A response can land after the app has discarded it.
- At about 5 `incomplete` photo scans a week, no ratio here is statistically powered.

So there's no success threshold. There's one guardrail and one alarm:
- **Guardrail:** no false-safe report, and no verdict-rule change in the diff (D4).
- **Loop alarm:** act (see the day-14 read) if, among at least 10 retake `scan` events, those that come back with a `retake_reason` again outnumber those that don't. It's an alarm on a proxy, not a claim that the screen works.

**Reported, with no line:**
- **Retake outcomes:** retake `scan` events by verdict and `caution_reason`, and retake client failures by reason, kept as **separate** tables. They're never summed into one ratio, because the same attempt can appear in both.
- **Retake rate:** retake `scan` events ÷ retake responses delivered. The denominator also counts responses that landed after a cancel or blur.
- **The diagnostic:** the share of `no_heading` blocks with `list_heading_word = true`. If it's at least half, open a gate investigation with tester photos (decision 005's method). That would be its own PR with its own review, and is out of scope here.

---

## Design

### API (`api/analyze.js`, `api/_analytics.js`, `api/track.js`)

1. **`retakeReasonFor(analysis, { listGate, ocrChars })`** is a pure function, exported for tests. It returns one of `no_heading | no_end | too_little_text | unclear`, or `null`.
   - It returns `null` unless:
     - `analysis.mode === 'label'`;
     - `analysis.verdict === 'caution'`;
     - `analysis.caution_reason === 'incomplete'`;
     - **(R1)** `flagged_ingredients` and `allergen_warnings` are both empty (D4);
     - **(R2)** `menu_items` is missing or empty (D4).
   - Otherwise, in order:
     - `listGate`, if the gate fired;
     - `too_little_text`, if `ocrChars < MIN_OCR_CHARS_FOR_SAFE`;
     - `unclear` for anything else.
   - It runs after `applyIngredientListGate`. If T1 changes, `unclear` returns `null`.
2. **The response** sets `analysis.retake_reason` when that function returns a value. Nothing else in the response changes: verdict, explanation, confidence and `caution_reason` stay as they are today. The barcode path never sets it, because barcode `incomplete` means no data, which recovery already handles.
3. **The request** accepts an optional `retake_after` in the JSON body (`{ image, retake_after }`).
   - It's validated against the same four-value allowlist. Anything else is dropped silently and never recorded or echoed.
   - **(R1)** It's read and validated at the top of the handler, *before* the rate-limit branch, so a rate-limited retake is tagged too. Vercel has already parsed the body by then.
   - It doesn't change the analysis in any way. It's analytics only.
4. **Analytics** (`buildScanProperties`, `buildScanFailureProperties`):
   - **(R1) `retake_reason`** goes on `scan` whenever the response carries one. The day-14 read needs it, because after D4 it can no longer be worked out from `list_gate`, `ocr_chars` and `caution_reason`.
   - **`retake_after`** goes on `scan` and on every `scan_failed` that a retake attempt *observably* produces:
     - the server-side reasons from `api/analyze.js`: `rate_limited`, `ocr_failed`, `claude_error`, `server_error`;
     - **(R1)** the client-beaconed reasons through `api/track.js`: `timeout`, `network`, `cancelled`, `interrupted`. `track.js` accepts an optional `retake_after`, validated against the same allowlist and dropped if invalid. That mirrors how it handles `elapsed_ms`.
     - **(R2) Not observable:** a retake that `ensureConnected()` stops before sending, because the phone is offline. It sends no beacon today, by design (`mobile/services/api.ts`), and this spec keeps that. The attempt still uses up the flag, so the retry after "You're offline" isn't tagged. That's a known gap.
   - **`list_heading_word`** goes on `scan` only when `list_gate === 'no_heading'`.
     - It's a boolean: does any term in the `INGREDIENT_HEADINGS` alternation (about 35 languages, including OCR's l/1/| for I) appear anywhere in the OCR text, whatever its position or punctuation?
     - It reuses the existing alternation with the same `iu` flags. The check sits next to `checkIngredientList`, and the text never leaves the function.
5. **`api/ANALYTICS.md`:**
   - add all three properties to the contract;
   - add the response field and request field to the analyze contract;
   - add `retake_after` to the `/api/track` contract;
   - add the day-14 read below.
6. **Privacy policy** (`web/privacy-policy.html`): run the privacy-claims check: compare the policy, the App Store privacy label and the in-app copy against what the code actually records.
   - In "Anonymous Analytics", add to the technical-measurements list. The wording is corrected by R1 so it covers every language, not just the English word:
     - "…and, when that check found no ingredients heading, whether a recognized ingredients-heading word (in any of the languages we check) appeared anywhere in the text…";
     - **(R2)** "whether the analysis recommended retaking the photo and why, and whether a scan was a retake after such a recommendation". It says "the analysis recommended", not "the app asked you", because `retake_reason` is also recorded for web and 1.5.0 responses, and those never show the screen.
   - The same wording also covers the failure events.
   - Mirror both in the PostHog section's summary.
   - Re-date the policy.
   - **Bump the service worker cache name** (`web/sw.js`, `glutenornot-v13` → `v14`), or PWA users keep the old policy.
   - **App Store privacy label:** no change. Product Interaction is already declared.

### App (`mobile/`)

1. **Types** (`constants/verdicts.ts`): add `caution_reason?` (decision 006's enum; the type doesn't declare it today) and `retake_reason?: RetakeReason` to `AnalysisResult`. Export `RETAKE_REASONS` and an `isRetakeReason()` guard.
2. **The request and its failure beacon** (`services/api.ts`):
   - `analyzeImage` takes an optional `retakeAfter` and adds `retake_after` to the JSON body when it's set.
   - **(R1)** `sendFailureBeacon` takes an optional `retakeAfter`. `analyzeImage` passes it on its own `timeout` and `network` beacons.
3. **The retake state** (`app/index.tsx`):
   - a new state holding `{ result, reason, source }`, shown as a `StateScreen` by an early return, like the other system states.
   - **(R1) Camera invariants:** the retake state goes into the `cameraMounted` and `promptVisible` conditions, next to `systemState`. The camera then unmounts and remounts through the same ready gate, and the torch is re-applied by the existing settle sequence, not left set against a stale session.
   - **Where it branches:** in `processAndAnalyze`, after the ownership check and before `navigateToResult`. If `isRetakeReason(result.retake_reason)`:
     - **(R1)** if the screen isn't focused (`!focusedRef.current`), drop the response, exactly as `navigateToResult` does today. Nothing is stashed to surface later.
     - otherwise show the retake state. Nothing is committed: no count, no history, no push, so the `settledRef` window isn't needed.
   - **Primary button:** "Retake" for a camera photo, which returns to the camera with the torch left as the user set it. "Choose another photo" for a library pick, which runs `handlePickImage`.
   - **Secondary button:** "See what I could read". It commits the stashed result through `commitResult(result, flow)`, which is factored out of `navigateToResult` and doesn't depend on the in-flight controller (by then the controller has been cleared). `navigateToResult` keeps its controller and settled checks, then calls `commitResult`.
   - **(R1, R2) `commitResult` rules:**
     - **Focus first:** it checks focus before beginning, and does nothing if the screen isn't focused.
     - **One-shot write lock, bound to the result:** a ref holds the result object whose writes have begun. It's set synchronously before the first `await`.
       - **(R5)** A second call with the same object never repeats the writes. While `committing`, it returns at once. Once `written` and no longer committing (a push that failed), it goes straight to the push.
       - The lock is never released for that object. A later retake produces a new result object, so it never blocks one.
     - **(R3, R4) The screen stays up, inert, until the commit finishes, and the guard is synchronous.**
       - **A synchronous mirror:** the retake state is mirrored in `retakeRef` through one setter, exactly like `recoveryRef` and `setRecoveryFlow`. `{ result, reason, source, committing, written, scanCount }` is written to the ref and to state together. **(R6)** `scanCount` is the count the first write returned, or 0 if that write failed. A push-only retry passes it unchanged and never re-reads storage, so a failed count write can't later trigger a rating prompt.
       - **Entering the commit:** the same synchronous step that takes the lock sets `committing: true` in the ref, not only in React state. An already-rendered handler closure then sees it in the same tick.
       - **(R6)** That step also calls the existing `invalidatePhotoSelection()`. A picker opened by "Choose another photo" that is still pending then fails `handlePickImage`'s own post-await token check, and its photo is discarded. That's the same mechanism that already discards a pending pick on Cancel, exit or blur. A pick can't clear the stashed state or start a scan while the result commits.
       - **The guard on every entry point, read from the ref:**
         - `handleBarcodeScanned` returns whenever `retakeRef.current` is set, committing or not. A barcode callback queued before the camera unmounted can't start a lookup under a retake screen.
         - `handleCapture`, `handlePickImage` and `openRecents` return while `retakeRef.current?.committing`.
         - Both retake-screen buttons return while it's committing.
         - **"Retake"** (camera), when not committing, clears the retake state through the setter and reopens the camera. That's an explicit choice to leave the screen.
         - **(R5) "Choose another photo"**, when not committing, calls `handlePickImage` **with the retake state still set**. The guard blocks `handlePickImage` only while committing.
           - **If the user cancels the picker,** they're back on the same retake screen, and "See what I could read" is still there. This is the T2 way out for a falsely blocked label.
           - **If they pick a photo,** `processAndAnalyze` clears the retake state through the setter at its start, the same place it reads the pending retake flag.
       - The screen keeps the camera unmounted, so ordinary taps can't reach capture, the scanner, the picker or Recents. Nothing can start a scan, write a count, navigate, or exit a recovery flow while this result commits.
       - **(R4, R5) The writes happen once, and the navigation can be retried.** The commit has two parts, guarded separately:
         - **The writes** (count, history) run at most once per result. That's the lock bound to the result object. When they finish, whether or not the count write failed (R2's path), the retake state is marked `written: true` in the ref and state.
         - **The push** runs next. If it succeeds, the retake state is cleared through the setter, and the recovery flow's handoff happens as in `navigateToResult` today.
         - **(R5) If `router.push` throws,** the error goes to `reportError`. The retake state goes back to `committing: false`, keeping `written: true` and its stashed result. The screen is interactive again, never stuck.
           - "See what I could read" now re-pushes only, with no second count or history write. That matters because `addRecentScan` swallows its own storage failures, so Recents can't be relied on to hold the result.
           - "Retake" still leaves.
         - **In a recovery flow,** the flow stays open until a push succeeds, so `result_displayed` still fires on the retry that reaches the result screen.
     - **Settled once begun:** like today's settled rule, once the count write has begun, it completes count → history → push, even if a blur lands during the awaits.
     - **(R2) If the count write fails:** `incrementLifetimeScanCount()` can reject, because AsyncStorage `setItem` can. When it does, the failure goes to `reportError` and the result is still pushed, with a scan count of 0, so no rating prompt fires. `addRecentScan` already never throws.
     - `navigateToResult` gets the same error path, because it shares `commitResult`.
   - **Setting the flag:** `pendingRetakeRef = { reason, at }` is set when the screen is shown.
   - **Using the flag:** the next `processAndAnalyze` sends it as `retakeAfter` if it's under 5 minutes old, then clears it.
     - **(R1)** It also copies it into a per-scan ref, so a `cancelled` or `interrupted` beacon from `abandonScan` carries the same `retake_after`.
     - **(R2) That ref's lifecycle is tied to the scan that owns it:**
       - **every** new request writes the ref at its start: the retake value for a retake photo, `null` for any other photo and for every barcode lookup;
       - the owning request's `finally` clears it, under the same ownership check that clears `abortControllerRef`.
       
       An ordinary scan then can't inherit an earlier retake reason.
   - **Clearing the flag:** anything in T4 also clears it.
4. **Inside a barcode-recovery flow:**
   - A recovery photo that comes back with `retake_reason` shows the retake screen, and **the flow stays open** in the capture phase.
   - **"Retake"** returns to photo-only capture. The next photo fires `photo_started` again, which is how the read already counts retries.
   - **"See what I could read"** runs `commitResult(result, flow)`, so `result_displayed` fires as it does today.
   - Opening Recents goes through `exitRecovery()`.
   - No new recovery stage is added.
5. **Older apps (1.5.0)** ignore `retake_reason` and show the amber card, which is safe.

### Web

Unchanged (T3). It neither sends `retake_after` nor reads `retake_reason`.

### Docs (in the same PR)

- **Decision 009:** "A photo we can't read fully is a retake, not a verdict." Record D2–D4, T1–T9 and the evidence above.
- **The diagrams:** the engineering and simple SVGs (light and dark, plus the 2x PNGs) currently say the phone shows Safe, Caution or Unsafe. Add "or asks for a retake when the list can't be read (iOS)" to both the aria-label and the drawing, and re-render the 2x PNGs with headless Chrome.
- **`mobile/RELEASE.md` "Pending on main":** it says "Nothing", which has been stale since 2026-09-15. List 1.5.1's contents: the write-review link plus the retake screen.
- **`CLAUDE.md`:**
  - add a structure line for the retake state, and update the Part B status;
  - add `retake_after` to the `api/track.js` line.
- **`plans/verdict-calibration-2026-09-23.md`:** link Task 9 Step 3 to this plan.

---

## Testing

**API** (`web/tests/api/analyze.test.js`, `analytics.test.js`, `track.test.js`):
- **`retakeReasonFor`:**
  - precedence: gate over floor, the floor alone, Claude's `incomplete` alone;
  - `null` for safe, unsafe, a caution that isn't `incomplete`, and menus;
  - **(R1)** `null` for an `incomplete` caution with a non-empty `flagged_ingredients` or `allergen_warnings`;
  - **(R2)** `null` for a gated `mode: 'label'` response that carries `menu_items`, e.g. one with an unsafe item. That's the mixed shape `applyIngredientListGate` already handles.
- **The handler:**
  - returns `retake_reason` for gate, floor and Claude cases, and never on a menu or a barcode;
  - records `retake_reason` on `scan` exactly when the response carries it.
- **`retake_after`:**
  - each of the four values is recorded on `scan`, and on `scan_failed` for `ocr_failed`, `claude_error` and **(R1)** `rate_limited`;
  - **(R1)** `/api/track` records it on `timeout`, `network`, `cancelled` and `interrupted`;
  - junk, objects and a long string are dropped on both endpoints and never recorded.
- **`list_heading_word`:**
  - `true` for "…Iron 10% INGREDIENTS: sugar, …" and for a non-English term in that position (e.g. "… Zutaten: Zucker, …");
  - `false` for a read with no heading term;
  - absent on `no_end` and on ungated scans.
- **Pinned behavior:** the existing real-label fixture tests (`real-label-ocr.json`) still pass unchanged, which proves the gate is untouched (D4).

**App** (jest: `app/__tests__/index.test.tsx`, `services/__tests__/api.test.ts`):
- The retake screen shows for each known reason, with no count, no history and no push.
- An unknown `retake_reason` shows the normal result.
- **(R1)** An `incomplete` result without `retake_reason` (the server held it back for its warnings) shows the amber card with its rows.
- **(R1)** A retake response that lands after the screen loses focus (Recents opened mid-scan) is dropped. Nothing surfaces on return.
- **"Retake":**
  - camera photos return to the camera;
  - library picks open the picker;
  - the next photo request carries `retake_after`, once only;
  - the flag expires after 5 minutes and after a barcode lookup.
- **(R1)** The camera unmounts under the retake state and remounts through the ready gate. The torch is re-applied after a retake with the torch on. Prove this on a device too: it's a torch-timing path that unit tests can't fully cover.
- **"See what I could read":**
  - it commits once (count + history + push);
  - **(R1)** a double tap commits once;
  - **(R2)** a second tap queued after the push, and a tap after returning Back from the result, both find no button and no second commit;
  - **(R3, R4)** with the count write held pending, nothing re-enters. Call the handlers directly, not just assert that the camera is unmounted:
    - "Retake", a second "See what I could read", `handleBarcodeScanned`, `handleCapture`, `handlePickImage` and `openRecents` all return without effect;
    - they also do so when invoked through closures captured before the commit began (the same-tick case);
    - releasing the write then pushes exactly once and clears the state;
  - **(R4)** `handleBarcodeScanned` called while a retake screen is up but not committing starts no lookup;
  - **(R5)** a throwing `router.push`, with `addRecentScan` also failing silently, is reported. It leaves the retake screen interactive with `written: true`, the stashed result and the count spent once. A second "See what I could read" then pushes without a second count or history write. Test it both outside and inside a recovery flow; inside one, the flow stays open and `result_displayed` fires on the push that succeeds;
  - **(R5)** cancelling the picker from "Choose another photo" leaves the retake screen and its "See what I could read" link in place, both normally and inside a recovery flow. Picking a photo clears the retake state and sends `retake_after`;
  - **(R6)** a deferred picker result released while a commit's count write is pending is discarded. No `processAndAnalyze`, no cleared state, and the commit pushes once;
  - **(R6)** the push-only retry's route params carry the first write's `scanCount`, both for a successful count write (the same number) and after a failed one (0, so no rating prompt). Storage isn't read again;
  - a blur after the commit has begun still completes the push;
  - a tap while unfocused does nothing;
  - **(R2)** a rejected count write is reported and still pushes the result, with scan count 0 and no rating prompt.
- **(R1)** A retake scan that's cancelled, interrupted, times out or hits a network failure sends `retake_after` on its beacon.
- **(R2)** Retake → an ordinary photo scan → cancel: the cancel beacon carries **no** `retake_after`. The same goes for a barcode lookup after a retake screen.
- **(R2)** A retake that's stopped offline by the pre-flight check sends no beacon. The flag is used up, so the next attempt carries no `retake_after`.
- **Recovery flow:**
  - the flow survives a retake;
  - `result_displayed` doesn't fire on the retake screen;
  - it fires after "See what I could read".
- **`analyzeImage`:** sends `retake_after` only when it's given, in both the body and the failure beacon.

**Not needed:** live evals (D4). A review agent never runs them anyway.

`npm test` must pass, along with the mobile jest suite.

---

## Rollout

1. **PR** (branch `retake-state-2026-10-11`, in its own worktree), then a review by a different agent (Pi, or a report-only Opus session), then "proceed" and merge.
2. **The API half goes live on merge (R1).** Verify on `www.glutenornot.com` with a request only the new code can answer. The image has to read *over* 100 characters, or the char floor answers first and the gate never runs.
   - **The image:** render a short gluten-free list with no "Ingredients" heading, about 150–200 characters, ending in a full stop. For example: "Brown rice, water, sunflower oil, sea salt, cane sugar, apple cider vinegar, garlic powder, onion powder, black pepper, paprika, rosemary extract."
   - **(R2) Pick the image once, and judge the response against the rule, not a hoped-for outcome.** Work out `retakeReasonFor` by hand from the actual response, and check the deployed field matches it.
     - **The expected case:** Claude's underlying answer is `safe`, so the delivered response is a gated caution with empty `flagged_ingredients`, empty `allergen_warnings` and no `menu_items`. It should carry `retake_reason: "no_heading"`.
     - **If it isn't:** for example, Claude answered caution, or listed a warning. Record what came back, and check that `retake_reason` is absent or matches as the rule says. Don't rewrite the image's text to force `no_heading`; the unit tests already cover each branch.
     - **(R3) Only a positive response verifies the response field.** If `retake_reason` comes back as the rule predicts, the API's response path is verified here. If the response is the negative case, that proves nothing, because old code also omits the field.
       - Mark the response path **unverified** at this stage.
       - The TestFlight check (step 3), a top-cut label that shows the retake screen, then has to verify it positively before submission.
       - The `retake_after` checks below verify the request and analytics path either way.
   - **Then check its `scan` event** (query with `refresh: force_blocking`). In the expected case: `list_gate: no_heading`, `retake_reason: no_heading` and `list_heading_word: false`.
   - **A second request with `retake_after: "no_heading"`** should show `retake_after` on its event.
   - **One beacon:** a POST to `/api/track` with `retake_after` should carry it on its `scan_failed` event.
3. **Ship iOS 1.5.1** with the `glutenornot-release` skill. The smoke build is tagged `1.5.1-rc.smoke`. On TestFlight:
   - photograph a label with its top cut off, and check that the retake screen shows;
   - retake with the torch on, and check that the light comes back;
   - check that the retake's `scan` event carries `retake_after`.
4. **The day-14 read**, counted from the *public* release time (below).

## The day-14 read

**Filters for every query:**
- `properties.platform = 'ios'`;
- `app_version >= '1.5.1'` (a string comparison, which is fine until a 1.10);
- no `-rc` builds, no Cupertino;
- **(R1)** `timestamp >=` the 1.5.1 public release time, read from `currentVersionReleaseDate` in `https://itunes.apple.com/lookup?bundleId=com.glutenornot.scanner`. That's how 1.5.0's release date was confirmed.

**The queries:**
1. **Retake responses delivered** (the proxy for screens shown, T9): `scan` events with `retake_reason IS NOT NULL`, by `retake_reason`.
2. **(R2) Retake outcomes, as two separate tables.** Never sum them into one ratio: the same attempt can produce both a server `scan` and a client `scan_failed`.
   - **2a:** retake `scan` events (`retake_after IS NOT NULL`), by `retake_after` × verdict × `caution_reason` × whether `retake_reason` is set again.
   - **2b:** retake `scan_failed` events, by `retake_after` × reason.
   - **Retake rate** = 2a's total ÷ query 1. Report it; it has no target.
3. **Held back by D4** (T8): `scan` events with `caution_reason = 'incomplete'` and no `retake_reason`, method `ocr`, mode `label`.
4. **The diagnostic:** `list_heading_word` among `no_heading` scans from the API merge onward, all clients.

**What to do with the results:**
- **The loop alarm fires** (in 2a, with at least 10 events, those with `retake_reason` set again outnumber those without): the screen is likely looping people. Make "See what I could read" the primary button, or flip T1 to send `unclear` back to the amber card.
- **2b is mostly `cancelled`:** retakes are being abandoned mid-upload, which is the weak-signal problem, not this screen. Note it for the weak-signal plan.
- **`list_heading_word` true on half or more:** open the gate investigation.
- **Query 3 large next to query 1:** revisit T8.
- **Then close this plan.**

## Out of scope

- Changing the list gate or the heading pattern. Evidence comes first, through T5 and tester photos.
- Web.
- Multipart upload (weak-signal T2) and auto-retry.
- Feedback routing. It's a separate 1.5.1 candidate and would go in its own PR if it joins this release.
