# Retake state: a photo we can't read fully is a retake, not a verdict

**Status:** SPEC grilled to **SHIP** (round 7, 2026-10-11). **Implementation plan written 2026-10-16** — see "Implementation plan" at the end of this file. Nothing is built yet.

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

---

# Implementation plan

**Written 2026-10-16 against `main` at `1d31a08` (PR #42).** It turns the spec above into ordered tasks. Every task is: write the failing tests, watch them fail, implement, watch them pass, commit. The spec's rules are cited (D1–D5, T1–T9, R1–R6), not restated; when this plan and the spec disagree, the spec wins and the deviation goes under **Execution notes** at the end.

**One PR**, branch `retake-state-2026-10-11`, in its own worktree (D5). The API half goes live on merge; the app half ships as iOS 1.5.1 (Task 12).

## Global constraints

- **No live evals, ever, in this PR** (D4). `RUN_LIVE_EVALS` is never set. The verdict code is untouched: `CLAUDE_PROMPT`, `applySafeVerdictFloor`, `applyIngredientListGate`, `checkIngredientList`, `INGREDIENT_HEADING_PATTERN`, `MIN_OCR_CHARS_FOR_SAFE`, all of `api/barcode.js`, all of `web/js/`. Before the PR, `git diff main --stat` must show none of those files except `api/analyze.js`, and the diff of `api/analyze.js` must touch only imports, exports, the handler, and the two new functions.
- **Tests before every commit:** `npm test` (root, vitest over `web/tests/`) and `cd mobile && npm test` (jest). `cd mobile && npx tsc --noEmit` must be clean too (the runbook checks it).
- **Privacy invariant:** every new analytics property is an enum from one four-value allowlist or a boolean. Never OCR text, never the explanation. `scan` stays success-only; `/api/track` keeps its reason allowlist.
- **A web file change bumps `CACHE_NAME` in `web/sw.js`** to the next version after `main` (`glutenornot-v13` → `v14` today; re-check at branch time).
- **`plans/` is gitignored but tracked** (as the verdict-calibration plan notes), so add this file with `git add -f plans/retake-state-2026-10-11.md`. `.claude/decisions/` is tracked normally.
- **Commit messages name the spec:** `plans/retake-state-2026-10-11.md`, and decision 009 once Task 9 creates it.

## Review focus

For the second-agent review in Task 10. Each is a question with a yes/no answer in the diff or the tests.

1. **D4 holds.** The real-label fixture tests (`real-label-ocr.json`, in `checkIngredientList` and `applyIngredientListGate`) pass unchanged, and `retakeReasonFor` returns `null` whenever `flagged_ingredients`, `allergen_warnings` or `menu_items` has anything in it.
2. **No content leaves.** `retake_after` is validated on both endpoints and never echoed; `list_heading_word` is a boolean; the retake screen's body is the server explanation the amber card already shows.
3. **Every entry point reads `retakeRef`, not React state** (R3, R4): `handleBarcodeScanned`, `handleCapture`, `handlePickImage`, `openRecents`, both retake buttons. The test "closures captured before the commit began" is the proof.
4. **The write lock is bound to the result object and never released** (R5): `committedResultRef`. A second "See what I could read" pushes without a second count or history write, with the first write's `scanCount` (R6).
5. **A pending picker can't bypass the commit** (R6): `commitResult` calls `invalidatePhotoSelection()` in the same synchronous step that takes the lock.
6. **The recovery flow is handed off only after a successful push.** This reorders `navigateToResult` (today: clear the flow, then push). Check that nothing depended on the old order.
7. **The camera unmounts under the retake screen** and the torch comes back through the existing settle effect, not a pre-set prop.

## Task map

| Area | Files | Tasks |
|---|---|---|
| API analytics | `api/_analytics.js`, `web/tests/api/analytics.test.js` | 1 |
| API analyze | `api/analyze.js`, `web/tests/api/analyze.test.js`, one line in `barcode.test.js` | 2 |
| API track | `api/track.js`, `web/tests/api/track.test.js` | 3 |
| Contract + policy | `api/ANALYTICS.md`, `web/privacy-policy.html`, `web/sw.js` | 4 |
| App types + client | `mobile/constants/verdicts.ts`, `mobile/services/api.ts`, `mobile/services/__tests__/api.test.ts` | 5 |
| App screen | `mobile/app/index.tsx`, `mobile/app/__tests__/index.test.tsx` | 6, 7, 8 |
| Docs | `.claude/decisions/009-*.md`, `docs/*.svg` + `.png`, `mobile/RELEASE.md`, `CLAUDE.md`, `plans/verdict-calibration-2026-09-23.md`, `ROADMAP.md` | 9 |
| Ship | PR, review, merge, prod check, iOS 1.5.1, day-14 read | 10–13 |

---

### Task 0: Branch and baseline

**Files:** none changed.

- [ ] **Step 1: Branch from a current `main`, in a worktree**

```bash
cd /Users/aaronroy/repos/glutenornot.com
git checkout main && git pull
git log --oneline -1          # expect 1d31a08 or later
git worktree add ../glutenornot-retake -b retake-state-2026-10-11 main
cd ../glutenornot-retake
npm install && (cd mobile && npm install)
```

If `main` has moved past `1d31a08`, read the new commits before starting; anything touching `api/analyze.js`, `api/_analytics.js`, `api/track.js` or `mobile/app/index.tsx` changes this plan's anchors.

- [ ] **Step 2: Record the green baseline**

```bash
npm test 2>&1 | tail -5
cd mobile && npm test 2>&1 | tail -5 && npx tsc --noEmit && cd ..
grep -n "CACHE_NAME = " web/sw.js
```

Note the two test counts (the runbook's "173 tests" line gets updated in Task 9) and the current cache version.

- [ ] **Step 3: Bring this spec onto the branch** if it isn't there yet: `git show origin/retake-state-2026-10-11:plans/retake-state-2026-10-11.md > plans/retake-state-2026-10-11.md`, then `git add -f plans/retake-state-2026-10-11.md && git commit -m "Add the retake-state spec and implementation plan"`.

---

### Task 1: The allowlist and the analytics properties (`api/_analytics.js`)

One allowlist serves the response field, the request field and the beacon field, so it lives next to `normalizeClient` / `normalizeAppVersion`, which both endpoints already import.

**Files:** `api/_analytics.js`, `web/tests/api/analytics.test.js`.

- [ ] **Step 1: Write the failing tests**

In `analytics.test.js`, import `RETAKE_REASONS` and `normalizeRetakeAfter` from `_analytics.js` and add:

```js
describe('normalizeRetakeAfter (decision 009)', () => {
  it('accepts exactly the four retake reasons', () => {
    expect(RETAKE_REASONS).toEqual(['no_heading', 'no_end', 'too_little_text', 'unclear']);
    for (const r of RETAKE_REASONS) expect(normalizeRetakeAfter(r)).toBe(r);
  });
  it('drops anything else: junk, objects, a long string, casing', () => {
    for (const v of ['x', '', 'NO_HEADING', 'a'.repeat(300), {}, [], 1, null, undefined, { reason: 'no_end' }]) {
      expect(normalizeRetakeAfter(v)).toBeNull();
    }
  });
});

describe('buildScanProperties (retake — decision 009)', () => {
  it('records retake_reason, retake_after and list_heading_word when given', () => {
    const props = buildScanProperties({ method: 'ocr', verdict: 'caution', retakeReason: 'no_heading', retakeAfter: 'no_end', listHeadingWord: false });
    expect(props).toMatchObject({ retake_reason: 'no_heading', retake_after: 'no_end', list_heading_word: false });
  });
  it('omits all three when not provided or null', () => {
    const props = buildScanProperties({ method: 'ocr', verdict: 'safe', retakeReason: null, retakeAfter: undefined });
    expect(props).not.toHaveProperty('retake_reason');
    expect(props).not.toHaveProperty('retake_after');
    expect(props).not.toHaveProperty('list_heading_word');
  });
});

describe('buildScanFailureProperties (retake_after — decision 009)', () => {
  it('records retake_after when given and omits it otherwise', () => {
    expect(buildScanFailureProperties({ method: 'ocr', reason: 'cancelled', retakeAfter: 'unclear' })).toMatchObject({ retake_after: 'unclear' });
    expect(buildScanFailureProperties({ method: 'ocr', reason: 'cancelled' })).not.toHaveProperty('retake_after');
  });
});
```

- [ ] **Step 2: Run and confirm they fail**

`npx vitest run --root web tests/api/analytics.test.js` — FAIL: the exports don't exist.

- [ ] **Step 3: Implement**

`api/_analytics.js`, above `buildScanProperties`:

```js
// Decision 009 (plans/retake-state-2026-10-11.md): why a photo response asked
// for a retake, and the flag a retake photo carries back. One allowlist for
// the response field, the request field and the beacon field.
const RETAKE_REASONS = ['no_heading', 'no_end', 'too_little_text', 'unclear'];

/**
 * Validate a client-supplied `retake_after`. Untrusted input that lands in a
 * PostHog property: anything but one of the four reasons is dropped (null),
 * never bucketed, never echoed. Pure — no I/O.
 */
function normalizeRetakeAfter(raw) {
  return typeof raw === 'string' && RETAKE_REASONS.includes(raw) ? raw : null;
}
```

`buildScanProperties`: add `retakeReason, retakeAfter, listHeadingWord` to the destructured parameters, and after the `cautionReason` line:

```js
  // Decision 009, OCR path only. retake_reason: the response asked for a
  // retake, and why (retakeReasonFor in analyze.js). retake_after: this photo
  // followed a retake screen for that reason. Both from RETAKE_REASONS, never
  // content. retake_reason is also recorded for web and pre-1.5.1 clients,
  // which never show the screen — the day-14 read filters by platform and
  // app_version.
  if (retakeReason != null) props.retake_reason = retakeReason;
  if (retakeAfter != null) props.retake_after = retakeAfter;
  // Only when list_gate = no_heading (T5): did an ingredients-heading word in
  // any supported language appear anywhere in the text, whatever its position
  // or punctuation? A boolean from a server-side regex, never the text. Its
  // share over no_heading scans says whether the gate is missing headings.
  if (listHeadingWord != null) props.list_heading_word = listHeadingWord;
```

`buildScanFailureProperties`: add `retakeAfter` to the parameters and, after `ocrMs`:

```js
  // Decision 009: a failed attempt that followed a retake screen (server
  // reasons from analyze.js; client reasons through track.js). An enum.
  if (retakeAfter != null) props.retake_after = retakeAfter;
```

Add the three fields to the `trackScan` JSDoc and `retakeAfter` to `trackScanFailure`'s. Export `RETAKE_REASONS` and `normalizeRetakeAfter`.

- [ ] **Step 4: Run and confirm green**, then `npm test`.

- [ ] **Step 5: Commit** — `Add the retake allowlist and the three scan properties (decision 009)`.

---

### Task 2: `retakeReasonFor`, the response field, `retake_after` and `list_heading_word` on `/api/analyze`

**Files:** `api/analyze.js`, `web/tests/api/analyze.test.js`, `web/tests/api/barcode.test.js` (one assertion).

- [ ] **Step 1: Write the failing unit tests for `retakeReasonFor`**

Import `retakeReasonFor` and `hasHeadingWord` from `analyze.js`. New top-level describe:

```js
describe('retakeReasonFor (decision 009)', () => {
  const incomplete = (extra = {}) => ({
    mode: 'label', verdict: 'caution', caution_reason: 'incomplete',
    flagged_ingredients: [], allergen_warnings: [], explanation: '…', confidence: 'low', ...extra,
  });

  it('precedence: the gate over the floor, the floor alone, then Claude\'s own incomplete', () => {
    expect(retakeReasonFor(incomplete(), { listGate: 'no_heading', ocrChars: 40 })).toBe('no_heading');
    expect(retakeReasonFor(incomplete(), { listGate: 'no_end', ocrChars: 900 })).toBe('no_end');
    expect(retakeReasonFor(incomplete(), { listGate: null, ocrChars: 40 })).toBe('too_little_text');
    expect(retakeReasonFor(incomplete(), { listGate: null, ocrChars: 900 })).toBe('unclear');
  });

  it('is null for safe, unsafe, a caution that is not incomplete, and menus', () => {
    expect(retakeReasonFor(incomplete({ verdict: 'safe', caution_reason: undefined }), { ocrChars: 900 })).toBeNull();
    expect(retakeReasonFor(incomplete({ verdict: 'unsafe', caution_reason: undefined, flagged_ingredients: ['wheat'] }), { ocrChars: 900 })).toBeNull();
    expect(retakeReasonFor(incomplete({ caution_reason: 'oats' }), { ocrChars: 900 })).toBeNull();
    expect(retakeReasonFor(incomplete({ mode: 'menu', caution_reason: undefined, menu_items: [] }), { ocrChars: 900 })).toBeNull();
  });

  // R1: anything else on the card means the amber card, not the retake screen (D4).
  it('is null when the response has anything else to show', () => {
    expect(retakeReasonFor(incomplete({ flagged_ingredients: ['oats'] }), { listGate: 'no_heading', ocrChars: 40 })).toBeNull();
    expect(retakeReasonFor(incomplete({ allergen_warnings: ['May contain wheat'] }), { listGate: 'no_end', ocrChars: 900 })).toBeNull();
  });

  // R2: the mixed shape applyIngredientListGate already handles — a label
  // response carrying menu_items renders as a menu in the app.
  it('is null for a gated label response that carries menu_items', () => {
    const mixed = incomplete({ menu_items: [{ name: 'Pasta', verdict: 'unsafe', notes: '' }] });
    expect(retakeReasonFor(mixed, { listGate: 'no_heading', ocrChars: 900 })).toBeNull();
  });
});

describe('hasHeadingWord (list_heading_word diagnostic, T5)', () => {
  it('finds a heading word mid-line, where the gate pattern deliberately does not', () => {
    const merged = 'Calories 120 Iron 10% INGREDIENTS: brown rice, water, sea salt.';
    expect(checkIngredientList(merged)).toBe('no_heading');
    expect(hasHeadingWord(merged)).toBe(true);
  });
  it('finds a non-English term in that position', () => {
    expect(hasHeadingWord('Eisen 10% Zutaten: Zucker, Reismehl, Salz.')).toBe(true);
  });
  it('is false for a read with no heading term, and for non-strings', () => {
    expect(hasHeadingWord('brown rice, water, sea salt, cane sugar.')).toBe(false);
    expect(hasHeadingWord(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Write the failing handler tests**

Inside `describe('analyze handler analytics')`, add a `describe('retake (decision 009)')` that defines its own `ocr(description)` and `stubScan(analysis, ocrResponse)` (copies of the ones in the `ingredient-list gate` describe, or hoist those two helpers to the outer describe). Constants:

```js
    const claudeSafe = { mode: 'label', verdict: 'safe', flagged_ingredients: [], allergen_warnings: [], explanation: 'Good news! No gluten ingredients here.', confidence: 'high' };
    const claudeIncomplete = { mode: 'label', verdict: 'caution', caution_reason: 'incomplete', flagged_ingredients: [], allergen_warnings: [], explanation: 'The text is garbled.', confidence: 'low' };
    const claudeIncompleteWithOats = { ...claudeIncomplete, flagged_ingredients: ['oats'] };
    const claudeMenu = { mode: 'menu', verdict: 'caution', flagged_ingredients: [], allergen_warnings: [], explanation: 'Ask the server.', confidence: 'medium', menu_items: [{ name: 'Risotto', verdict: 'caution', notes: 'ask' }] };
    // >100 chars, no heading, ends in a full stop: the gate fires no_heading.
    const NO_HEADING_TEXT = 'Brown rice, water, sunflower oil, sea salt, cane sugar, apple cider vinegar, garlic powder, onion powder, black pepper, paprika, rosemary extract.';
    // Same list with the heading merged into the nutrition column.
    const MERGED_HEADING_TEXT = 'Calories 120 Iron 10% INGREDIENTS: ' + NO_HEADING_TEXT;
```

Cases (each posts `{ image: 'base64data' }` with `headers: { 'x-client': 'ios' }` unless stated):

1. **gate** — `stubScan(claudeSafe, ocr(NO_HEADING_TEXT))` → 200, `res.body.retake_reason === 'no_heading'`, verdict `caution`, `caution_reason` `incomplete`; `trackScan` called with `expect.objectContaining({ listGate: 'no_heading', retakeReason: 'no_heading', listHeadingWord: false })`.
2. **diagnostic true** — `stubScan(claudeSafe, ocr(MERGED_HEADING_TEXT))` → `retake_reason: 'no_heading'`, `listHeadingWord: true`.
3. **no_end** — `stubScan(claudeSafe, ocr('INGREDIENTS: ' + NO_HEADING_TEXT.slice(0, -1) + ', and'))` (heading, no line-ending full stop) → `'no_end'`; `trackScan.mock.calls[0][0].listHeadingWord` is `undefined` (absent on `no_end`).
4. **floor** — `stubScan(claudeSafe, ocr('GF!'))` → `'too_little_text'`.
5. **Claude's own** — `stubScan(claudeIncomplete, OCR_TEXT_FULL_LABEL)` → `'unclear'`.
6. **held back by D4** — `stubScan(claudeIncompleteWithOats, OCR_TEXT_FULL_LABEL)` → `res.body` has no `retake_reason`; `trackScan.mock.calls[0][0].retakeReason` is `null`; `listHeadingWord` `undefined` (the gate didn't fire).
7. **menu** — `stubScan(claudeMenu, OCR_TEXT_FULL_LABEL)` → no `retake_reason`.
8. **ungated safe** — `stubScan(claudeSafe, OCR_TEXT_FULL_LABEL)` → no `retake_reason`, `listHeadingWord` `undefined`.
9. **`retake_after` on `scan`** — for each of the four values, `body: { image: 'base64data', retake_after: value }` with case 8's stubs → `trackScan` called with `expect.objectContaining({ retakeAfter: value })`.
10. **`retake_after` on failures** — `retake_after: 'no_end'` with: the rate-limit setup from `tracks a rate_limited failure…` → `trackScanFailure` `objectContaining({ reason: 'rate_limited', retakeAfter: 'no_end' })`; `OCR_EMPTY` → `ocr_failed` + `retakeAfter`; `delete process.env.ANTHROPIC_API_KEY` with `OCR_TEXT` (the `tracks a claude_error failure…` recipe) → `claude_error` + `retakeAfter`.
11. **junk dropped** — `retake_after` of `'nope'`, `{ reason: 'no_end' }`, `'a'.repeat(300)` → `trackScan.mock.calls[0][0].retakeAfter` is `null` each time, and `res.body` has no `retake_after`.
12. **barcode never** — in `barcode.test.js`, in the no-ingredient-data caution handler test (`tracks the no-ingredient-data caution with confidence low and had_ingredient_data false`), add `expect(res.body).not.toHaveProperty('retake_reason');`. The barcode path never calls `retakeReasonFor`, so this pins that no one wires it in later.

- [ ] **Step 3: Run and confirm they fail**

`npx vitest run --root web tests/api/analyze.test.js tests/api/barcode.test.js`

- [ ] **Step 4: Implement**

`api/analyze.js`:

- Import `normalizeRetakeAfter` from `./_analytics.js`.
- After `applyIngredientListGate`, before `GF_CLAIM_PATTERN`:

```js
/**
 * Decision 009: should the app ask for a retake instead of showing this
 * caution? Only when the response has nothing else to show (D4): a label
 * caution whose one reason is `incomplete`, with no flagged ingredients, no
 * allergen warnings and no menu items (a label response carrying menu_items
 * renders as a menu in the app). In order: the gate's reason, a read under
 * the safe floor, else Claude's own `incomplete` judgement (T1). Pure; runs
 * after applyIngredientListGate. The barcode path never calls it — barcode
 * `incomplete` means no data, which recovery already handles.
 */
function retakeReasonFor(analysis, { listGate, ocrChars } = {}) {
  if (!analysis || analysis.mode !== 'label') return null;
  if (analysis.verdict !== 'caution' || analysis.caution_reason !== 'incomplete') return null;
  if (analysis.flagged_ingredients?.length || analysis.allergen_warnings?.length) return null;
  if (Array.isArray(analysis.menu_items) && analysis.menu_items.length) return null;
  if (listGate === 'no_heading' || listGate === 'no_end') return listGate;
  if (ocrChars < MIN_OCR_CHARS_FOR_SAFE) return 'too_little_text';
  return 'unclear';
}

// T5 diagnostic for `list_heading_word`: any heading term, anywhere, with any
// punctuation. The gate's pattern needs the heading to start its line (or
// follow a sentence), and Vision often merges the Nutrition Facts column onto
// the same line ("…Iron 10% INGREDIENTS: …"), so this says how often a
// no_heading block had a heading the gate couldn't accept. Same alternation
// and i/u flags as the gate; no `g`, so .test() is safe. Text never leaves
// this function.
const HEADING_WORD_ANYWHERE = new RegExp(`(?:${INGREDIENT_HEADINGS})`, 'iu');
function hasHeadingWord(ocrText) {
  return typeof ocrText === 'string' && HEADING_WORD_ANYWHERE.test(ocrText);
}
```

- In `handler`, after `const geo = getClientGeo(req);` and **before** `checkRateLimit` (R1):

```js
  // Decision 009: did this photo follow a retake screen? Validated against
  // the allowlist; anything else is dropped and never echoed. Read before the
  // rate-limit branch so a rate-limited retake is tagged too. Analytics only —
  // it never changes the analysis.
  const retakeAfter = normalizeRetakeAfter(req.body?.retake_after);
```

- Add `retakeAfter,` to **all five** `trackScanFailure({ … })` calls (rate_limited, both ocr_failed, claude_error, server_error). `buildScanFailureProperties` omits it when null.
- After `const listGate = applyIngredientListGate(…)`:

```js
    // Step 5 (decision 009): say when a caution is really "retake the photo".
    // Set only when there is nothing else on the card; the verdict,
    // explanation, confidence and caution_reason are exactly as above.
    const retakeReason = retakeReasonFor(analysis, { listGate, ocrChars });
    if (retakeReason) analysis.retake_reason = retakeReason;
```

- In the `trackScan({…})` call, after `cautionReason`:

```js
      // Decision 009 (enums and a boolean, never content).
      retakeReason,
      retakeAfter,
      listHeadingWord: listGate === 'no_heading' ? hasHeadingWord(ocrText) : undefined,
```

- Export `retakeReasonFor` and `hasHeadingWord`.

- [ ] **Step 5: Run and confirm green**, then `npm test`. The fixture tests must pass without edits (D4).

- [ ] **Step 6: Commit** — `Tell the app when a caution is a retake: retake_reason, retake_after, list_heading_word (decision 009)`.

---

### Task 3: `retake_after` on `/api/track`

**Files:** `api/track.js`, `web/tests/api/track.test.js`.

- [ ] **Step 1: Write the failing tests**

```js
  describe('retake_after (decision 009)', () => {
    it.each(['timeout', 'network', 'cancelled', 'interrupted'])('records retake_after on %s', async (reason) => {
      const res = mockRes();
      await handler({ method: 'POST', body: { method: 'ocr', reason, retake_after: 'no_heading' }, headers: {} }, res);
      expect(res.statusCode).toBe(204);
      expect(trackScanFailure).toHaveBeenCalledWith(expect.objectContaining({ reason, retakeAfter: 'no_heading' }));
    });

    it('drops junk, objects and long strings, and still records the beacon', async () => {
      for (const junk of ['nope', { reason: 'no_end' }, 'a'.repeat(300), 7]) {
        vi.clearAllMocks();
        const res = mockRes();
        await handler({ method: 'POST', body: { method: 'ocr', reason: 'cancelled', retake_after: junk }, headers: {} }, res);
        expect(res.statusCode).toBe(204);
        expect(trackScanFailure.mock.calls[0][0]).not.toHaveProperty('retakeAfter');
      }
    });

    it('omits retake_after when the beacon carries none', async () => {
      await handler({ method: 'POST', body: { method: 'ocr', reason: 'timeout' }, headers: {} }, mockRes());
      expect(trackScanFailure.mock.calls[0][0]).not.toHaveProperty('retakeAfter');
    });
  });
```

- [ ] **Step 2: Run and confirm they fail.** `npx vitest run --root web tests/api/track.test.js`

- [ ] **Step 3: Implement**

`api/track.js`: import `normalizeRetakeAfter`; destructure `retake_after` from the body; after `const elapsedMs = …`:

```js
  // Decision 009: which retake screen this attempt followed. Same allowlist
  // as the analyze endpoint; invalid values are dropped like a bad elapsed_ms.
  const retakeAfter = normalizeRetakeAfter(retake_after);
```

and in the `trackScanFailure` call: `...(retakeAfter ? { retakeAfter } : {}),`. Extend the file's header comment with one line on `retake_after`.

- [ ] **Step 4: Green, `npm test`, commit** — `Accept retake_after on the client failure beacon (decision 009)`.

---

### Task 4: The analytics contract, the privacy policy and the service worker

**Files:** `api/ANALYTICS.md`, `web/privacy-policy.html`, `web/sw.js`.

- [ ] **Step 1: `api/ANALYTICS.md`**

In the **`scan`** property list, after `list_gate`:

- `retake_reason` (OCR only, present only when set) — the response asked for a retake: `no_heading` | `no_end` | `too_little_text` | `unclear` (`retakeReasonFor`, `api/analyze.js`; decision 009). Set only on a label caution whose reason is `incomplete` with nothing else on the card. Recorded for every client; only iOS ≥ 1.5.1 shows the screen, so the day-14 read filters by `platform` and `app_version`.
- `retake_after` (OCR only, present only when sent) — the client said this photo followed a retake screen for that reason. Validated against the same four values, dropped otherwise. The flag rides on the next photo scan only and expires after 5 minutes on the client (spec T4).
- `list_heading_word` (OCR only, only when `list_gate = no_heading`) — boolean: a heading term in any supported language appeared somewhere in the text (spec T5). Half or more `true` → open a gate investigation with tester photos.

In the **`scan_failed`** list: `retake_after` on `rate_limited`, `ocr_failed`, `claude_error`, `server_error` (server) and on `timeout`, `network`, `cancelled`, `interrupted` (through `/api/track`, same validation). Add to the `/api/track` paragraph that the body accepts an optional `retake_after`. Note the known gap (R2): an attempt the offline pre-flight stops sends no beacon, and the flag is still spent.

Add a short **Request and response fields** note next to the `scan` event: `POST /api/analyze` accepts `retake_after` in the JSON body; the response carries `retake_reason` when the app should show the retake screen (the app branches only on a known value, like `result_reason`). Web ignores both (T3).

Add **"Retake: the day-14 read"** under the reads, copied from the spec's "The day-14 read" section (filters, the four queries, the actions), with the HogQL for query 1 and 2a written out in the Task 0-style `curl` form:

```sql
-- 1. retake responses delivered (proxy for screens shown)
SELECT properties.retake_reason AS r, count() FROM events WHERE event='scan' AND properties.platform='ios' AND properties.app_version >= '1.5.1' AND coalesce(properties.app_version,'') NOT LIKE '%-rc%' AND coalesce(properties.$geoip_city_name,'') != 'Cupertino' AND timestamp >= '<1.5.1 public release time>' AND properties.retake_reason IS NOT NULL GROUP BY 1
-- 2a. retake scans (never summed with 2b)
SELECT properties.retake_after, properties.verdict, properties.caution_reason, properties.retake_reason IS NOT NULL AS again, count() FROM events WHERE event='scan' AND <same filters> AND properties.retake_after IS NOT NULL GROUP BY 1,2,3,4
-- 2b. retake failures
SELECT properties.retake_after, properties.reason, count() FROM events WHERE event='scan_failed' AND <same filters> AND properties.retake_after IS NOT NULL GROUP BY 1,2
-- 3. held back by D4 (T8)
SELECT count() FROM events WHERE event='scan' AND <same filters> AND properties.method='ocr' AND properties.mode='label' AND properties.caution_reason='incomplete' AND properties.retake_reason IS NULL
-- 4. the diagnostic, all clients, from the API merge onward
SELECT properties.list_heading_word, count() FROM events WHERE event='scan' AND properties.list_gate='no_heading' AND timestamp >= '<merge time>' GROUP BY 1
```

Under **Metric caveats**: the same attempt can produce a server `scan` and a client `scan_failed`, so 2a and 2b are never one ratio (R2).

- [ ] **Step 2: Privacy policy — the claims check first**

Compare three things against what Tasks 1–3 record: the policy's "Anonymous Analytics" paragraph, the PostHog paragraph, and the App Store privacy label (Product Interaction is already declared; no change). The new facts to cover: a per-language heading-word boolean, a retake recommendation and its reason, and a retake flag on scans and failures. Nothing new is stored on-device, so "Information Stored Locally" is unchanged.

- [ ] **Step 3: Privacy policy — the edits**

In the "Anonymous Analytics" paragraph's technical-measurements list, after "…because the ingredient list looked cut off", insert the spec's wording (R1, R2):

> …and, when that check found no ingredients heading, whether a recognized ingredients-heading word (in any of the languages we check) appeared anywhere in the text, whether the analysis recommended retaking the photo and why, and whether a scan was a retake after such a recommendation…

Mirror it in the PostHog paragraph's per-scan summary ("…technical quality measurements, whether a retake was recommended and whether a scan was one, approximate region…"). Change the effective date to the merge date (`Effective Date: <Month D, 2026>`).

- [ ] **Step 4: `web/sw.js`** — `glutenornot-v13` → `glutenornot-v14` (or the next after `main`).

- [ ] **Step 5: `npm test` (health and sw tests pin nothing here, but run it), commit** — `Document retake_reason, retake_after and list_heading_word; privacy policy and SW bump`.

---

### Task 5: App types and the API client

**Files:** `mobile/constants/verdicts.ts`, `mobile/services/api.ts`, `mobile/services/__tests__/api.test.ts`.

- [ ] **Step 1: Write the failing tests** (`api.test.ts`)

In `describe('analyzeImage request')`:

```ts
  it('sends retake_after in the body only when given (decision 009)', async () => {
    await analyzeImage('base64data', undefined, undefined, 'no_heading');
    expect(JSON.parse(lastXhr().body!)).toEqual({ image: 'base64data', retake_after: 'no_heading' });
    await analyzeImage('base64data');
    expect(JSON.parse(lastXhr().body!)).toEqual({ image: 'base64data' });
  });
```

In `describe('failure beacon …')`: copy the `ocr/timeout` and `ocr/network` cases, pass `'no_end'` as the fourth argument, and assert the beacon body includes `retake_after: 'no_end'`. In `describe('sendFailureBeacon …')`:

```ts
  it('carries retake_after when given and omits it otherwise', () => {
    const fetchMock = mockFetch();
    sendFailureBeacon('ocr', 'cancelled', 1200, 'too_little_text');
    expect(beaconBody(fetchMock)).toEqual({ method: 'ocr', reason: 'cancelled', elapsed_ms: 1200, retake_after: 'too_little_text' });
    sendFailureBeacon('ocr', 'interrupted');
    expect(beaconBody(fetchMock)).toEqual({ method: 'ocr', reason: 'interrupted' });
  });
```

Also a type-level test: `isRetakeReason('no_heading') === true`, `isRetakeReason('nope') === false`, `isRetakeReason(undefined) === false` (put it in a small `describe('isRetakeReason')` in `api.test.ts`, or a new `constants/__tests__/verdicts.test.ts`).

- [ ] **Step 2: Run and confirm they fail.** `cd mobile && npx jest services/__tests__/api.test.ts`

- [ ] **Step 3: Implement**

`mobile/constants/verdicts.ts`:

```ts
// Decision 006's reasons. The server always sets one on a label caution; the
// app shows the card the same way whatever it is.
export type CautionReason = 'oats' | 'may_contain' | 'conflict' | 'undeclared_source' | 'incomplete' | 'other';

// Decision 009 (plans/retake-state-2026-10-11.md): the server says a photo
// couldn't be read fully and why. The app shows the retake screen only on a
// known value (isRetakeReason) and never decides from caution_reason or the
// explanation — the server can change which cases ask for a retake without
// an app release. The same enum rides back on the next photo as retake_after.
export const RETAKE_REASONS = ['no_heading', 'no_end', 'too_little_text', 'unclear'] as const;
export type RetakeReason = (typeof RETAKE_REASONS)[number];
export function isRetakeReason(value: unknown): value is RetakeReason {
  return typeof value === 'string' && (RETAKE_REASONS as readonly string[]).includes(value);
}
```

and in `AnalysisResult`, after `result_reason`: `caution_reason?: CautionReason;` and `retake_reason?: RetakeReason;` (with a one-line comment each; note that a parsed response may carry any string, which is why the guard, not the type, decides).

`mobile/services/api.ts`:

- `sendFailureBeacon(method, reason, elapsedMs?, retakeAfter?: RetakeReason)`: body gains `...(retakeAfter ? { retake_after: retakeAfter } : {})`. Extend the comment: a retake attempt says which screen it followed (decision 009).
- `analyzeImage(base64Image, externalSignal?, onProgress?, retakeAfter?: RetakeReason)`: the body becomes `JSON.stringify({ image: base64Image, ...(retakeAfter ? { retake_after: retakeAfter } : {}) })`; its two `sendFailureBeacon('ocr', …)` calls pass `retakeAfter` as the fourth argument (R1).
- `lookupBarcode` is unchanged (a barcode lookup is never a retake).

- [ ] **Step 4: Green; `npm test` in `mobile`; `npx tsc --noEmit`; commit** — `App: retake_reason type guard, retake_after on the analyze request and its beacons`.

---

### Task 6: The retake screen — show it, leave it, carry the flag

The first half of `index.tsx`. After this task the screen shows, "Retake" / "Choose another photo" work, the flag rides on the next photo, and the camera invariants hold. "See what I could read" is wired to a stub that does nothing until Task 7 (its tests come there).

**Files:** `mobile/app/index.tsx`, `mobile/app/__tests__/index.test.tsx`.

- [ ] **Step 1: Write the failing tests**

New top-level `describe('retake state (plans/retake-state-2026-10-11.md)')` with fixtures:

```ts
  const RETAKE = (reason: string, extra: Partial<AnalysisResult> = {}) => ({
    mode: 'label', verdict: 'caution', caution_reason: 'incomplete', retake_reason: reason,
    flagged_ingredients: [], allergen_warnings: [],
    explanation: `SENTINEL explanation for ${reason}`, confidence: 'low', ...extra,
  }) as AnalysisResult;
  const HELD_BACK = { ...RETAKE('no_heading'), retake_reason: undefined, flagged_ingredients: ['oats'] } as AnalysisResult;

  async function capture(utils: any) {
    await act(async () => { fireEvent.press(utils.getByLabelText('Capture photo of ingredients')); });
  }
  async function pick(utils: any, uri = 'file://picked.jpg') {
    mockLaunchLibrary.mockResolvedValueOnce({ canceled: false, assets: [{ uri }] } as any);
    await act(async () => { fireEvent.press(utils.getByLabelText('Upload photo from library')); });
  }
```

Cases:

1. **Each known reason shows the screen, nothing committed:** for each of the four reasons, `mockAnalyzeImage.mockResolvedValueOnce(RETAKE(r))`, capture → `getByText('Retake the photo')`, `getByText('SENTINEL explanation for ' + r)`, `getByLabelText('Retake')`, `getByLabelText('See what I could read')`; `mockPush`, `incrementLifetimeScanCount`, `addRecentScan` not called; `queryByTestId('camera-view')` is null.
2. **Unknown `retake_reason` → the normal result:** `RETAKE('later_reason')` → `mockPush` called once, no retake screen.
3. **Held back (R1):** `HELD_BACK` → push once; `JSON.parse(mockPush.mock.calls[0][0].params.result).flagged_ingredients` is `['oats']`.
4. **Unfocused response dropped (R1):** hold `analyzeImage` pending, capture, `focusControl.blur()`, resolve with `RETAKE('no_end')`, `focusControl.focus()` → no retake screen, no push, camera back.
5. **"Retake" after a camera photo returns to the camera:** press `Retake` → `getByTestId('camera-view')`; the spinner isn't shown; `sendFailureBeacon` not called.
6. **"Choose another photo" after a library pick opens the picker:** `pick(utils)` with `RETAKE('unclear')` → primary is labelled `Choose another photo`; press it with `mockLaunchLibrary.mockResolvedValueOnce({ canceled: true })` → `mockLaunchLibrary` called twice, and the retake screen is **still up** with `See what I could read` present (R5).
7. **The flag rides once:** retake (camera) → press `Retake` → capture with `mockAnalyzeImage.mockResolvedValueOnce(LABEL_RESULT)` → `mockAnalyzeImage.mock.calls[1][3]` is `'no_heading'`; a third capture → `mock.calls[2][3]` is `undefined`.
8. **Picking a photo from the screen sends the flag and clears the state (R5):** retake from a pick → `Choose another photo` with a real pick → `mockAnalyzeImage` called with `'unclear'` as the fourth argument; the retake screen is gone during and after.
9. **The flag expires after 5 minutes:** retake → `Retake` → `jest.advanceTimersByTime(5 * 60 * 1000 + 1)` → capture → fourth argument `undefined`.
10. **A barcode lookup clears the flag:** retake → `Retake` → `scan(getByTestId)` with `mockLookupBarcode.mockResolvedValueOnce(LABEL_RESULT)` → then capture → fourth argument `undefined`. (`LABEL_RESULT`, `BARCODE` and `scan()` live in the recovery describe; lift them to module scope or redefine them.)
11. **Camera invariants (R1):** `cameraReadyControl.auto = false`; retake → `Retake` → the camera remounts with `enableTorch` false and the shutter disabled (`styles.captureButtonDisabled` present, as the torch tests check it); `cameraReadyControl.fire()` + `advanceTimersByTime(750)` with the torch on before the scan → `enableTorch` true. Copy the structure of `CameraScreen torch toggle`'s remount test.
12. **A queued barcode callback under the retake screen starts no lookup (R4):** capture the handler before the scan (`const stale = getByTestId('camera-view').props.onBarcodeScanned`, the pattern at the `staleHandler` test), show the retake screen, call `stale({ data: BARCODE, type: 'ean13' })` → `mockLookupBarcode` not called.

- [ ] **Step 2: Run and confirm they fail.** `cd mobile && npx jest app/__tests__/index.test.tsx -t "retake state"`

- [ ] **Step 3: Implement**

`mobile/app/index.tsx`:

**Imports:** add `isRetakeReason, RetakeReason` from `../constants/verdicts`.

**Constants**, after `TORCH_SETTLE_MS`:

```ts
// Retake flag lifetime (decision 009, T4): the flag rides on the next photo
// scan only, and not after five minutes.
const RETAKE_FLAG_TTL_MS = 5 * 60 * 1000;
// Retake-screen copy (T7). The body is the server's explanation, which is
// specific to the reason and already carries the barcode hint on iOS.
const RETAKE_COPY = {
  title: 'Retake the photo',
  retake: 'Retake',
  chooseAnother: 'Choose another photo',
  seeResult: 'See what I could read',
};
```

**Type**, after `RecoveryFlow`:

```ts
// Retake state (plans/retake-state-2026-10-11.md, decision 009). The server
// said this photo can't be read fully (`retake_reason`), so the screen offers
// a retake instead of a verdict. Nothing is counted or saved unless the user
// asks to see the result (commitResult). Mirrored in a ref like `recovery`:
// every entry point guards on the ref, synchronously. `committing`, `written`
// and `scanCount` track the one-shot commit (R3–R6): the writes run once per
// result; a failed push can be retried without a second write.
interface RetakeState {
  result: AnalysisResult;
  reason: RetakeReason;
  source: 'camera' | 'picker';
  committing: boolean;
  written: boolean;
  scanCount: number;
}
```

**State and refs**, after the `recovery` block:

```ts
  const [retake, setRetake] = useState<RetakeState | null>(null);
  const retakeRef = useRef<RetakeState | null>(null);
  const setRetakeState = useCallback((state: RetakeState | null) => {
    retakeRef.current = state;
    setRetake(state);
  }, []);
  // The flag the next photo carries as `retake_after`: set when the screen is
  // shown, used once, within RETAKE_FLAG_TTL_MS. Cleared by a barcode lookup,
  // "See what I could read" and opening Recents (T4).
  const pendingRetakeRef = useRef<{ reason: RetakeReason; at: number } | null>(null);
  // What the in-flight request carried, so abandonScan's beacon says the same
  // thing. Written at the start of every request (null for an ordinary photo
  // and for every barcode lookup), cleared by the owner's finally (R2).
  const retakeAfterRef = useRef<RetakeReason | null>(null);
  // The result object whose count/history writes have begun (R5). Never
  // released for that object: a second "See what I could read" pushes only.
  const committedResultRef = useRef<AnalysisResult | null>(null);
```

**Camera invariants (R1):**

```ts
  const cameraMounted = !!permission?.granted && !isAnalyzing && !systemState && !retake && recovery?.phase !== 'prompt';
  …
  const promptVisible = isFocused && !isAnalyzing && !systemState && !retake && recovery?.phase === 'prompt';
```

**`openRecents`:**

```ts
  const openRecents = useCallback(() => {
    if (retakeRef.current?.committing) return;
    pendingRetakeRef.current = null; // T4: leaving for Recents ends the retake
    exitRecovery(); // no-op outside a flow
    router.push('/recents');
  }, [exitRecovery, router]);
```

**`processAndAnalyze`** — at the top, after `setScanSource(source)`:

```ts
    // A new photo leaves the retake screen (the picker path arrives here with
    // it still set, R5) and spends the pending flag — even if the attempt is
    // then stopped offline before it is sent (R2, a known gap).
    if (retakeRef.current) setRetakeState(null);
    const pending = pendingRetakeRef.current;
    pendingRetakeRef.current = null;
    const retakeAfter = pending && Date.now() - pending.at < RETAKE_FLAG_TTL_MS ? pending.reason : null;
```

next to `abortControllerRef.current = controller;` (the same synchronous block): `retakeAfterRef.current = retakeAfter;`

the call: `analyzeImage(manipulated.base64, controller.signal, (progress) => {…}, retakeAfter ?? undefined)`

after the post-analysis `if (!ownsRequest()) return;`, before `navigateToResult`:

```ts
      // Decision 009: a known retake_reason is a retake, not a verdict. No
      // count, no history, no push (D3). Unfocused: drop it, exactly as
      // navigateToResult does (R1) — nothing is stashed to surface later.
      if (isRetakeReason(result.retake_reason)) {
        if (!focusedRef.current) return;
        pendingRetakeRef.current = { reason: result.retake_reason, at: Date.now() };
        setRetakeState({ result, reason: result.retake_reason, source, committing: false, written: false, scanCount: 0 });
        return;
      }
```

in `finally`, under the ownership check: `retakeAfterRef.current = null;`

**`handleBarcodeScanned`:** first guard becomes `if (retakeRef.current || recoveryRef.current || !focusedRef.current) return;` (comment: no lookup under a retake screen, committing or not — a callback queued before the camera unmounted must not start one). After `scanningRef.current = true;`: `pendingRetakeRef.current = null; // T4` . Next to `abortControllerRef.current = controller;`: `retakeAfterRef.current = null;`. In `finally`, under ownership: `retakeAfterRef.current = null;`.

**`handleCapture` and `handlePickImage`:** add `|| retakeRef.current?.committing` to each guard.

**Handlers**, after `handlePickImage`:

```ts
  // Retake-screen actions. Both return while a commit runs (R3); the screen
  // stays up, inert, until it finishes.
  const handleRetake = () => {
    if (!retakeRef.current || retakeRef.current.committing) return;
    // An explicit choice to leave: back to the camera, torch as the user set it.
    setRetakeState(null);
  };
  const handleChooseAnotherPhoto = () => {
    if (!retakeRef.current || retakeRef.current.committing) return;
    // The retake state stays set (R5): a cancelled picker lands back on this
    // screen with its way out intact; a picked photo clears it in
    // processAndAnalyze.
    void handlePickImage();
  };
  const handleSeeResult = () => {
    // Task 7 wires the commit.
  };
```

**Render**, after the `systemState === 'error'` block and before the recovery prompt:

```tsx
  // A photo the server couldn't read fully is a retake, not a verdict
  // (decision 009). The body is the server's reason-specific copy. Deliberately
  // not amber (T7). Stays up, inert, while "See what I could read" commits.
  if (retake) {
    const fromPicker = retake.source === 'picker';
    return (
      <StateScreen
        icon="camera"
        title={RETAKE_COPY.title}
        body={retake.result.explanation}
        primary={fromPicker ? RETAKE_COPY.chooseAnother : RETAKE_COPY.retake}
        onPrimary={fromPicker ? handleChooseAnotherPhoto : handleRetake}
        secondary={RETAKE_COPY.seeResult}
        onSecondary={handleSeeResult}
      />
    );
  }
```

It renders before the permission gate on purpose: a picker-only user (no camera permission) can get a retake and must see this screen, and their primary is "Choose another photo".

- [ ] **Step 4: Green, the whole suite, `tsc`, commit** — `App: the retake screen, its way back to the camera, and the retake_after flag (decision 009)`.

---

### Task 7: `commitResult` and "See what I could read"

**Files:** `mobile/app/index.tsx`, `mobile/app/__tests__/index.test.tsx`.

- [ ] **Step 1: Write the failing tests**, in a nested `describe('"See what I could read"')`. Helper: `async function showRetake(utils, reason = 'no_heading', via: 'camera' | 'picker' = 'camera')` that resolves `analyzeImage` with `RETAKE(reason)` and captures or picks. Where a handler must be called "directly", capture its `onPress` from the camera render **before** the scan (`getByLabelText('Capture photo of ingredients').props.onPress`, same for `'Upload photo from library'`, `'View recent scans'`) and the barcode handler from `camera-view`; those are the closures of the previous render (R3's same-tick case).

1. **Commits once:** press `See what I could read` → `incrementLifetimeScanCount` once, `addRecentScan` once with the result, `mockPush` once with `params.result === JSON.stringify(result)` and `scanCount === '1'`; the retake screen is gone and the camera is back under the pushed route (`camera-view` present).
2. **Double tap commits once (R1):** two `fireEvent.press` in the same `act` → one of everything.
3. **A second tap after the push, and a tap after Back, find no button (R2):** `queryByLabelText('See what I could read')` is null after the push; `focusControl.blur()` then `focus()` → still null; counts unchanged.
4. **Inert while the count write is pending (R3, R4):** hold `incrementLifetimeScanCount` pending; press `See what I could read`; then call, in turn: `fireEvent.press` on `Retake` and `See what I could read` (both still rendered), the captured `onBarcodeScanned`, `onPress` for capture, library, Recents → `mockLookupBarcode`, `mockTakePictureAsync`, `mockLaunchLibrary` not called, `mockPush` not called with `'/recents'`; `incrementLifetimeScanCount` still once; the screen is still up. Resolve the count → `mockPush` once, screen gone.
5. **`handleBarcodeScanned` under a retake screen that is not committing starts no lookup (R4)** — already in Task 6 case 12; reference it, don't repeat it.
6. **A throwing `router.push` with a silent `addRecentScan` failure (R5):** `mockPush.mockImplementationOnce(() => { throw new Error('nav'); })`; `addRecentScan` resolves (its failures are swallowed inside the service; the test models that by resolving); press → `reportError` called with the error; the screen is still up and interactive; `incrementLifetimeScanCount` once. Press again → `mockPush` called a second time with the same `params.scanCount` as the first; `incrementLifetimeScanCount` and `addRecentScan` still once. Then the same inside a recovery flow (enter capture, retake, see, push throws, see again): the flow stays open (no `exited` event) and the successful push carries `recoveryFlowId`.
7. **Picker cancel from the screen keeps the way out (R5):** covered by Task 6 case 6; add the in-flow variant here (enter capture via `enterCapture()`, retake from a pick — the recovery capture has the same library button label — cancel → `See what I could read` still present; press it → push with `recoveryFlowId`).
8. **A deferred picker result during a commit is discarded (R6):** retake from a pick; press `Choose another photo` with `mockLaunchLibrary` returning a pending promise; hold the count write; press `See what I could read`; resolve the pick with an asset → `mockAnalyzeImage` still called once (no new scan), the screen still up; resolve the count → one push, screen gone.
9. **The push-only retry carries the first write's `scanCount` (R6):** (a) count resolves 7, push throws, retry → both pushes carry `'7'`, `incrementLifetimeScanCount` once; (b) count rejects, push throws, retry → both carry `'0'`, `reportError` called for the count and the push, `getLifetimeScanCount` / storage not read again (`incrementLifetimeScanCount` once).
10. **A blur after the commit began still pushes:** hold the count; press; `focusControl.blur()`; resolve → push once.
11. **A tap while unfocused does nothing:** `focusControl.blur()` first, then call the captured `See what I could read` `onPress` → nothing called.
12. **A rejected count write still pushes with 0 (R2):** `incrementLifetimeScanCount.mockRejectedValueOnce(new Error('disk'))` → `reportError` called, `addRecentScan` once, push once with `scanCount: '0'`, screen gone.
13. **Normal path unchanged:** the existing `second-grill regressions on the normal path` tests still pass (they exercise `navigateToResult`, which now delegates). Add one: a throwing `router.push` on the normal path is reported and leaves the user on the camera (no alert) with the count spent once.

- [ ] **Step 2: Run and confirm they fail.**

- [ ] **Step 3: Implement**

Replace `navigateToResult` with `commitResult` + a thin `navigateToResult`:

```ts
  // Commit a result: count, history, push — the one place a response becomes
  // a verdict the user saw. Shared by navigateToResult (the normal path, which
  // adds its controller/settled checks) and the retake screen's "See what I
  // could read" (decision 009). Rules, from the spec's grill (R1–R6):
  // - focus first; nothing happens from under another route;
  // - the writes run at most once per result object (committedResultRef is
  //   never released for it); a later call with the same object only pushes;
  // - under a retake screen, the lock, `committing` and the picker
  //   invalidation are set in one synchronous step before the first await,
  //   so a handler closure from the previous render sees them;
  // - a failed count write is reported and the result still pushes with a
  //   count of 0, so no rating prompt fires; addRecentScan never throws;
  // - a failed push is reported and leaves the retake screen interactive with
  //   `written: true`, so the next tap pushes without a second write;
  // - an open recovery flow is handed off only after a push succeeds, so
  //   result_displayed still fires on the retry that reaches the result.
  const commitResult = useCallback(async (result: AnalysisResult, flow: RecoveryFlow | null) => {
    if (!focusedRef.current) return;
    const state = retakeRef.current;
    if (state && state.committing) return;
    const alreadyWritten = committedResultRef.current === result;
    committedResultRef.current = result;
    let scanCount = state?.scanCount ?? 0;
    if (state) {
      setRetakeState({ ...state, committing: true });
      // A "Choose another photo" pick still pending fails its own token check
      // and is discarded (R6) — the same mechanism as Cancel, exit and blur.
      invalidatePhotoSelection();
    }
    if (!alreadyWritten) {
      try {
        scanCount = await incrementLifetimeScanCount();
      } catch (error) {
        reportError(error, { context: 'scan_count_write' });
        scanCount = 0;
      }
      await addRecentScan(result); // never throws — history can't break a scan
      if (retakeRef.current?.result === result) {
        setRetakeState({ ...retakeRef.current, written: true, scanCount });
      }
    }
    try {
      router.push({
        pathname: '/result',
        params: {
          result: JSON.stringify(result),
          scanCount: String(scanCount),
          ...(flow ? { recoveryFlowId: flow.id, recoveryReason: flow.reason } : {}),
        },
      });
    } catch (error) {
      reportError(error, { context: 'result_push' });
      if (retakeRef.current?.result === result) {
        setRetakeState({ ...retakeRef.current, committing: false, written: true, scanCount });
      }
      return;
    }
    // The push went through: the flow is complete and the retake screen is
    // done. The answered product is still in the user's hand — suppress its
    // code like a dismissal, or Back would re-open the prompt.
    if (flow) {
      suppressCode(flow.barcode);
      setRecoveryFlow(null);
    }
    resumedFromBackground.current = false;
    if (retakeRef.current?.result === result) setRetakeState(null);
  }, [router, setRecoveryFlow, suppressCode, setRetakeState, invalidatePhotoSelection]);

  const navigateToResult = useCallback(async (result: AnalysisResult, controller: AbortController) => {
    const flow = recoveryRef.current;
    if (abortControllerRef.current !== controller || controller.signal.aborted || !focusedRef.current) return;
    // From here the result is committed as one unit. Marking it settled makes
    // abandonScan stand aside (see its comment).
    settledRef.current = controller;
    await commitResult(result, flow);
  }, [commitResult]);
```

Keep the existing explanatory comments from `navigateToResult` where they still apply. Note the two deliberate consequences for the normal path, for the reviewer: (1) the recovery flow is now cleared **after** the push, not before; (2) a throwing `router.push` is reported and swallowed instead of reaching `handleError`'s alert.

`handleSeeResult`:

```ts
  const handleSeeResult = () => {
    const state = retakeRef.current;
    if (!state || state.committing) return;
    pendingRetakeRef.current = null; // T4: the user took this result; the next photo is not a retake
    void commitResult(state.result, recoveryRef.current);
  };
```

- [ ] **Step 4: Green, the whole suite, `tsc`, commit** — `App: "See what I could read" commits once, retries the push only, and holds the screen inert meanwhile`.

---

### Task 8: Beacons and the recovery flow

**Files:** `mobile/app/index.tsx`, `mobile/app/__tests__/index.test.tsx`.

- [ ] **Step 1: Write the failing tests**

In the retake describe:

1. **Cancel and background on a retake scan carry `retake_after` (R1):** retake → `Retake` → capture with `analyzeImage` pending → press `Cancel` → `sendFailureBeacon` called with `('ocr', 'cancelled', expect.any(Number), 'no_heading')`. Same with the AppState listener `'background'` → `('ocr', 'interrupted', undefined, 'no_heading')`.
2. **Timeout and network on a retake scan:** these beacons are sent inside `analyzeImage`, which is mocked here; assert `mockAnalyzeImage` received `'no_heading'` as its fourth argument (the service test in Task 5 proves it forwards it).
3. **An ordinary scan after a retake carries none (R2):** retake → `Retake` → capture (uses the flag) → result → Back (`focusControl.blur(); focus()`) → capture again with `analyzeImage` pending → Cancel → beacon's fourth argument `undefined`. And: retake → `Retake` → barcode scan with `lookupBarcode` pending → Cancel → `('barcode', 'cancelled', expect.any(Number), undefined)`.
4. **Offline pre-flight spends the flag silently (R2):** retake → `Retake` → `mockAnalyzeImage.mockRejectedValueOnce(new APIError('offline', 'network'))` → capture → the offline screen; `sendFailureBeacon` not called; press `Try again` → capture with `LABEL_RESULT` → fourth argument `undefined`.
5. **Recovery flow survives a retake:** `enterCapture()`; capture with `RETAKE('no_end')` → the retake screen; `recoveryEvents('exited')` empty; `mockPush` not called (so `result_displayed` can't have fired); press `Retake` → `getByText('PHOTO ONLY')` (photo-only capture is back); capture again → `recoveryEvents('photo_started')` has two entries.
6. **`result_displayed` after "See what I could read" in a flow:** `enterCapture()`; retake; press `See what I could read` → `mockPush` params include `recoveryFlowId: 'flow-1'`, `recoveryReason: 'not_found'`; the flow is cleared (a following `scan()` starts a lookup, i.e. `onBarcodeScanned` is defined after the re-arm). `result_displayed` itself is `result.tsx`'s job and is already tested there.
7. **Opening Recents inside a flow from the camera after a retake** goes through `exitRecovery` (an `exited` event) — one assertion on the existing `exiting recovery` pattern.

- [ ] **Step 2: Run and confirm they fail.**

- [ ] **Step 3: Implement**

`abandonScan`, in the `if (current)` block:

```ts
      const retakeAfter = retakeAfterRef.current ?? undefined;
      if (reason === 'cancelled') {
        sendFailureBeacon(scanMethodRef.current, 'cancelled', Date.now() - scanStartedAtRef.current, retakeAfter);
      } else {
        sendFailureBeacon(scanMethodRef.current, 'interrupted', undefined, retakeAfter);
      }
```

Everything else in this task should already hold from Tasks 6–7 (the per-scan ref is written at every request start and cleared by the owner's finally; the recovery flow is untouched by the retake state). If a test fails, fix the screen, not the test.

- [ ] **Step 4: Green, the whole suite, `tsc`, commit** — `App: retake_after on the cancel/background beacons; recovery flow survives a retake`.

---

### Task 9: Docs

**Files:** `.claude/decisions/009-retake-not-a-verdict.md`, `docs/how-it-works*.svg` and `.png` (4 + 4), `mobile/RELEASE.md`, `CLAUDE.md`, `plans/verdict-calibration-2026-09-23.md`, `ROADMAP.md`.

- [ ] **Step 1: Decision 009**

`.claude/decisions/009-retake-not-a-verdict.md`, in the 008 format (title, Date, Status, Related, Context, Decision, Consequences). Title: "009 — A photo we can't read fully is a retake, not a verdict". Status: Accepted (Aaron, 2026-10-11, approach B); PR number once open. Related: 005, 006, `plans/retake-state-2026-10-11.md`, `plans/barcode-recovery-2026-09-05.md`. Context: the list-gate read (the spec's Evidence section, verbatim numbers). Decision: D2–D4 and the toggles T1–T9 with their defaults. Consequences: the two-half ship, the known gaps (offline pre-flight, web unchanged, the proxy nature of the read), and what would reopen it (the loop alarm, T8's query 3, the diagnostic).

- [ ] **Step 2: Diagrams**

Both SVGs, light and `-dark` (same geometry in each pair):

- `docs/how-it-works.svg`: in the aria-label, after "…a photographed ingredient list looks cut off", add "; on iOS, a caution with nothing else to show asks for a retake instead". In the drawing, under the "4 · Safe floor" column (after `→ never “Safe”` at y=540): `<text class="t-sub" x="1230" y="556" text-anchor="middle">iOS: “Retake the photo”</text>`.
- `docs/how-it-works-simple.svg`: aria-label "Answer: Safe, Caution, or Unsafe, with the reason in plain English — or, when the photo can't be read fully, a request to retake it — and it stays on your phone." In the drawing, after "plain English" (y=368): `<text class="t-sub-lg" x="1320" y="392">or “retake the photo”</text>`.

Re-render the four PNGs the way the 2026-09-16 session did (`docs/README.md`): an `<img>` wrapper at 3200 px wide served over `python3 -m http.server` from `docs/`, screenshotted with Playwright's Chromium (`file://` is blocked in the plugin). Check each PNG opens and shows the new line. Update the README's engineering-version sentence to mention the retake.

- [ ] **Step 3: `mobile/RELEASE.md`**

"⏳ Pending on main" becomes:

- **iOS 1.5.1 is the next release** (version already bumped in `app.json`, PR #27). It ships: the result-footer write-review link (`plans/review-prompt-visibility-2026-09-15.md`) and the retake screen (`plans/retake-state-2026-10-11.md`, decision 009; the API half is live since <merge date>).
- Keep the rejection playbook bullet. Replace "No next iOS release is scheduled" with the smoke/TestFlight checks the spec's rollout step 3 names (top-cut label → retake screen; torch on → retake → light returns; the retake's `scan` event carries `retake_after`).
- Update the jest count in "Sanity check the JS before building".

- [ ] **Step 4: `CLAUDE.md`**

- Quick Reference: the Part B sentence ("Left: the day-28 read … and Part B, the retake-screen plan, which bundles with the parked 1.5.1") → "Part B is `plans/retake-state-2026-10-11.md` (decision 009): API half live since <date>; app half ships in iOS 1.5.1."
- Project Structure, `api/track.js`: add "optional `retake_after`, same allowlist as analyze (decision 009)".
- Project Structure, `mobile/app/index.tsx`: add "Owns the transient retake state (decision 009): a known `retake_reason` shows a `StateScreen` instead of a verdict; nothing is counted or saved until "See what I could read" runs `commitResult`, which is also what `navigateToResult` uses; the next photo carries `retake_after` once. Every entry point guards on `retakeRef`."
- Guidelines, after the ingredient-list-gate bullet: one sentence — "**A caution with nothing else to show is a retake on iOS** (decision 009): `retakeReasonFor` sets `retake_reason` on an `incomplete` label caution with empty flagged/allergen/menu rows; the app branches only on a known value. Never key the retake screen on `caution_reason` or on the barcode path."

- [ ] **Step 5: The parent plan and the roadmap**

`plans/verdict-calibration-2026-09-23.md` Task 9 Step 3: `- [x] **Step 3: Write Part B's plan** → plans/retake-state-2026-10-11.md (spec SHIP 2026-10-11, implemented in PR #<n>)`. `ROADMAP.md`: under the verdict-calibration items, add a done line for the retake screen (API live date, iOS 1.5.1) and an open line for the day-14 read.

- [ ] **Step 6: `npm test`, commit** — `Decision 009, diagrams, runbook, CLAUDE.md and roadmap for the retake screen`.

---

### Task 10: Ship the PR

- [ ] **Step 1: The scope check (D4)**

```bash
git diff main --stat
git diff main -- api/analyze.js | grep '^[-+]' | grep -v '^[-+][-+]' | grep -n "CLAUDE_PROMPT\|applySafeVerdictFloor\|applyIngredientListGate\|checkIngredientList\|INGREDIENT_HEADING_PATTERN\|MIN_OCR_CHARS_FOR_SAFE = "
```

The second command must print only the new `import`/`export` lines and the handler's two new call sites. `api/barcode.js`, `web/js/`, and `web/tests/fixtures/real-label-ocr.json` must not appear in the stat.

- [ ] **Step 2: Everything green, once more**

```bash
npm test
cd mobile && npm test && npx tsc --noEmit && cd ..
```

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin retake-state-2026-10-11
```

PR title: "A photo we can't read fully is a retake, not a verdict (decision 009)". Body: the spec's first paragraph, the two halves (API on merge, app in 1.5.1), "no verdict change, no live evals (D4)", the Review focus list above, and the three things to verify after merge (Task 11).

- [ ] **Step 4: Review by a different agent** (Pi, or a report-only Opus session) with the Review focus list. A review agent never runs live evals. Fold fixes in as further commits; re-run both suites.

- [ ] **Step 5: Aaron's "proceed", merge, note the merge time (UTC)** — it is the privacy policy's effective date and the `<merge time>` in the day-14 read's query 4.

---

### Task 11: Verify the API half on production

Spec rollout step 2 has the rules; this is the mechanics. Tag every verification request with an `-rc` app version so the day-14 read excludes it.

- [ ] **Step 1: One image, picked once**

Render the spec's example text (no "Ingredients" heading, 150–200 chars, ends in a full stop) as a JPEG and base64 it:

```bash
IMG=$(base64 -i retake-check.jpg | tr -d '\n')
curl -sS -X POST https://www.glutenornot.com/api/analyze \
  -H 'Content-Type: application/json' -H 'X-Client: ios' -H 'X-Client-Version: 1.5.1-rc.check' \
  -d "{\"image\":\"$IMG\"}" | jq '{verdict, caution_reason, retake_reason, flagged_ingredients, allergen_warnings, menu_items, explanation}'
```

Work out `retakeReasonFor` by hand from what came back, and judge the field against the rule, not the hoped-for outcome (R2). Only a positive `retake_reason` verifies the response path (R3); a negative one leaves it **unverified** until the TestFlight check in Task 12.

- [ ] **Step 2: The `scan` event**

Same `curl` + HogQL shape as the calibration plan's Task 0 Step 2 (project 457245, `POSTHOG_PERSONAL_API_KEY` from `.env`, `refresh: force_blocking`):

```sql
SELECT timestamp, properties.verdict, properties.list_gate, properties.retake_reason, properties.list_heading_word, properties.retake_after FROM events WHERE event='scan' AND properties.app_version='1.5.1-rc.check' ORDER BY timestamp DESC LIMIT 5
```

Expected case: `list_gate: no_heading`, `retake_reason: no_heading`, `list_heading_word: false`.

- [ ] **Step 3: `retake_after` on the request, and the beacon**

```bash
curl -sS -X POST https://www.glutenornot.com/api/analyze \
  -H 'Content-Type: application/json' -H 'X-Client: ios' -H 'X-Client-Version: 1.5.1-rc.check' \
  -d "{\"image\":\"$IMG\",\"retake_after\":\"no_heading\"}" | jq '.retake_reason'
curl -sS -o /dev/null -w '%{http_code}\n' -X POST https://www.glutenornot.com/api/track \
  -H 'Content-Type: application/json' -H 'X-Client: ios' -H 'X-Client-Version: 1.5.1-rc.check' \
  -d '{"method":"ocr","reason":"cancelled","elapsed_ms":1200,"retake_after":"no_heading"}'   # 204
```

Then the query above (and its `scan_failed` twin) must show `retake_after: no_heading` on the second scan and on the beacon.

- [ ] **Step 4: Record the outcome** under Execution notes: the response as returned, which paths are verified, the merge time. Check that both UptimeRobot monitors are still green (the health JSON is untouched, so they should be).

---

### Task 12: iOS 1.5.1

- [ ] **Step 1:** Invoke the `glutenornot-release` skill (`mobile/RELEASE.md`). `app.json` is already at `1.5.1`; the smoke build is tagged `1.5.1-rc.smoke`.
- [ ] **Step 2: TestFlight checks** (spec rollout step 3): a label photographed with its top cut off shows the retake screen (this is the positive verification of the response path if Task 11 was negative); retake with the torch on and the light comes back; the retake's `scan` event carries `retake_after` (query with `app_version = '1.5.1-rc.smoke'`). Also: the write-review link from PR #27 works, since it ships here too.
- [ ] **Step 3:** Submit, tag, close out per the runbook. After the public release, read `currentVersionReleaseDate` from `https://itunes.apple.com/lookup?bundleId=com.glutenornot.scanner` and write it under Execution notes: it's the `timestamp >=` for the day-14 read.
- [ ] **Step 4:** `mobile/RELEASE.md` "Pending on main" → "Nothing"; `CLAUDE.md` Quick Reference → 1.5.1 shipped; session log + index row.

---

### Task 13: The day-14 read

- [ ] Day 14 after the public release (day 28 if fewer than 20 retake responses): run the four queries from the spec's "The day-14 read" (Task 4 wrote them into `api/ANALYTICS.md`), paste the tables under **Day-14 read** below, apply "What to do with the results", then close this plan or open the follow-ups it names. Add the read's date to `ROADMAP.md` and `CLAUDE.md` so it isn't lost.

---

## Execution notes

_Filled in while executing: deviations from the tasks above, the production verification result (Task 11), the merge time, the 1.5.1 release time._

## Day-14 read

_Filled in by Task 13._
