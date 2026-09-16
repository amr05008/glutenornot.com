/**
 * Explanation assertions shared by the live runners. Kept in a plain module
 * so they can be unit-tested offline against positive AND negative fixtures
 * (Pi grill on PR #29, two rounds: keyword co-occurrence accepted "Labeled
 * gluten-free oats, suitable for people with gluten sensitivity"; a looser
 * second cut still accepted "The oats themselves are covered by the label",
 * "can tolerate oats" and "contain avenin, a natural oat protein" — none of
 * which warns anyone).
 */

// The avenin caveat: a WARNING that some people with celiac disease react to
// / cannot tolerate / are sensitive to OATS THEMSELVES. Every alternative
// requires an adverse relationship between the person and the oats; bare
// "oats themselves", affirmative "tolerate", or the word "avenin" alone do
// not count.
const OATS = String.raw`(?:the\s+|these\s+|those\s+)?oats?\b`;
const CLAUSE = String.raw`[^.;!?]{0,60}?`;
const ADVERSE = String.raw`(?:react\w*|sensitiv\w*|intoleran\w*|reaction|symptom\w*|trigger\w*|bother\w*|problem\w*|issue\w*|flare\w*|affect\w*)`;
const NOT_TOLERATE = String.raw`(?:don't|do not|cannot|can't|may not|might not|not|never)\s+(?:always\s+|fully\s+|well\s+)?tolerat\w*`;
const OATS_CAVEAT_PATTERN = new RegExp(
  [
    // "react to oats", "sensitive to the oats", "intolerant of oats", "reaction to oats", "symptoms from oats"
    String.raw`${ADVERSE}\s+(?:to|of|from|with)\s+${OATS}`,
    // "cannot tolerate the oats", "don't tolerate oats"
    String.raw`${NOT_TOLERATE}\s+${OATS}`,
    // "oats themselves can trigger a reaction", "oats themselves bother some people"
    String.raw`\boats?\s+(?:themselves|itself)\b${CLAUSE}(?:${ADVERSE}|${NOT_TOLERATE})`,
    // "oats can trigger a reaction", "oats cause symptoms", "oats are an issue for some"
    String.raw`\boats?\b${CLAUSE}(?:trigger|cause|provoke)\w*\s+(?:a\s+|an\s+)?(?:reaction|symptoms|response|flare)`,
    String.raw`\boats?\b${CLAUSE}(?:issue|problem|concern|trigger)s?\s+for\b`,
    // the protein, by name — only next to an adverse relationship
    String.raw`avenin${CLAUSE}(?:${ADVERSE}|${NOT_TOLERATE})`,
    String.raw`(?:${ADVERSE}|${NOT_TOLERATE})${CLAUSE}avenin`,
  ].join('|'),
  'i'
);

export function hasOatsCaveat(text) {
  return typeof text === 'string' && OATS_CAVEAT_PATTERN.test(text);
}
