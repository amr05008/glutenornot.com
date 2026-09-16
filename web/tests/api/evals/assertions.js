/**
 * Explanation assertions shared by the live runners. Kept in a plain module
 * so they can be unit-tested offline against positive AND negative fixtures
 * (Pi grill on PR #29: two independent keyword matches — "oats" anywhere plus
 * "sensitiv" anywhere — accepted "Labeled gluten-free oats, suitable for
 * people with gluten sensitivity", which is reassurance, not the caveat).
 */

// The avenin caveat: a statement that some people with celiac disease react
// to / cannot tolerate / are sensitive to OATS THEMSELVES. The reaction has
// to be about the oats — "gluten sensitivity" near the word "oats" is not it.
const OATS = String.raw`(?:the\s+|these\s+|those\s+)?oats?\b`;
const OATS_CAVEAT_PATTERN = new RegExp(
  [
    // "react to oats", "sensitive to the oats", "intolerant of oats", "reaction to oats"
    String.raw`(?:react\w*|sensitiv\w*|intoleran\w*|reaction)\s+(?:to|of)\s+${OATS}`,
    // "cannot tolerate the oats", "don't tolerate oats"
    String.raw`tolerat\w*\s+${OATS}`,
    // "oats themselves", "the oats itself"
    String.raw`\boats?\s+(?:themselves|itself)\b`,
    // "oats can trigger a reaction", "oats cause symptoms"
    String.raw`\boats?\b[^.;!?]{0,40}?(?:trigger|cause|provoke)\w*\s+(?:a\s+|an\s+)?(?:reaction|symptoms|response)`,
    // the protein, by name
    String.raw`avenin`,
  ].join('|'),
  'i'
);

export function hasOatsCaveat(text) {
  return typeof text === 'string' && OATS_CAVEAT_PATTERN.test(text);
}
