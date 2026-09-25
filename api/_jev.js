/**
 * TypeSafe's Jev: the barcode fast path's first reader (decision 007,
 * plans/jev-fast-path-2026-09-24.md).
 *
 * Jev answers narrow yes/no questions about the ingredient text with a
 * probability each; the rule in api/barcode.js (`decideFastPath`) turns those
 * into a verdict only when it is sure, and everything else falls through to
 * Claude, which runs in parallel on every scan.
 *
 * The questions and thresholds are the barcode bake-off's frozen E2 v2
 * (jev-sandbox experiments/07-barcode-bakeoff/questions-v2.ts), graded on 796
 * Open Food Facts records none of its versions had seen. Port them verbatim —
 * a reworded question is an ungraded one.
 *
 * Called with plain fetch, like callClaude, not the SDK (F7):
 * - the base URL is hardcoded (the SDK reads TYPESAFE_BASE_URL from the
 *   environment, which could send the bearer key elsewhere);
 * - the model is pinned (the SDK default, jev-latest, moves);
 * - one attempt with an 800 ms budget: Claude is already running, so any
 *   failure just means Claude answers.
 * Only the ingredient text is sent — never the product name, the barcode or
 * anything from the client.
 *
 * NOT MEDICAL ADVICE: the questions measure what a label lists; the rule and
 * the Claude audit decide what the app says.
 */

const JEV_API_URL = 'https://api.typesafe.ai/v1/systemone';
const JEV_MODEL = 'jev-1.13.0';
const JEV_TIMEOUT_MS = 800;

// F3: what JEV_MODE serves. `off` = today's path, Jev is never called.
// `shadow` = Jev is asked and audited, never served. `unsafe` = a settled
// unsafe is served (a wrong one can't hurt anyone), a settled safe is only
// audited. `full` = both are served.
const JEV_MODES = ['off', 'shadow', 'unsafe', 'full'];

/** A gluten-source question at or above this counts as present (experiment 03). */
const SOURCE_AT = 0.5;
/** `safe` needs every danger question below this (experiment 03). */
const CLEAR_BELOW = 0.2;
/** `safe` needs both list-quality questions at or above this (v2). */
const LIST_OK_AT = 0.8;

// The SDK's noul(): a yes/no question; its optional criteria are omitted.
const noul = (instructions) => ({ type: 'noul', instructions });
const LIST = " `ingredients` is a food product's ingredient list and may be in any language.";
// The list-quality questions must not presuppose that the text is a list.
const FIELD = " `ingredients` is the text of a food database's ingredients field and may be in any language.";

// Key order is the graded payload's order (pinned by tests/api/jev.test.js).
const JEV_QUESTIONS = {
  // v2: semolina counts only when it's wheat semolina ("semoule de riz" scored 0.65 in v1).
  wheat: noul(
    'Does the list include wheat or a wheat-derived ingredient, including spelt, kamut, durum, farro, triticale, or semolina made from wheat? Semolina made from rice, corn or maize does not count.' + LIST
  ),
  barley: noul('Does the list include barley or a barley-derived ingredient, including malt, malt extract, malt syrup or malt vinegar?' + LIST),
  rye: noul('Does the list include rye or a rye-derived ingredient?' + LIST),
  other_source: noul(
    "Does the list name gluten itself, seitan, brewer's yeast, or another gluten-containing ingredient not made from wheat, barley, rye or oats?" + LIST
  ),
  oats: noul('Does the list include oats that are not described as gluten-free?' + LIST),
  may_contain: noul(
    'Does the list carry a warning that the product may contain, or is produced alongside, gluten or a gluten-containing cereal?' + LIST
  ),
  // One per decision-006 `undeclared_source` case.
  meat_poultry: noul(
    'Judging from the list, is this product mainly or partly made of meat or poultry, such as a sausage, a soup or meal with chicken, or chili with beef?' + LIST
  ),
  soy_sauce: noul('Does the list include soy sauce, tamari or shoyu that is not described as gluten-free?' + LIST),
  yeast_extract: noul('Does the list include yeast extract or autolyzed yeast whose source is not stated?' + LIST),
  // v2: v1 settled `safe` on nutrition text, medicine instructions, garbled
  // OCR and a list cut off mid-word. Decision 006 calls those `incomplete`.
  is_ingredient_list: noul(
    "Is this text a food product's list of ingredients, rather than nutrition figures, directions for use, medicine instructions, marketing text or other unrelated text?" + FIELD
  ),
  looks_complete: noul(
    'Does the ingredient list appear complete, ending where a list normally ends, rather than stopping mid-word, mid-ingredient or inside an unclosed bracket?' + FIELD
  ),
};

const JEV_SOURCES = ['wheat', 'barley', 'rye', 'other_source'];
/** Questions whose high score is a reason not to call the product safe. */
const JEV_DANGER = Object.keys(JEV_QUESTIONS).filter((k) => k !== 'is_ingredient_list' && k !== 'looks_complete');

/** JEV_MODE, normalized. Anything unrecognized is `off`, so a typo never serves Jev. */
function jevMode(raw = process.env.JEV_MODE) {
  const v = String(raw ?? '').trim().toLowerCase();
  return JEV_MODES.includes(v) ? v : 'off';
}

/**
 * The /v1/systemone request. The body is byte-identical to what
 * @typesafe-ai/sdk 0.6.0's systemOne() sends for these questions
 * (tests/api/jev.test.js pins it); the headers are our own (no SDK
 * User-Agent or X-TypeSafe-* headers).
 */
function buildJevRequest(ingredients, apiKey) {
  return {
    url: JEV_API_URL,
    init: {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'GlutenOrNot/1.0 (https://glutenornot.com)',
      },
      body: JSON.stringify({ model: JEV_MODEL, state: { ingredients }, questions: JEV_QUESTIONS }),
    },
  };
}

const isProbability = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

/**
 * Ask Jev the questions about one ingredient text. Never throws.
 *
 * Returns `{ outcome: 'ok', scores, ms }` with a probability per question, or
 * `{ outcome: 'timeout' | 'error', ms }`. Anything short of a complete, valid
 * answer from the pinned model is an error: the caller falls through to Claude.
 * Logs a status only — never the key, the text or the response body.
 */
async function askJev(
  ingredients,
  { fetchImpl = fetch, timeoutMs = JEV_TIMEOUT_MS, apiKey = process.env.TYPESAFE_API_KEY } = {}
) {
  const started = Date.now();
  const ms = () => Date.now() - started;
  const key = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (!key) return { outcome: 'error', ms: 0 };

  const { url, init } = buildJevRequest(String(ingredients ?? '').trim(), key);
  // One signal covers the connection and the body read.
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal });
    if (!response.ok) {
      console.warn('Jev HTTP error:', response.status);
      return { outcome: 'error', ms: ms() };
    }
    const data = await response.json();
    if (data?.model !== JEV_MODEL) {
      console.warn('Jev answered from an unexpected model');
      return { outcome: 'error', ms: ms() };
    }
    const scores = {};
    for (const name of Object.keys(JEV_QUESTIONS)) {
      const v = data.answers?.[name]?.noul;
      if (!isProbability(v)) {
        console.warn('Jev answer missing or malformed:', name);
        return { outcome: 'error', ms: ms() };
      }
      scores[name] = v;
    }
    return { outcome: 'ok', scores, ms: ms() };
  } catch (err) {
    if (signal.aborted) return { outcome: 'timeout', ms: ms() };
    console.warn('Jev request failed:', err?.name || 'error');
    return { outcome: 'error', ms: ms() };
  }
}

export {
  JEV_API_URL,
  JEV_MODEL,
  JEV_TIMEOUT_MS,
  JEV_MODES,
  JEV_QUESTIONS,
  JEV_SOURCES,
  JEV_DANGER,
  SOURCE_AT,
  CLEAR_BELOW,
  LIST_OK_AT,
  jevMode,
  buildJevRequest,
  askJev,
};
