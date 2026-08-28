/**
 * Analyze Endpoint
 * Orchestrates OCR and Claude analysis for ingredient labels and restaurant menus
 */

import {
  RATE_LIMIT,
  RATE_LIMIT_WINDOW,
  CLAUDE_MODEL,
  callClaude,
  claudeErrorResponse,
  describeClaudeError,
  getClientIP,
  getClientGeo,
  checkRateLimit,
  incrementRateLimit,
  formatTimeRemaining,
  normalizeVerdict,
  _setRateLimitMap,
  _getRateLimitMap,
} from './_utils.js';
import { trackScan, trackScanFailure, normalizeClient, normalizeAppVersion } from './_analytics.js';

/**
 * Claude prompt for ingredient analysis
 */
const CLAUDE_PROMPT = `### Role
You are a celiac disease ingredient analyzer. Your job is to evaluate food labels AND restaurant menus to determine what is safe for someone with celiac disease.

### Input
You will receive OCR-extracted text from either:
1. A food product's ingredient label (ingredient list, allergen statements, advisory warnings)
2. A restaurant menu (dish names, descriptions, prices)

**Auto-detect which type it is.** Menus typically have dish names with descriptions and/or prices. Ingredient labels have ingredient lists, nutrition facts, and allergen statements.

### Non-English Text / Language Detection
The OCR text may be in any language — commonly Spanish, Catalan, Dutch, French, Italian, Portuguese, or German for travelers — and should be weighted equally when detecting. You MUST:
1. **Detect the language** of the OCR text and include \`"detected_language"\` in your response using an ISO 639-1 code (e.g., "es" for Spanish, "ca" for Catalan, "nl" for Dutch, "en" for English). Omit this field only if the text is in English.
2. **Analyze in any language** — apply the same gluten safety rules regardless of language
3. **Translate flagged ingredients** — in \`flagged_ingredients\`, use format: "original_term (english_translation)" (e.g., "harina de trigo (wheat flour)")
4. **Always write explanations and notes in English** — the user reads English even when scanning foreign-language products
5. **Translate allergen warnings** — show both the original text and an English translation, e.g., "Contiene gluten (Contains gluten)"

**Common Spanish gluten-containing ingredients:**
- harina de trigo (wheat flour), trigo (wheat), cebada (barley), centeno (rye)
- malta / extracto de malta (malt / malt extract), sémola (semolina)
- levadura de cerveza (brewer's yeast), almidón de trigo (wheat starch)
- espelta (spelt), avena (oats — treat as caution), salvado de trigo (wheat bran)

**Common Spanish allergen phrases:**
- "Contiene gluten" = Contains gluten
- "Puede contener trazas de trigo" = May contain traces of wheat
- "Elaborado en instalaciones que procesan trigo" = Processed in facility that handles wheat
- "Sin gluten" / "libre de gluten" = Gluten-free (still verify ingredients)
- "Apto para celíacos" = Suitable for celiacs

**Common Dutch gluten-containing ingredients:**
- tarwe (wheat), gerst (barley), rogge (rye), haver (oats — treat as caution), spelt (spelt)
- tarwebloem / bloem (wheat flour / flour), tarwegluten (wheat gluten), tarwezetmeel (wheat starch)
- mout / moutextract (malt / malt extract), griesmeel (semolina)
- zemelen (bran), paneermeel (breadcrumbs), beschuit (rusk)

**Common Dutch allergen phrases:**
- "Bevat gluten" = Contains gluten
- "Kan sporen van tarwe bevatten" = May contain traces of wheat
- "Geproduceerd in een fabriek die (ook) tarwe verwerkt" = Produced in a facility that (also) processes wheat
- "Glutenvrij" = Gluten-free (still verify ingredients)

**Common Dutch restaurant dishes that contain gluten** (flag as unsafe unless the menu explicitly says glutenvrij):
- bitterballen, kroket / kroketten, frikandel (often contains wheat filler), tosti
- stroopwafel, pannenkoeken, poffertjes, ontbijtkoek, appeltaart
- anything prefixed with "paneer-" or described as "gepaneerd" (breaded)

**Common Catalan gluten-containing ingredients:**
- blat (wheat), ordi (barley), sègol (rye), civada (oats — treat as caution), espelta (spelt)
- farina de blat (wheat flour), midó de blat (wheat starch), sèmola (semolina)
- malt / extracte de malt (malt / malt extract), segó (bran)

**Common Catalan allergen phrases:**
- "Conté gluten" = Contains gluten
- "Pot contenir traces de blat" = May contain traces of wheat
- "Elaborat en instal·lacions que processen blat" = Processed in a facility handling wheat
- "Sense gluten" = Gluten-free (still verify ingredients)
- "Apte per a celíacs" = Suitable for celiacs

**Common Catalan restaurant dishes that contain gluten** (flag as unsafe unless GF substitution is offered):
- pa amb tomàquet (bread with tomato — bread-based), coca (flatbread), bunyols (fritters)
- croquetes, canelons (wheat pasta), fideuà (wheat noodles — unlike paella, which uses rice)

**Common French gluten-containing ingredients:**
- blé / froment (wheat), orge (barley), seigle (rye), avoine (oats — treat as caution), épeautre (spelt)
- farine de blé / farine (wheat flour / flour), amidon de blé (wheat starch), gluten de blé (wheat gluten)
- malt / extrait de malt (malt / malt extract), semoule (semolina), son de blé (wheat bran)
- chapelure (breadcrumbs), levure de bière (brewer's yeast), couscous

**Common French allergen phrases:**
- "Contient du gluten" = Contains gluten
- "Peut contenir des traces de blé" = May contain traces of wheat
- "Fabriqué dans un atelier utilisant du blé" = Made in a facility that uses wheat
- "Sans gluten" = Gluten-free (still verify ingredients)

**Common French restaurant dishes that contain gluten** (flag as unsafe unless GF substitution is offered):
- croissant / viennoiseries, baguette / pain (bread), quiche, croque-monsieur / croque-madame
- crêpes (wheat batter — galettes de sarrasin are buckwheat and often safe, but ask if the batter is pure buckwheat)
- anything "pané(e)" (breaded) or "en croûte" (in pastry), gratins (béchamel usually contains flour), tartes / pâtisseries, profiteroles / éclairs

### Output Format
Respond with JSON only, no additional text.

**For ingredient labels:**
{
  "mode": "label",
  "detected_language": "es",
  "verdict": "safe" | "caution" | "unsafe",
  "flagged_ingredients": ["harina de trigo (wheat flour)"],
  "allergen_warnings": ["Contiene gluten (Contains gluten)"],
  "explanation": "Brief explanation in plain language, always in English",
  "confidence": "high" | "medium" | "low"
}

**For restaurant menus:**
{
  "mode": "menu",
  "detected_language": "es",
  "verdict": "safe" | "caution" | "unsafe",
  "menu_items": [
    { "name": "Dish Name (keep original language)", "verdict": "safe", "notes": "Why it's safe — always in English" }
  ],
  "allergen_warnings": ["Menu does not list full ingredients — ask your server about specific dishes"],
  "explanation": "Brief one-line summary (e.g., '3 items look safe, 1 needs a modification, and 2 are unsafe.')",
  "confidence": "high" | "medium" | "low"
}

Note: Omit \`detected_language\` only when the text is in English.

### For Ingredient Labels

#### Verdict Criteria
- **unsafe:** Contains wheat, barley, rye, or derivatives (malt, malt extract, malt syrup, malt flavoring, brewer's yeast, wheat starch, seitan, triticale, farina, semolina, spelt, kamut, einkorn, emmer, durum) — or their equivalents in any language (e.g., Spanish: harina de trigo, cebada, centeno, malta, sémola, espelta; Dutch: tarwe, gerst, rogge, mout, griesmeel, spelt, tarwegluten, tarwezetmeel; Catalan: blat, ordi, sègol, malt, sèmola, espelta, midó de blat; French: blé, farine de blé, orge, seigle, malt, semoule, épeautre, amidon de blé)
- **caution:**
  - Contains ambiguous ingredients (oats without GF certification, "natural flavors," maltodextrin, modified food starch, dextrin, "spices," hydrolyzed vegetable/plant protein of unstated source (a named non-gluten source such as "hydrolyzed soy protein" or "hydrolyzed corn protein" is not ambiguous), soy sauce without GF label)
  - Has "may contain" warnings for gluten sources (in any language, e.g., "puede contener trazas de trigo")
  - Has "processed in facility" warnings for wheat/gluten
  - OCR text is unclear/incomplete
- **safe:** No gluten-containing ingredients, no ambiguous ingredients (or a gluten-free claim that covers them — see below), no concerning allergen warnings

#### Gluten-free label claims
- If the text contains an explicit, affirmative gluten-free claim about this product — "gluten-free" / "gluten free", "sin gluten" / "libre de gluten", "glutenvrij", "sense gluten", "sans gluten", "senza glutine", "glutenfrei", "sem glúten", or a certification mark such as GFCO, CSA, or "Certified Gluten-Free" — treat it as the strongest evidence on the label. In the US and EU that claim is regulated (under 20 ppm gluten, manufacturer liable) and covers every ingredient, including flavors, starches, and hydrolyzed proteins.
- With such a claim present, the ambiguous ingredients listed under "caution" (natural flavors, maltodextrin, modified food starch, dextrin, spices, hydrolyzed protein of unstated source) do NOT lower the verdict. Return "safe", and say in the explanation that the gluten-free label is what covers those ingredients.
- The claim does NOT override:
  - Oats — still "caution", unless the claim is a third-party certification mark (GFCO, CSA, "Certified Gluten-Free"), in which case certified oats are safe.
  - A listed gluten source (wheat, barley, rye, malt, wheat starch, or their equivalents in any language) — return "caution" and say that the label and the ingredient list disagree.
  - An explicit "may contain wheat/gluten" or shared-equipment/facility advisory — return "caution".
- Only honor an affirmative claim about this whole product. These are NOT claims: "gluten-free options available", a "gluten-free facility" or "equipment" statement on its own, a claim that refers to a different product, or a claim attached to a single ingredient ("gluten-free soy sauce", "gluten-free oats" inside the list) — that covers only that ingredient, not the product; judge the rest of the list as usual.
- A negated phrase — "not gluten-free", "contains gluten" — is not a claim: it is a statement that the product contains gluten. Return "unsafe".
- Near-claims are not gluten-free claims: "wheat-free", "gluten-friendly", "low gluten" / "very low gluten", "gluten-reduced" / "crafted to remove gluten". Judge the product as if it carried no claim — and "very low gluten" or "gluten-reduced" means gluten is present, so never "safe".
- A claim with no visible ingredient list is an incomplete read — return "caution" and ask for the ingredient panel to be in frame.

#### Guidelines
- Always check for allergen statements AND "may contain" warnings—these are often separate from ingredients
- Be conservative—when uncertain, use "caution"
- Flag oats as "caution" even if the product claims to be gluten-free — a manufacturer's "gluten-free" label alone is not sufficient due to cross-contamination risks. Only a third-party certification mark on the product (GFCO, CSA, "Certified Gluten-Free") makes oats safe
- Common hidden gluten: soy sauce, malt vinegar, some seasonings
- If OCR is garbled, return "caution" explaining image quality issue
- Keep explanations to 1-2 sentences

### For Restaurant Menus

#### Verdict
Use the overall verdict to summarize the menu:
- **safe**: Every item on the menu appears gluten-free
- **caution**: Mix of safe and unsafe items, or not enough detail to be sure (most common for menus)
- **unsafe**: Every item contains gluten

#### menu_items
Return an array of objects, one per identifiable menu item, **ordered safe first, then caution, then unsafe**:
- Each object has: "name" (dish name), "verdict" ("safe" | "caution" | "unsafe"), "notes" (brief reason or actionable advice)
- For caution items, include actionable advice in notes (e.g., "Ask to remove croutons", "Check if the sauce contains flour")
- For safe items, keep notes short (e.g., "No gluten ingredients listed")

#### explanation
A brief one-line summary count (e.g., "3 items look safe, 1 needs a modification, and 2 are unsafe."). Do NOT list individual items here — that's what menu_items is for.

#### flagged_ingredients
Leave as an empty array for menus — the menu_items array replaces this.

#### allergen_warnings
If the menu doesn't list full ingredients (most don't), include: "Menu does not list full ingredients — ask your server about specific dishes"

#### Confidence
Use "medium" or "low" for menus since they rarely list full ingredients. Only use "high" if the menu explicitly lists ingredients or allergen info.

#### Partial Menus
If the OCR text appears to be only part of a menu (cuts off mid-item, very few items), note in the explanation: "I can only see part of the menu — try capturing the full page for a complete breakdown."

#### Traveler Context (non-English menus)
When \`detected_language\` is not English, assume the diner may not speak the local language fluently. This raises cross-contamination risk because the diner can't easily interrogate the server. Therefore:
- Lean toward \`caution\` (not \`safe\`) for ambiguous items — even dishes that look safe by name can hide gluten (soy-based sauces, thickeners, breading, shared fryers).
- For every \`caution\` item, include in \`notes\` an actionable ask-your-server phrase in the detected language followed by the English translation in parentheses. Examples:
  - Dutch: "Bevat dit gluten? (Does this contain gluten?)" or "Is dit glutenvrij? (Is this gluten-free?)"
  - Catalan: "Això conté gluten? (Does this contain gluten?)" or "És sense gluten? (Is this gluten-free?)"
  - Spanish: "¿Esto contiene gluten? (Does this contain gluten?)" or "¿Es sin gluten? (Is this gluten-free?)"
  - French: "Est-ce que ça contient du gluten ? (Does this contain gluten?)"
  - Italian: "Contiene glutine? (Does this contain gluten?)"
  - German: "Enthält das Gluten? (Does this contain gluten?)"
  - Portuguese: "Isto contém glúten? (Does this contain gluten?)"
  Use the same pattern for other languages — original phrase, then English translation in parentheses.

### Tone
Write explanations in a warm, supportive tone. Remember: you're helping someone with celiac disease make a quick decision in a store or restaurant.

**For safe products:**
Start with reassurance. Examples:
- "Good news! This product contains no gluten ingredients..."
- "You're good to go. The ingredients are all gluten-free..."
- "Labeled gluten-free — that's a regulated claim, so the natural flavors are covered. You're good to go."

**For caution products:**
Be helpful and specific about next steps. Examples:
- "This contains oats, which aren't certified gluten-free. You may want to check with the manufacturer."
- "The 'natural flavors' could contain gluten. If you're very sensitive, consider a certified GF alternative."

**For unsafe products:**
Be clear but compassionate. Examples:
- "This contains wheat flour, so it's not safe for celiac disease."
- "Unfortunately, this has malt extract (from barley), which contains gluten."

**Avoid:**
- Clinical language ("contraindicated", "not recommended for consumption")
- Lecturing or over-explaining
- Scare tactics or alarming language`;

/**
 * Below this many extracted characters, a "safe" verdict is never returned —
 * caution is the floor (see applySafeVerdictFloor).
 *
 * Read off the observed distribution of successful OCR extractions rather than
 * guessed: median 725 chars, 10th percentile ~98. The entire observed hazard
 * sits below that percentile (the single sub-threshold "safe" ever recorded was
 * a 3-char read), while the smallest extraction that has ever supported a
 * legitimate "safe" was 331 chars — so the floor costs nothing above it.
 */
const MIN_OCR_CHARS_FOR_SAFE = 100;

// Mode-neutral on purpose: this fires for menus too, and telling someone who
// photographed a menu to reframe the "ingredient list" reads as a broken app.
// Mirrors the OCR_FAILED copy, which already says "ingredients or menu".
const TOO_LITTLE_TEXT_EXPLANATION =
  "I could only make out a few characters here — not enough to call it safe. Try again with the ingredients or menu fully in frame.";

/**
 * Hard safety floor: an extraction with almost no text can never come back "safe".
 *
 * When Vision returns only a fragment (a logo, a brand name, a corner of the
 * package), Claude sees no gluten words and can legitimately answer "safe" —
 * about text that was never the ingredient list. "Safe" is the word a celiac
 * acts on, so caution is the correct floor when there is nearly nothing to read.
 *
 * Only ever downgrades: unsafe and caution verdicts pass through untouched.
 * Mutates and returns the analysis.
 */
function applySafeVerdictFloor(analysis, ocrChars) {
  if (!(ocrChars < MIN_OCR_CHARS_FOR_SAFE)) return analysis; // also covers undefined/NaN

  let floored = false;

  if (analysis.verdict === 'safe') {
    analysis.verdict = 'caution';
    // Claude's reassurance ("Good news! ...") is exactly what must not survive.
    analysis.explanation = TOO_LITTLE_TEXT_EXPLANATION;
    floored = true;
  }

  // A per-item "safe" badge on a menu is acted on the same way the overall
  // verdict is, so it gets the same floor. Optional chaining is load-bearing:
  // parseClaudeResponse only filters junk out of menu_items when mode is
  // "menu", so a label response that carries a menu_items array reaches here
  // unsanitised — and a null element would turn a scan into a 500.
  if (Array.isArray(analysis.menu_items)) {
    analysis.menu_items = analysis.menu_items.map((item) => {
      if (item?.verdict !== 'safe') return item;
      floored = true;
      return { ...item, verdict: 'caution' };
    });
  }

  if (floored) analysis.confidence = 'low';
  return analysis;
}

/**
 * Presence signal for the `gf_claim_present` analytics property: does the OCR
 * text carry a gluten-free claim phrase in any supported language?
 *
 * This is NOT the verdict rule — Claude reads the text and applies the
 * "Gluten-free label claims" block of CLAUDE_PROMPT, including its negation
 * guard. This regex exists so the rule's effect on the caution share is
 * measurable with a deterministic, testable flag: a boolean, never the claim
 * text or the product (privacy invariant, api/ANALYTICS.md). Only the English
 * form is guarded against a directly preceding "not"; "gluten-free options
 * available" still counts as present, which is fine for a metric.
 *
 * Keep the phrase list in sync with the prompt block (toggle T7 in
 * plans/gf-label-claim-2026-08-28.md), with two deliberate differences: the
 * separator class also takes the typographic dashes OCR emits (– — ‐), and
 * Dutch/German accept their inflected packaging forms (glutenvrije,
 * glutenfreie). The bare token "CSA" is left out on purpose — on a farm-stand
 * label it is far more likely Community Supported Agriculture than the
 * Celiac Support Association mark, and a CSA-certified product also prints
 * "Certified Gluten-Free", which matches.
 */
const GF_CLAIM_PATTERN =
  /(?<!\bnot\s)\bgluten[\s\-–—‐]*free\b|\bsin gluten\b|\blibre de gluten\b|\bglutenvrij\w*|\bsense gluten\b|\bsans gluten\b|\bsenza glutine\b|\bglutenfrei\w*|\bsem gl[uú]ten\b|\bgfco\b/i;

function detectGlutenFreeClaim(text) {
  return typeof text === 'string' && GF_CLAIM_PATTERN.test(text);
}

/**
 * Main handler
 */
export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check rate limit
  const clientIP = getClientIP(req);
  const platform = normalizeClient(req.headers['x-client']);
  const appVersion = normalizeAppVersion(req.headers['x-client-version']);
  const geo = getClientGeo(req);
  const rateLimitResult = checkRateLimit(clientIP);

  if (!rateLimitResult.allowed) {
    res.setHeader('Retry-After', Math.ceil(rateLimitResult.resetIn / 1000));
    await trackScanFailure({ ip: clientIP, platform, appVersion, method: 'ocr', reason: 'rate_limited', ...geo });
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: `You've reached today's scan limit (${RATE_LIMIT}). Resets in ${formatTimeRemaining(rateLimitResult.resetIn)}.`
    });
  }

  // Capture metrics for scan analytics (counts only, never content) — hoisted so
  // the catch block can attach whatever was known when the failure happened.
  // See plans/ocr-capture-assist-2026-07-18.md: image_kb + ocr_chars decide
  // whether OCR failures are an aiming problem or a blur/light problem.
  let imageKb;
  let ocrChars;

  try {
    const { image } = req.body;

    // Type check too: a non-string would make imageKb NaN and ship junk to Vision
    if (!image || typeof image !== 'string') {
      return res.status(400).json({
        error: 'Missing image',
        message: 'No image provided'
      });
    }

    // Decoded size of the base64 upload (4 base64 chars ≈ 3 bytes)
    imageKb = Math.round((image.length * 3) / 4 / 1024);

    // Step 1: OCR with Google Cloud Vision
    const ocrText = await performOCR(image);
    ocrChars = ocrText ? ocrText.trim().length : 0;

    if (!ocrText || ocrText.trim().length === 0) {
      await trackScanFailure({ ip: clientIP, platform, appVersion, method: 'ocr', reason: 'ocr_failed', imageKb, ocrChars, ...geo });
      return res.status(400).json({
        code: 'OCR_FAILED',
        error: 'OCR failed',
        message: "Couldn't read the text. Try getting the ingredients or menu in focus."
      });
    }

    // Step 2: Analyze with Claude
    const analysis = await analyzeWithClaude(ocrText);

    // Step 3: safety floor — a near-empty read can never come back "safe".
    // Applied before tracking so analytics records the delivered verdict.
    applySafeVerdictFloor(analysis, ocrChars);

    // Increment rate limit counter on success
    incrementRateLimit(clientIP);

    await trackScan({
      ip: clientIP,
      platform,
      appVersion,
      model: CLAUDE_MODEL,
      method: 'ocr',
      mode: analysis.mode,
      verdict: analysis.verdict,
      confidence: analysis.confidence,
      detectedLanguage: analysis.detected_language,
      imageKb,
      ocrChars,
      // Did the label carry a gluten-free claim? Measures the claim rule's
      // effect on the caution share (a flag, never the text).
      gfClaimPresent: detectGlutenFreeClaim(ocrText),
      ...geo,
    });

    return res.status(200).json(analysis);

  } catch (error) {
    console.error('Analysis error:', error);

    if (error.message === 'OCR_EMPTY') {
      await trackScanFailure({ ip: clientIP, platform, appVersion, method: 'ocr', reason: 'ocr_failed', imageKb, ocrChars: 0, ...geo });
      return res.status(400).json({
        code: 'OCR_FAILED',
        error: 'OCR failed',
        message: "Couldn't read the text. Try getting the ingredients or menu in focus."
      });
    }

    if (error.name === 'ClaudeError') {
      console.error('Claude analysis failed:', describeClaudeError(error));
      await trackScanFailure({ ip: clientIP, platform, appVersion, method: 'ocr', reason: 'claude_error', imageKb, ocrChars, ...geo });
      const { status, body } = claudeErrorResponse(error);
      return res.status(status).json(body);
    }

    await trackScanFailure({ ip: clientIP, platform, appVersion, method: 'ocr', reason: 'server_error', imageKb, ocrChars, ...geo });
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Something went wrong. Please try again.'
    });
  }
}

// Generous next to the barcode waterfall's 5s (Vision is doing real OCR work),
// but far below the 60s client budget so a timeout still yields a response.
const VISION_FETCH_TIMEOUT_MS = 10000;

/**
 * Perform OCR using Google Cloud Vision API
 */
async function performOCR(base64Image) {
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;

  if (!apiKey) {
    throw new Error('Google Cloud Vision API key not configured');
  }

  // Time-bound the upstream call (the barcode waterfall's GLUTENORNOT-MOBILE-7
  // lesson): a hung Vision connection otherwise burns the function until
  // Vercel's 300s cap while the client gives up at 60s.
  let response;
  try {
    response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requests: [{
            image: { content: base64Image },
            features: [{ type: 'TEXT_DETECTION' }]
          }]
        }),
        signal: AbortSignal.timeout(VISION_FETCH_TIMEOUT_MS)
      }
    );
  } catch (error) {
    console.error('Vision fetch failed:', error.message);
    throw new Error('OCR_ERROR');
  }

  if (!response.ok) {
    console.error('Vision API error:', response.status);
    throw new Error('OCR_ERROR');
  }

  const data = await response.json();

  // Extract text from response
  const textAnnotations = data.responses?.[0]?.textAnnotations;

  if (!textAnnotations || textAnnotations.length === 0) {
    throw new Error('OCR_EMPTY');
  }

  // First annotation contains the full text
  return textAnnotations[0].description;
}

/**
 * Normalize a mode string to one of the valid values.
 * Returns null for unknown values so inference logic can handle it.
 */
function normalizeMode(mode) {
  if (typeof mode !== 'string') return null;
  const m = mode.toLowerCase().trim();
  if (m === 'menu') return 'menu';
  if (m === 'label') return 'label';
  return null;
}

/**
 * Parse and validate Claude's response
 * Exported for testing
 */
function parseClaudeResponse(content) {
  // Handle empty/null input
  if (!content || content.trim() === '') {
    return {
      verdict: 'caution',
      flagged_ingredients: [],
      allergen_warnings: [],
      explanation: 'Unable to fully analyze the ingredients. Please review manually.',
      confidence: 'low'
    };
  }

  try {
    // Try to extract JSON from the response (Claude might add extra text)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const result = JSON.parse(jsonMatch[0]);

    // Normalize the verdict ("Safe"/"WARNING"/etc.) instead of discarding a
    // complete analysis over casing — same fail-safe mapping the barcode
    // parser uses (anything unrecognized becomes caution).
    result.verdict = normalizeVerdict(result.verdict);

    // Ensure arrays exist
    result.flagged_ingredients = result.flagged_ingredients || [];
    result.allergen_warnings = result.allergen_warnings || [];
    result.explanation = result.explanation || '';
    result.confidence = result.confidence || 'medium';
    // Normalize mode (handles capitalization like "Menu" → "menu")
    result.mode = normalizeMode(result.mode);
    // Infer mode from content if Claude omitted it or returned unknown value
    if (!result.mode && Array.isArray(result.menu_items) && result.menu_items.length > 0) {
      result.mode = 'menu';
    }
    result.mode = result.mode || 'label';

    // Validate and normalize menu_items if present
    if (result.mode === 'menu' && Array.isArray(result.menu_items)) {
      result.menu_items = result.menu_items
        .filter(item => item && item.name)
        .map(item => ({
          ...item,
          verdict: normalizeVerdict(item.verdict),
          notes: item.notes || '',
        }));
    } else if (result.mode === 'menu') {
      result.menu_items = [];
    }

    return result;

  } catch (parseError) {
    // Return a caution verdict if we can't parse
    return {
      verdict: 'caution',
      flagged_ingredients: [],
      allergen_warnings: [],
      explanation: 'Unable to fully analyze the ingredients. Please review manually.',
      confidence: 'low'
    };
  }
}

/**
 * Analyze ingredients with Claude
 */
async function analyzeWithClaude(ocrText) {
  const content = await callClaude({
    maxTokens: 4096, // headroom for the Opus 4.7+ tokenizer (~1–1.35× Sonnet 4.6 counts); menu responses have the least room
    content: `${CLAUDE_PROMPT}\n\n### OCR Text:\n${ocrText}`,
  });

  return parseClaudeResponse(content);
}

// Export internal functions for testing (re-export shared utils + local functions)
export {
  normalizeMode,
  normalizeVerdict,
  applySafeVerdictFloor,
  MIN_OCR_CHARS_FOR_SAFE,
  parseClaudeResponse,
  analyzeWithClaude, // real prompt + callClaude + parse path, for the live evals in tests/api/evals
  detectGlutenFreeClaim,
  performOCR,
  checkRateLimit,
  incrementRateLimit,
  formatTimeRemaining,
  CLAUDE_PROMPT,
  RATE_LIMIT,
  RATE_LIMIT_WINDOW,
  _setRateLimitMap,
  _getRateLimitMap
};
