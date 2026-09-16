/**
 * Explanation assertions shared by the live runners. Kept in a plain module
 * so they can be unit-tested offline against positive AND negative fixtures.
 *
 * Pi grill on PR #29, three rounds: every regex that tried to approximate
 * "warns that some people react to oats" was beaten by reassurance or by
 * negation ("suitable for people with gluten sensitivity", "the oats
 * themselves are covered", "do not cause symptoms", "no reaction to oats").
 * So the prompts now prescribe ONE exact caveat sentence and the gate asserts
 * that sentence, not its meaning.
 */

// Must match the sentence prescribed in api/analyze.js and api/barcode.js
// ("end the explanation with this exact sentence"). Keep the three in sync.
export const OATS_CAVEAT_SENTENCE =
  'Heads-up: a small share of people with celiac disease react to oats themselves.';

// Tolerate only what a JSON round-trip or typography could change: case,
// whitespace runs, curly vs straight punctuation, and a missing final period.
function normalize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}
const NEEDLE = normalize(OATS_CAVEAT_SENTENCE).replace(/\.$/, '');

export function hasOatsCaveat(text) {
  return typeof text === 'string' && normalize(text).includes(NEEDLE);
}
