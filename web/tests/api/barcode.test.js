import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Replace the analytics senders with spies so handler tests can assert on what
// gets tracked without ever talking to PostHog. Everything else stays real.
vi.mock('../../../api/_analytics.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, trackScan: vi.fn(), trackScanFailure: vi.fn() };
});

import handler, {
  CLAUDE_PROMPT,
  parseClaudeResponse,
  analyzeWithClaude,
  buildIngredientContext,
  assessGlutenSignal,
  hasGlutenFreeLabelTag,
  adverseGlutenLabels,
  unrecognizedGlutenLabels,
  isGlutenFamilyTag,
  lookupOpenFoodFacts,
  lookupUSDA,
  lookupNutritionix,
  lookupUpcItemDb,
} from '../../../api/barcode.js';
import { trackScan, trackScanFailure } from '../../../api/_analytics.js';
import {
  checkRateLimit,
  incrementRateLimit,
  formatTimeRemaining,
  _setRateLimitMap,
  _getRateLimitMap,
} from '../../../api/_utils.js';

describe('parseClaudeResponse (barcode)', () => {
  it('parses valid safe response', () => {
    const input = JSON.stringify({
      verdict: 'safe',
      flagged_ingredients: [],
      allergen_warnings: [],
      explanation: 'No gluten ingredients found.',
      confidence: 'high',
    });
    const result = parseClaudeResponse(input);
    expect(result.verdict).toBe('safe');
    expect(result.mode).toBe('label');
    expect(result.confidence).toBe('high');
  });

  it('parses valid unsafe response', () => {
    const input = JSON.stringify({
      verdict: 'unsafe',
      flagged_ingredients: ['wheat flour'],
      allergen_warnings: ['Contains wheat'],
      explanation: 'Contains wheat flour.',
      confidence: 'high',
    });
    const result = parseClaudeResponse(input);
    expect(result.verdict).toBe('unsafe');
    expect(result.flagged_ingredients).toEqual(['wheat flour']);
  });

  it('normalizes invalid verdict to caution', () => {
    const input = JSON.stringify({
      verdict: 'maybe',
      flagged_ingredients: [],
      allergen_warnings: [],
      explanation: 'Not sure.',
      confidence: 'low',
    });
    const result = parseClaudeResponse(input);
    expect(result.verdict).toBe('caution');
  });

  it('falls back to caution for empty input', () => {
    const result = parseClaudeResponse('');
    expect(result.verdict).toBe('caution');
    expect(result.confidence).toBe('low');
    expect(result.caution_reason).toBe('other');
  });

  it('falls back to caution for malformed JSON', () => {
    const result = parseClaudeResponse('not json at all');
    expect(result.verdict).toBe('caution');
    expect(result.confidence).toBe('low');
    expect(result.caution_reason).toBe('other');
  });

  it('normalizes caution_reason on the barcode path too', () => {
    expect(parseClaudeResponse(JSON.stringify({ verdict: 'caution', caution_reason: 'may_contain' })).caution_reason).toBe('may_contain');
    expect(parseClaudeResponse(JSON.stringify({ verdict: 'caution' })).caution_reason).toBe('other');
    expect(parseClaudeResponse(JSON.stringify({ verdict: 'unsafe', caution_reason: 'oats' }))).not.toHaveProperty('caution_reason');
  });

  it('extracts JSON surrounded by text', () => {
    const input = 'Here is my analysis:\n' + JSON.stringify({
      verdict: 'safe',
      flagged_ingredients: [],
      allergen_warnings: [],
      explanation: 'All clear.',
      confidence: 'high',
    }) + '\nHope that helps!';
    const result = parseClaudeResponse(input);
    expect(result.verdict).toBe('safe');
  });

  it('always sets mode to label', () => {
    const input = JSON.stringify({
      mode: 'menu',
      verdict: 'safe',
      flagged_ingredients: [],
      allergen_warnings: [],
      explanation: 'All clear.',
      confidence: 'high',
    });
    const result = parseClaudeResponse(input);
    expect(result.mode).toBe('label');
  });
});

describe('buildIngredientContext', () => {
  it('builds context with all fields', () => {
    const product = {
      product_name: 'Test Cookies',
      ingredients_text: 'Sugar, flour, butter',
      allergens_tags: ['en:gluten', 'en:milk'],
      traces_tags: ['en:nuts'],
      labels_tags: ['en:no-gluten'],
    };
    const context = buildIngredientContext(product);
    expect(context).toContain('Product: Test Cookies');
    expect(context).toContain('Ingredients: Sugar, flour, butter');
    expect(context).toContain('Allergens: gluten, milk');
    expect(context).toContain('Cross-contamination traces: nuts');
    expect(context).toContain('Certifications: no-gluten');
  });

  it('returns context with only ingredients', () => {
    const product = {
      product_name: 'Simple Product',
      ingredients_text: 'Water, sugar',
    };
    const context = buildIngredientContext(product);
    expect(context).toContain('Product: Simple Product');
    expect(context).toContain('Ingredients: Water, sugar');
  });

  it('returns context with only allergen tags', () => {
    const product = {
      product_name: 'Mystery Product',
      allergens_tags: ['en:wheat'],
    };
    const context = buildIngredientContext(product);
    expect(context).toContain('Allergens: wheat');
  });

  it('returns null when no ingredients or allergens', () => {
    const product = {
      product_name: 'Empty Product',
    };
    const context = buildIngredientContext(product);
    expect(context).toBeNull();
  });

  it('returns null when allergens array is empty and no ingredients', () => {
    const product = {
      product_name: 'Empty Product',
      allergens_tags: [],
    };
    const context = buildIngredientContext(product);
    expect(context).toBeNull();
  });

  it('skips non-gluten labels', () => {
    const product = {
      ingredients_text: 'Water',
      labels_tags: ['en:organic', 'en:vegan'],
    };
    const context = buildIngredientContext(product);
    expect(context).not.toContain('Certifications');
  });

  // Decision 004 + /grill 2026-09-16: the prompt reads "Certifications:" as
  // the package's whole-product gluten-free claim, so only allowlisted OFF
  // claim tags may land there. `en:contains-gluten` is a real taxonomy tag
  // and a free-text tag canonicalizes to whatever was typed.
  it('routes en:contains-gluten to its own line, never under Certifications', () => {
    const context = buildIngredientContext({
      ingredients_text: 'whole grain oats, honey',
      allergens_tags: ['en:gluten'],
      labels_tags: ['en:contains-gluten'],
    });
    expect(context).toContain('Package states: contains gluten');
    expect(context).not.toContain('Certifications');
  });

  // Pi grill on PR #29: adverse free-text tags are evidence gluten is present
  // and must reach Claude under the "Package states:" heading, not vanish.
  it('surfaces adverse free-text gluten tags under Package states, alongside a claim', () => {
    const context = buildIngredientContext({
      ingredients_text: 'rice flour, sunflower seeds, flaxseed, sea salt',
      labels_tags: ['en:no-gluten', 'en:very-low-gluten', 'en:gluten-reduced', 'en:not-gluten-free', 'en:may-contain-gluten'],
    });
    expect(context).toContain('Certifications: no-gluten');
    expect(context).toContain('Package states: very low gluten; gluten reduced; not gluten free; may contain gluten');
    expect(adverseGlutenLabels(['en:contains-gluten', 'en:vegan'])).toEqual(['contains gluten']);
    expect(adverseGlutenLabels(['en:no-gluten', 'en:gluten-free-oats'])).toEqual([]);
    expect(adverseGlutenLabels(null)).toEqual([]);
  });

  it('surfaces an unrecognized gluten-related free-text tag under an unverified heading, never as a claim', () => {
    const context = buildIngredientContext({
      ingredients_text: 'gluten-free oats, honey, natural flavors',
      labels_tags: ['en:gluten-free-oats', 'en:low-gluten', 'en:not-suitable-for-celiacs', 'en:gluten-containing'],
    });
    expect(context).not.toContain('Certifications');
    expect(context).toContain('Package states: low gluten');
    expect(context).toContain(
      'Other gluten-related labels (unverified free text, NOT a claim): gluten free oats; not suitable for celiacs; gluten containing'
    );
    expect(unrecognizedGlutenLabels(['en:no-gluten', 'en:contains-gluten', 'en:vegan'])).toEqual([]);
    expect(unrecognizedGlutenLabels(null)).toEqual([]);
  });

  it('lists certification-body tags (children of no-gluten in the OFF taxonomy) under Certifications', () => {
    const context = buildIngredientContext({
      ingredients_text: 'rolled oats, honey',
      labels_tags: ['en:gfco-gluten-free', 'en:no-gluten', 'en:crossed-grain-trademark'],
    });
    expect(context).toContain('Certifications: gfco-gluten-free, no-gluten, crossed-grain-trademark');
  });
});

describe('hasGlutenFreeLabelTag', () => {
  it('matches the allowlisted claim tags only', () => {
    expect(hasGlutenFreeLabelTag(['en:no-gluten'])).toBe(true);
    expect(hasGlutenFreeLabelTag(['en:vegan', 'en:coeliac-uk'])).toBe(true);
    expect(hasGlutenFreeLabelTag(['en:contains-gluten'])).toBe(false);
    expect(hasGlutenFreeLabelTag(['en:gluten-free-oats'])).toBe(false);
    expect(hasGlutenFreeLabelTag([])).toBe(false);
    expect(hasGlutenFreeLabelTag(null)).toBe(false);
  });
});

// Decision 004 (2026-09-16): the barcode path was left on the pre-003 rubric
// (toggle T5), so a product whose database record said "No gluten" label +
// "gluten free rolled oats" still came back caution. The claim block is
// ported here and, as on the OCR path, covers oats.
describe('CLAUDE_PROMPT gluten-free label claims (barcode path)', () => {
  function claimsBlock() {
    const [, rest = ''] = CLAUDE_PROMPT.split('### Gluten-free label claims');
    return rest.split('\n### ')[0];
  }

  it('has a dedicated gluten-free label claims block', () => {
    expect(claimsBlock()).not.toBe('');
  });

  it('treats the Certifications line as the whole-product claim', () => {
    expect(claimsBlock()).toMatch(/Certifications:/);
    expect(claimsBlock()).toMatch(/do NOT lower the\s+verdict/);
    expect(claimsBlock()).toMatch(/Return "safe"/);
  });

  it('lets the claim cover oats, but not a listed gluten source or a gluten trace', () => {
    expect(claimsBlock()).toMatch(/covers oats/i);
    expect(claimsBlock()).toMatch(/A listed gluten source/);
    expect(claimsBlock()).toMatch(/label and the ingredient list\s+disagree/);
    expect(claimsBlock()).toMatch(/traces/i);
  });

  it('no longer flags all oats unconditionally', () => {
    expect(CLAUDE_PROMPT).not.toMatch(/Flag ALL oats as "caution" unless explicitly certified/);
    expect(CLAUDE_PROMPT).toMatch(/oats without a gluten-free label or certification/i);
  });
});

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

  // 2026-09-23 live eval (case B9): "gluten-free rolled oats, …, whole grain
  // oats" came back safe — "the list itself calls the oats gluten-free" /
  // "clears the oats only" let one labeled oat ingredient clear every oat.
  it('scopes an ingredient-level claim to the ingredient it is written on (oats, soy sauce)', () => {
    expect(CLAUDE_PROMPT).toContain('Judge each oat ingredient on its own: "gluten-free rolled oats, oat flour" still lists plain oat flour.');
    expect(CLAUDE_PROMPT).toMatch(/It clears only the ingredient it is\s+written on/);
    expect(CLAUDE_PROMPT).toMatch(/a plain "soy sauce" elsewhere stays "caution"/);
    expect(CLAUDE_PROMPT).not.toContain('It clears the oats only');
    expect(CLAUDE_PROMPT).not.toContain('calls the oats gluten-free');
  });

  // PR #32 grill: the same law wording, EU-exemption scope and meat-product
  // reach as the photo prompt (same rule on both paths).
  it('carries the photo prompt\'s "Contains:" statement, named-wheat-source and meat-product wording', () => {
    expect(CLAUDE_PROMPT).toContain('in the ingredient list, or in a "Contains:" statement right after it');
    expect(CLAUDE_PROMPT).toContain('no "Contains"/allergen statement names wheat, barley, rye, or gluten');
    expect(CLAUDE_PROMPT).toContain('One labeled with its wheat source ("glucose syrup (wheat)", "wheat maltodextrin") names wheat');
    expect(CLAUDE_PROMPT).toMatch(/- flavorings, spices, seasoning, or hydrolyzed protein in a meat or poultry product[^\n]*soups, broths, bouillon, chili, or frozen meals made with meat or poultry/);
    expect(CLAUDE_PROMPT).toContain("    - yeast extract (or autolyzed yeast) of unstated source, in any product — it can come from brewer's yeast, which is barley");
    expect(CLAUDE_PROMPT).toContain('Yeast extract is not on this list');
    expect(CLAUDE_PROMPT).toContain("which is barley (a gluten-free label covers it, like any `undeclared_source`)");
  });

  it('says a self-contradicting record is caution/conflict, never safe', () => {
    expect(CLAUDE_PROMPT).toContain('contradicts itself: return "caution" (caution_reason "conflict") with low confidence — never "safe", and not "unsafe"');
  });

  it('names malt vinegar as hidden gluten, like the photo prompt', () => {
    expect(CLAUDE_PROMPT).toContain('Common hidden gluten: soy sauce, malt vinegar, malt flavoring, barley malt syrup');
  });
});

describe('assessGlutenSignal', () => {
  // Regression: KIND Healthy Grains Peanut Butter (barcode 602652171826).
  // OFF tags `en:gluten` as an allergen (auto-derived from oats) AND `en:no-gluten`
  // as a label, while the ingredients contain no wheat/barley/rye. The barcode path
  // wrongly returned "Unsafe" by trusting the allergen tag.
  const KIND = {
    ingredients_text:
      'whole grain blend (oats, brown rice, buckwheat, millet, amaranth, quinoa), dried cane syrup, soy crisp (soy protein isolate, tapioca starch, calcium carbonate), peanut butter, peanut oil, tapioca syrup, peanuts, peanut flour, brown rice syrup, salt, vitamin e (to maintain freshness),',
    allergens_tags: ['en:gluten', 'en:peanuts', 'en:soybeans'],
    labels_tags: ['en:no-gluten', 'en:non-gmo-project'],
  };

  it('flags a gluten allergen tag not corroborated by the ingredient list', () => {
    const note = assessGlutenSignal(KIND);
    expect(note).toBeTruthy();
    expect(note).toMatch(/not corroborated/i);
    expect(note).toMatch(/do not mark .*unsafe/i);
  });

  // Decision 004 (2026-09-16): a gluten tag with no gluten grain in the list,
  // next to a gluten-free label, is the auto-derived-from-oats pattern. The
  // label is the manufacturer's regulated claim and wins; the note used to
  // tell Claude to "lean caution with low confidence" on the conflict, which
  // kept a labeled-GF oat product at caution on the barcode path.
  it('tells Claude the gluten-free label beats an uncorroborated gluten tag when oats are listed', () => {
    const note = assessGlutenSignal(KIND);
    expect(note).toMatch(/gluten-free label/i);
    expect(note).toMatch(/lists oats/i);
    expect(note).toMatch(/label is the manufacturer's regulated claim and wins/i);
    expect(note).not.toMatch(/lean caution with low confidence/i);
  });

  // /grill 2026-09-16 (controlling finding): without oats in the list the tag
  // has no innocent explanation. Label + gluten tag + no grain + no oats is a
  // self-contradicting record and must not be talked into safe.
  it('keeps the contradiction → caution wording when the list has no oats to explain the tag', () => {
    const note = assessGlutenSignal({
      ingredients_text: 'sugar, glucose syrup, natural flavouring, yeast extract, salt',
      allergens_tags: ['en:gluten'],
      labels_tags: ['en:no-gluten'],
    });
    expect(note).toMatch(/contradicts itself/i);
    expect(note).toMatch(/lean caution with low confidence/i);
    expect(note).not.toMatch(/label is the manufacturer's regulated claim and wins/i);
    // PR #32 live run: with decision 006 clearing the rest of the list, "lean
    // caution" alone let the label talk B7 into safe. The label does not settle
    // a contradiction in its own record.
    expect(note).toMatch(/Never return "safe" on this record/);
    expect(note).toMatch(/caution_reason "conflict"/);
  });

  // PR #32 grill (decision 006): with natural flavors and modified starch no
  // longer a reason, "base the verdict on the actual ingredients" talked an
  // unexplained gluten tag into safe. On an unlabeled record with nothing in
  // the list to explain it, the tag may be the package's "Contains: wheat"
  // (FALCPA's alternative to naming wheat inside the starch or flavor).
  it('never lets an unexplained gluten tag on an unlabeled record read as safe', () => {
    const note = assessGlutenSignal({
      ingredients_text: 'corn syrup, sugar, modified food starch, salt, natural and artificial flavor',
      allergens_tags: ['en:gluten'],
      labels_tags: [],
    });
    expect(note).toMatch(/"Contains: wheat"/);
    expect(note).toMatch(/Never return "safe"/);
    expect(note).toMatch(/caution_reason "conflict"/);
    // PR #32 grill round 2: the grain check covers English + common European
    // languages only; a Polish "mąka pszenna" list must stay unsafe, not drop to caution.
    expect(note).toMatch(/If the list names a gluten grain in any language, return "unsafe"/);

    // Oats cannot explain a wheat-specific tag either.
    const wheatTag = assessGlutenSignal({ ingredients_text: 'whole grain oats, honey', allergens_tags: ['en:wheat'], labels_tags: [] });
    expect(wheatTag).toMatch(/Never return "safe"/);

    // A generic tag beside oats is the auto-derived pattern; the oats rule handles it.
    const oats = assessGlutenSignal({ ingredients_text: 'whole grain oats, honey', allergens_tags: ['en:gluten'], labels_tags: [] });
    expect(oats).not.toMatch(/Never return "safe"/);
  });

  // PR #32 grill round 2: B7's shape plus unrecognized label text had no
  // never-safe line (the B7 fix covered only the plain-label branch).
  it('keeps a labeled record with unrecognized gluten text and no oats at caution/conflict', () => {
    const note = assessGlutenSignal({
      ingredients_text: 'sugar, glucose syrup, natural flavouring, citric acid, salt',
      allergens_tags: ['en:gluten'],
      labels_tags: ['en:no-gluten', 'en:gluten-free-certified'],
    });
    expect(note).toMatch(/With no oats listed, the record contradicts itself/);
    expect(note).toMatch(/Never return "safe" on this record/);

    // Round 3: the same branch with oats listed is B15, decision 004's labeled-oats
    // payoff shape — it must not be told "never safe".
    const b15 = assessGlutenSignal({
      ingredients_text: 'gluten-free rolled oats, honey, brown sugar, sunflower oil, natural flavor, sea salt.',
      allergens_tags: ['en:gluten'],
      labels_tags: ['en:no-gluten', 'en:gluten-free-oats'],
    });
    expect(b15).not.toMatch(/Never return "safe"/);
  });

  it('recognizes oats in the local language for the label-wins note', () => {
    const note = assessGlutenSignal({
      ingredients_text: 'copos de avena integral, miel, sal',
      allergens_tags: ['en:gluten'],
      labels_tags: ['en:no-gluten'],
    });
    expect(note).toMatch(/lists oats/i);
  });

  it('lets a gluten tag stand when the package itself says it contains gluten', () => {
    const note = assessGlutenSignal({
      ingredients_text: 'whole grain oats, honey',
      allergens_tags: ['en:gluten'],
      labels_tags: ['en:contains-gluten'],
    });
    expect(note).toBeNull();
  });

  // Pi grill on PR #29: hasGlutenAllergen includes en:wheat, and oats cannot
  // explain a wheat-specific tag — the label-wins reading must not fire.
  it('does not let the label win over a wheat-specific tag, even with oats listed', () => {
    const note = assessGlutenSignal({
      ingredients_text: 'whole grain rolled oats, honey, sea salt',
      allergens_tags: ['en:wheat'],
      labels_tags: ['en:no-gluten'],
    });
    expect(note).toMatch(/specific grain \(wheat/i);
    expect(note).toMatch(/lean caution with low confidence/i);
    expect(note).toMatch(/Never return "safe" on this record/);
    expect(note).not.toMatch(/regulated claim and wins/i);

    const both = assessGlutenSignal({
      ingredients_text: 'whole grain rolled oats, honey, sea salt',
      allergens_tags: ['en:gluten', 'en:wheat'],
      labels_tags: ['en:no-gluten'],
    });
    expect(both).not.toMatch(/regulated claim and wins/i);
  });

  // Pi re-grill on PR #29: the classifier must cover barley/rye too, and
  // unrecognized gluten-related label text must block the label-wins reading
  // (this layer cannot tell "not suitable for celiacs" from "gluten-free oats").
  it('treats barley and rye tags as grain-specific (no label-wins) and shares the classifier with detection', () => {
    for (const tag of ['en:barley', 'en:rye']) {
      const note = assessGlutenSignal({
        ingredients_text: 'whole grain rolled oats, honey, sea salt',
        allergens_tags: ['en:gluten', tag],
        labels_tags: ['en:no-gluten'],
      });
      expect(note, tag).toMatch(/specific grain/i);
      expect(note, tag).not.toMatch(/regulated claim and wins/i);
      expect(isGlutenFamilyTag(tag)).toBe(true);
    }
    expect(isGlutenFamilyTag('en:peanuts')).toBe(false);
  });

  it('withholds label-wins when an unrecognized gluten-related label is present, and points Claude at it', () => {
    const note = assessGlutenSignal({
      ingredients_text: 'whole grain rolled oats, honey, sea salt',
      allergens_tags: ['en:gluten'],
      labels_tags: ['en:no-gluten', 'en:not-suitable-for-celiacs'],
    });
    expect(note).toMatch(/unrecognized gluten-related label text/i);
    expect(note).toMatch(/never "safe"/);
    expect(note).not.toMatch(/regulated claim and wins/i);
  });

  it('lets a gluten tag stand when a free-text adverse label (very low gluten) is present', () => {
    const note = assessGlutenSignal({
      ingredients_text: 'rice flour, oats',
      allergens_tags: ['en:gluten'],
      labels_tags: ['en:no-gluten', 'en:very-low-gluten'],
    });
    expect(note).toBeNull();
  });

  it('does not treat a free-text gluten-free-ish tag as the label', () => {
    const note = assessGlutenSignal({
      ingredients_text: 'gluten-free oats, honey, natural flavors',
      allergens_tags: ['en:gluten'],
      labels_tags: ['en:gluten-free-oats'],
    });
    expect(note).not.toMatch(/gluten-free label/i);
  });

  it('returns null when a gluten allergen tag IS corroborated by ingredients', () => {
    const note = assessGlutenSignal({
      ingredients_text: 'Enriched wheat flour, sugar, butter',
      allergens_tags: ['en:gluten'],
    });
    expect(note).toBeNull();
  });

  it('returns null when there is no gluten allergen tag', () => {
    const note = assessGlutenSignal({
      ingredients_text: 'oats, brown rice, salt',
      allergens_tags: ['en:peanuts'],
    });
    expect(note).toBeNull();
  });

  it('does not flag when ingredient data is absent (tag cannot be disproven)', () => {
    const note = assessGlutenSignal({
      allergens_tags: ['en:gluten'],
    });
    expect(note).toBeNull();
  });
});

describe('assessGlutenSignal — non-English ingredient lists', () => {
  // Regression: Prince biscuits (OFF 7622210449283). Open Food Facts returns
  // ingredients in the product's local language, so a French wheat product
  // ("Farine de blé 34,8%") looked "uncorroborated" to the English-only grain
  // pattern and the note pushed Claude AWAY from unsafe on a wheat product.
  it('treats French blé as corroborating the gluten tag (accented word — \\b breaks on é)', () => {
    const note = assessGlutenSignal({
      ingredients_text:
        'Farine de blé 34,8%, sucre, huiles végétales (palme, colza), chocolat 8,4% (sucre, pâte de cacao, beurre de cacao), sel',
      allergens_tags: ['en:gluten'],
    });
    expect(note).toBeNull();
  });

  it('treats Spanish trigo as corroborating the gluten tag', () => {
    const note = assessGlutenSignal({
      ingredients_text: 'Harina de trigo, azúcar, aceite de girasol, sal',
      allergens_tags: ['en:gluten'],
    });
    expect(note).toBeNull();
  });

  it('treats a Dutch tarwe compound (tarwebloem) as corroborating the gluten tag', () => {
    const note = assessGlutenSignal({
      ingredients_text: 'Tarwebloem, suiker, plantaardige oliën, zout',
      allergens_tags: ['en:gluten'],
    });
    expect(note).toBeNull();
  });

  it('treats German Weizenmehl as corroborating the gluten tag', () => {
    const note = assessGlutenSignal({
      ingredients_text: 'Weizenmehl, Zucker, Palmöl, Salz',
      allergens_tags: ['en:gluten'],
    });
    expect(note).toBeNull();
  });

  // /grill re-pass 2026-09-16: OATS_PATTERN knows Portuguese `aveia`, so the
  // grain pattern must know Portuguese grains too — otherwise a wrong crowd
  // label on "aveia, malte de cevada" would enable the label-wins note with
  // nothing deterministic to block it.
  it('treats Portuguese cevada / centeio / malte as corroborating the gluten tag', () => {
    for (const text of ['Aveia, malte de cevada, açúcar', 'Farinha de centeio, sal', 'Extrato de malte, água']) {
      expect(assessGlutenSignal({ ingredients_text: text, allergens_tags: ['en:gluten'], labels_tags: ['en:no-gluten'] })).toBeNull();
    }
  });

  it('treats Catalan blat as corroborating the gluten tag', () => {
    const note = assessGlutenSignal({
      ingredients_text: 'Blat integral, sucre, oli de gira-sol, sal',
      allergens_tags: ['en:gluten'],
    });
    expect(note).toBeNull();
  });

  it('never asserts grain absence in the uncorroborated note (the list may be non-English)', () => {
    const note = assessGlutenSignal({
      ingredients_text: 'oats, brown rice, honey, salt',
      allergens_tags: ['en:gluten'],
    });
    expect(note).toBeTruthy();
    expect(note).not.toMatch(/no wheat, barley, or rye present/i);
  });

  it('still does not corroborate from maltodextrin (gluten-free despite the malt prefix)', () => {
    const note = assessGlutenSignal({
      ingredients_text: 'rice, maltodextrin, salt',
      allergens_tags: ['en:gluten'],
    });
    expect(note).toBeTruthy();
  });
});

describe('buildIngredientContext data reliability (UPCitemdb)', () => {
  it('appends a retail-listing reliability caveat for upcitemdb-sourced ingredients', () => {
    const context = buildIngredientContext({
      source: 'upcitemdb',
      product_name: 'Honey Nut Cheerios',
      ingredients_text: 'WHOLE GRAIN OATS, SUGAR, OAT BRAN, SALT.',
    });
    expect(context).toMatch(/DATA RELIABILITY/);
    expect(context).toMatch(/retail product listing/i);
  });

  it('does not add the retail-listing caveat for Open Food Facts data', () => {
    const context = buildIngredientContext({
      source: 'openfoodfacts',
      product_name: 'Rice Cakes',
      ingredients_text: 'rice, salt',
    });
    expect(context).not.toMatch(/retail product listing/i);
  });

  // PR #32 grill (decision 006): a US label may declare wheat only in its
  // "Contains:" line, and these sources carry no allergen data and often drop
  // that line — so an unstated-source ingredient can't be cleared from them.
  it.each(['usda', 'nutritionix', 'upcitemdb'])('holds %s records with an unstated-source ingredient at caution/incomplete', (source) => {
    const context = buildIngredientContext({
      source,
      product_name: 'Ranch Dip Mix',
      ingredients_text: 'buttermilk powder, modified food starch, salt, natural flavor.',
      allergens_tags: null,
    });
    expect(context).toMatch(/"Contains:" statement/);
    expect(context).toMatch(/caution_reason "incomplete"/);
    // PR #32 grill round 2: "CONTAINS 2% OR LESS OF" is not an allergen statement.
    expect(context).toMatch(/not "contains 2% or less of"/);
    expect(context).not.toMatch(/lean caution on anything ambiguous/);
  });

  it('does not add the no-allergen-data note for Open Food Facts data', () => {
    const context = buildIngredientContext({
      source: 'openfoodfacts',
      product_name: 'Ranch Dip Mix',
      ingredients_text: 'buttermilk powder, modified food starch, salt, natural flavor.',
      allergens_tags: ['en:milk'],
    });
    expect(context).not.toMatch(/caution_reason "incomplete"/);
  });
});

describe('buildIngredientContext gluten reconciliation', () => {
  it('appends the reliability caveat for the KIND regression product', () => {
    const context = buildIngredientContext({
      product_name: 'healthy grains granola Peanut Butter',
      ingredients_text:
        'whole grain blend (oats, brown rice, buckwheat, millet, amaranth, quinoa), peanut butter, salt',
      allergens_tags: ['en:gluten', 'en:peanuts', 'en:soybeans'],
      labels_tags: ['en:no-gluten'],
    });
    expect(context).toMatch(/not corroborated/i);
  });

  it('does not append a caveat for a genuine wheat product', () => {
    const context = buildIngredientContext({
      product_name: 'Wheat Crackers',
      ingredients_text: 'Wheat flour, salt, yeast',
      allergens_tags: ['en:gluten'],
    });
    expect(context).not.toMatch(/not corroborated/i);
  });
});

// GLUTENORNOT-MOBILE-7: the mobile client aborts barcode lookups at 30s, but the
// server put no timeout on the external product-database fetches — one slow
// Open Food Facts response could blow the whole budget. Every external lookup
// must carry an abort signal and treat a timeout as a miss, not a crash.
describe('lookup timeouts', () => {
  function restore(key, value) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  afterEach(() => vi.unstubAllGlobals());

  it('lookupOpenFoodFacts passes an abort signal to fetch', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 1, product: { product_name: 'X', ingredients_text: 'water' } }),
    });
    vi.stubGlobal('fetch', fetchSpy);
    await lookupOpenFoodFacts('12345678');
    expect(fetchSpy.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  // Privacy policy (2026-09-22): the only barcode written to server logs is one
  // no database recognizes. A hit must log which padding form matched, never
  // the number itself.
  it('lookupOpenFoodFacts never logs the barcode on a hit', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 1, product: { product_name: 'X', ingredients_text: 'water' } }),
    }));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await lookupOpenFoodFacts('012345678905');
      const logged = log.mock.calls.flat().map(String).join(' ');
      expect(logged).toContain('Open Food Facts hit');
      expect(logged).not.toMatch(/\d{8,}/);
    } finally {
      log.mockRestore();
    }
  });

  it('lookupOpenFoodFacts returns null (a miss) when every variant times out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(
      Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }),
    ));
    await expect(lookupOpenFoodFacts('12345678')).resolves.toBeNull();
  });

  it('lookupUSDA passes an abort signal to fetch', async () => {
    const saved = process.env.USDA_API_KEY;
    process.env.USDA_API_KEY = 'test-key';
    try {
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ foods: [] }) });
      vi.stubGlobal('fetch', fetchSpy);
      await lookupUSDA('12345678');
      expect(fetchSpy.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    } finally {
      restore('USDA_API_KEY', saved);
    }
  });

  it('lookupUpcItemDb passes an abort signal to fetch', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 'OK', total: 1, items: [{ title: 'Snack', brand: 'BrandCo' }] }),
    });
    vi.stubGlobal('fetch', fetchSpy);
    await lookupUpcItemDb('012345678905');
    expect(fetchSpy.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('lookupUpcItemDb returns null (a miss) on timeout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(
      Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }),
    ));
    await expect(lookupUpcItemDb('012345678905')).resolves.toBeNull();
  });

  it('lookupNutritionix passes an abort signal to fetch', async () => {
    const savedId = process.env.NUTRITIONIX_APP_ID;
    const savedKey = process.env.NUTRITIONIX_API_KEY;
    process.env.NUTRITIONIX_APP_ID = 'test-id';
    process.env.NUTRITIONIX_API_KEY = 'test-key';
    try {
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ foods: [] }) });
      vi.stubGlobal('fetch', fetchSpy);
      await lookupNutritionix('12345678');
      expect(fetchSpy.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    } finally {
      restore('NUTRITIONIX_APP_ID', savedId);
      restore('NUTRITIONIX_API_KEY', savedKey);
    }
  });
});

// Nutritionix discontinued its free tier (Syndigo, $499/mo minimum), so UPCitemdb's
// keyless trial tier is the last waterfall source. It returns title/brand, plus —
// for many grocery items — a manufacturer ingredient statement embedded in its
// description field. With ingredients a hit gets a full (reliability-caveated)
// Claude analysis; without, it flows through the no-ingredient-data caution path.
describe('lookupUpcItemDb', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns product name, brand, and source on a hit', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        total: 1,
        items: [{ ean: '0012345678905', title: 'Corn Chips', brand: 'BrandCo' }],
      }),
    }));
    const result = await lookupUpcItemDb('012345678905');
    expect(result).toEqual({
      source: 'upcitemdb',
      product_name: 'Corn Chips',
      brand: 'BrandCo',
    });
  });

  it('skips the lookup entirely for EAN-8 barcodes (different numbering space)', async () => {
    // Observed live: UPCitemdb zero-pads short codes into the UPC-A/EAN-13
    // space, so a valid EAN-8 resolves to an unrelated product (a query for
    // 96385074 returned "1000x Bucks Roblox").
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(lookupUpcItemDb('96385074')).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects a hit whose returned code does not match the queried barcode', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        total: 1,
        items: [{ ean: '0033149496577', title: 'Some Other Product', brand: 'WrongCo' }],
      }),
    }));
    await expect(lookupUpcItemDb('012345678905')).resolves.toBeNull();
  });

  it('accepts UPC-A ↔ EAN-13 leading-zero padding as the same product', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        total: 1,
        items: [{ ean: '0016000275270', title: 'Honey Nut Cheerios', brand: 'General Mills' }],
      }),
    }));
    const result = await lookupUpcItemDb('016000275270');
    expect(result).not.toBeNull();
    expect(result.product_name).toBe('Honey Nut Cheerios');
  });

  it('returns null when the items array contains a null entry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 'OK', total: 1, items: [null] }),
    }));
    await expect(lookupUpcItemDb('012345678905')).resolves.toBeNull();
  });

  it('extracts ingredients_text when the description carries an explicit INGREDIENTS statement', async () => {
    // Observed live: grocery items often embed the full ingredient statement in
    // `description`, e.g. "INGREDIENTS: / WHOLE GRAIN OATS, SUGAR, ...".
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        total: 1,
        items: [{
          ean: '0016000275270',
          title: 'Honey Nut Cheerios',
          brand: 'General Mills',
          description: 'INGREDIENTS: / WHOLE GRAIN OATS, SUGAR, OAT BRAN, SALT.',
        }],
      }),
    }));
    const result = await lookupUpcItemDb('016000275270');
    expect(result.ingredients_text).toBe('WHOLE GRAIN OATS, SUGAR, OAT BRAN, SALT.');
  });

  it('does not treat a marketing description as ingredients', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        total: 1,
        items: [{
          ean: '0012345678905',
          title: 'Corn Chips',
          brand: 'BrandCo',
          description: 'A delicious crunchy snack the whole family will love.',
        }],
      }),
    }));
    const result = await lookupUpcItemDb('012345678905');
    expect(result.ingredients_text).toBeUndefined();
  });

  it('does not treat lowercase mid-sentence "ingredients:" marketing copy as ingredients', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        total: 1,
        items: [{
          ean: '0012345678905',
          title: 'Corn Chips',
          brand: 'BrandCo',
          description: 'Crafted with the finest ingredients: taste the difference. Perfect for parties.',
        }],
      }),
    }));
    const result = await lookupUpcItemDb('012345678905');
    expect(result.ingredients_text).toBeUndefined();
  });

  it('rejects an uppercase INGREDIENTS capture that does not look like an ingredient list', async () => {
    // Real statements are comma-separated lists; prose without a single comma
    // is noise even behind the right label.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        total: 1,
        items: [{
          ean: '0012345678905',
          title: 'Corn Chips',
          brand: 'BrandCo',
          description: 'INGREDIENTS: taste the difference.',
        }],
      }),
    }));
    const result = await lookupUpcItemDb('012345678905');
    expect(result.ingredients_text).toBeUndefined();
  });

  // Pre-release review 2026-07-27 #9: the extraction regex used the /s flag,
  // so everything after "INGREDIENTS:" in a multi-line retail description —
  // directions, disclaimers, marketing — became ingredients_text and went to
  // Claude as the ingredient statement (wrong-verdict risk).
  it('captures only the ingredient line, not the retail prose after it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        total: 1,
        items: [{
          ean: '0016000275270',
          title: 'Honey Nut Cheerios',
          brand: 'General Mills',
          description:
            'INGREDIENTS: / WHOLE GRAIN OATS, SUGAR, OAT BRAN, SALT.\n' +
            'Directions: enjoy as part of a balanced breakfast.\n' +
            'Satisfaction guaranteed or your money back. Processed in a facility that also handles wheat.',
        }],
      }),
    }));
    const result = await lookupUpcItemDb('016000275270');
    expect(result.ingredients_text).toBe('WHOLE GRAIN OATS, SUGAR, OAT BRAN, SALT.');
  });

  // Grill follow-up to #9: without /s the capture stops at end of line, so a
  // manufacturer statement WRAPPED across lines gets cut mid-list — and a
  // clean-looking truncated list (gluten term on the next line) could ground a
  // "safe" verdict. A trailing comma is proof of truncation: reject it and let
  // the scan flow through the no-ingredient-data caution path instead.
  it('rejects a capture that ends in a comma (wrapped statement truncated at end of line)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        total: 1,
        items: [{
          ean: '0012345678905',
          title: 'Rice Snacks',
          brand: 'BrandCo',
          description: 'INGREDIENTS: RICE, SUGAR,\nWHEAT FLOUR, SALT.',
        }],
      }),
    }));
    const result = await lookupUpcItemDb('012345678905');
    expect(result.ingredients_text).toBeUndefined();
  });

  it('returns null when the database has no match', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 'OK', total: 0, items: [] }),
    }));
    await expect(lookupUpcItemDb('12345678')).resolves.toBeNull();
  });

  it('returns null (a miss, not a crash) on a non-ok response like 429', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ code: 'EXCEED_LIMIT' }),
    }));
    await expect(lookupUpcItemDb('12345678')).resolves.toBeNull();
  });
});

describe('rate limiting (barcode)', () => {
  beforeEach(() => {
    _setRateLimitMap(new Map());
  });

  it('allows fresh IP', () => {
    expect(checkRateLimit('1.2.3.4')).toEqual({ allowed: true });
  });

  it('blocks IP at limit', () => {
    const map = _getRateLimitMap();
    map.set('1.2.3.4', { count: 50, windowStart: Date.now() });
    const result = checkRateLimit('1.2.3.4');
    expect(result.allowed).toBe(false);
  });

  it('increments count', () => {
    incrementRateLimit('1.2.3.4');
    const map = _getRateLimitMap();
    expect(map.get('1.2.3.4').count).toBe(1);
  });
});

describe('barcode handler analytics', () => {
  function mockRes() {
    return {
      statusCode: null,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
      setHeader() {},
    };
  }

  function restore(key, value) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  const OFF_MISS = { ok: true, json: async () => ({ status: 0 }) };

  let savedEnv;
  beforeEach(() => {
    _setRateLimitMap(new Map());
    vi.clearAllMocks();
    savedEnv = {
      anthropic: process.env.ANTHROPIC_API_KEY,
      usda: process.env.USDA_API_KEY,
      nutritionixId: process.env.NUTRITIONIX_APP_ID,
      nutritionixKey: process.env.NUTRITIONIX_API_KEY,
    };
    // Keep the waterfall to Open Food Facts only so one fetch stub covers a miss.
    delete process.env.USDA_API_KEY;
    delete process.env.NUTRITIONIX_APP_ID;
    delete process.env.NUTRITIONIX_API_KEY;
  });
  afterEach(() => {
    restore('ANTHROPIC_API_KEY', savedEnv.anthropic);
    restore('USDA_API_KEY', savedEnv.usda);
    restore('NUTRITIONIX_APP_ID', savedEnv.nutritionixId);
    restore('NUTRITIONIX_API_KEY', savedEnv.nutritionixKey);
    vi.unstubAllGlobals();
  });

  it('tracks a not_found failure without recording the barcode (privacy: no record of what you scanned)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(OFF_MISS));
    const res = mockRes();
    await handler({ method: 'POST', body: { barcode: '12345678' }, headers: { 'x-client': 'ios' } }, res);
    expect(res.statusCode).toBe(404);
    expect(trackScanFailure).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'barcode', reason: 'not_found', platform: 'ios' })
    );
    expect(trackScanFailure).not.toHaveBeenCalledWith(
      expect.objectContaining({ barcode: expect.anything() })
    );
    expect(trackScan).not.toHaveBeenCalled();
  });

  it('falls through to UPCitemdb when Open Food Facts misses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url) => {
      if (String(url).includes('upcitemdb')) {
        return {
          ok: true,
          json: async () => ({
            code: 'OK',
            total: 1,
            items: [{ ean: '0012345678905', title: 'Corn Chips', brand: 'BrandCo' }],
          }),
        };
      }
      return OFF_MISS;
    }));
    const res = mockRes();
    await handler({ method: 'POST', body: { barcode: '012345678905' }, headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.verdict).toBe('caution');
    expect(res.body.data_source).toBe('upcitemdb');
    expect(res.body.product_name).toBe('BrandCo - Corn Chips');
    expect(trackScan).toHaveBeenCalledWith(
      expect.objectContaining({ dataSource: 'upcitemdb', hadIngredientData: false })
    );
    expect(trackScanFailure).not.toHaveBeenCalled();
  });

  it('runs a full Claude analysis when a UPCitemdb description carries ingredients', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const analysis = {
      verdict: 'caution',
      flagged_ingredients: ['oats'],
      allergen_warnings: [],
      explanation: 'Oats without GF certification.',
      confidence: 'medium',
    };
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url) => {
      if (String(url).includes('anthropic')) {
        return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(analysis) }] }) };
      }
      if (String(url).includes('upcitemdb')) {
        return {
          ok: true,
          json: async () => ({
            code: 'OK',
            total: 1,
            items: [{
              ean: '0016000275270',
              title: 'Honey Nut Cheerios',
              brand: 'General Mills',
              description: 'INGREDIENTS: / WHOLE GRAIN OATS, SUGAR, OAT BRAN, SALT.',
            }],
          }),
        };
      }
      return OFF_MISS;
    }));
    const res = mockRes();
    await handler({ method: 'POST', body: { barcode: '016000275270' }, headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.verdict).toBe('caution');
    expect(res.body.data_source).toBe('upcitemdb');
    expect(trackScan).toHaveBeenCalledWith(
      expect.objectContaining({ dataSource: 'upcitemdb', hadIngredientData: true, confidence: 'medium' })
    );
  });

  it('tracks a rate_limited failure when the daily limit is hit', async () => {
    _getRateLimitMap().set('unknown', { count: 50, windowStart: Date.now() });
    const res = mockRes();
    await handler({ method: 'POST', body: { barcode: '12345678' }, headers: {} }, res);
    expect(res.statusCode).toBe(429);
    expect(trackScanFailure).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'barcode', reason: 'rate_limited' })
    );
  });

  it('tracks a claude_error failure when analysis fails', async () => {
    delete process.env.ANTHROPIC_API_KEY; // callClaude throws a persistent ClaudeError
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 1, product: { product_name: 'Crackers', ingredients_text: 'wheat flour' } }),
    }));
    const res = mockRes();
    await handler({ method: 'POST', body: { barcode: '12345678' }, headers: {} }, res);
    expect(res.statusCode).toBe(503);
    expect(trackScanFailure).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'barcode', reason: 'claude_error' })
    );
  });

  it('tracks the no-ingredient-data caution with confidence low and had_ingredient_data false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 1, product: { product_name: 'Mystery Snack', labels_tags: ['en:no-gluten'] } }),
    }));
    const res = mockRes();
    await handler({ method: 'POST', body: { barcode: '12345678' }, headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.verdict).toBe('caution');
    expect(res.body.caution_reason).toBe('incomplete');
    expect(trackScan).toHaveBeenCalledWith(
      expect.objectContaining({ confidence: 'low', hadIngredientData: false, gfLabelPresent: true, cautionReason: 'incomplete' })
    );
  });

  describe('missing-context marker (plans/barcode-recovery-2026-09-05.md)', () => {
    // The client needs a deterministic way to tell "the database had nothing
    // to analyze" from a genuine low-confidence caution — without parsing the
    // explanation prose. The marker is set from context construction only.
    it('marks a name-only record with result_reason: missing_context, keeping the legacy shape', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 1, product: { product_name: 'Mystery Snack' } }),
      }));
      const res = mockRes();
      await handler({ method: 'POST', body: { barcode: '12345678' }, headers: {} }, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.result_reason).toBe('missing_context');
      // Everything an old client reads is untouched
      expect(res.body).toMatchObject({
        mode: 'label',
        verdict: 'caution',
        confidence: 'low',
        flagged_ingredients: [],
        allergen_warnings: [],
        product_name: 'Mystery Snack',
        barcode: '12345678',
        data_source: 'openfoodfacts',
      });
      expect(res.body.explanation).toContain('no ingredient data');
      // scan telemetry is unchanged: still a scan, not a scan_failed
      expect(trackScan).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'barcode', confidence: 'low', hadIngredientData: false })
      );
      expect(trackScanFailure).not.toHaveBeenCalled();
    });

    it('marks a labels-tags-only record (gluten-free label but no ingredients/allergens) as missing_context', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 1,
          product: { product_name: 'Rice Crackers', labels_tags: ['en:no-gluten'], allergens_tags: [] },
        }),
      }));
      const res = mockRes();
      await handler({ method: 'POST', body: { barcode: '12345678' }, headers: {} }, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.result_reason).toBe('missing_context');
      expect(res.body.verdict).toBe('caution');
    });

    it('marks a name-only UPCitemdb hit as missing_context too', async () => {
      vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url) => {
        if (String(url).includes('upcitemdb')) {
          return {
            ok: true,
            json: async () => ({ code: 'OK', total: 1, items: [{ ean: '0012345678905', title: 'Corn Chips', brand: 'BrandCo' }] }),
          };
        }
        return OFF_MISS;
      }));
      const res = mockRes();
      await handler({ method: 'POST', body: { barcode: '012345678905' }, headers: {} }, res);
      expect(res.body.result_reason).toBe('missing_context');
      expect(res.body.data_source).toBe('upcitemdb');
    });

    it('does not mark an allergen-tags-only record — that still goes to Claude (analysis policy unchanged)', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      const analysis = { verdict: 'caution', flagged_ingredients: [], allergen_warnings: ['gluten'], explanation: 'Tag only.', confidence: 'low' };
      vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url) => {
        if (String(url).includes('anthropic')) {
          return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(analysis) }] }) };
        }
        return { ok: true, json: async () => ({ status: 1, product: { product_name: 'Oat Bar', allergens_tags: ['en:gluten'] } }) };
      }));
      const res = mockRes();
      await handler({ method: 'POST', body: { barcode: '12345678' }, headers: {} }, res);
      expect(res.statusCode).toBe(200);
      expect(res.body).not.toHaveProperty('result_reason');
      expect(trackScan).toHaveBeenCalledWith(expect.objectContaining({ hadIngredientData: true }));
    });

    it('does not mark an evidence-backed result, even a low-confidence caution', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      const analysis = { verdict: 'caution', flagged_ingredients: ['natural flavors'], allergen_warnings: [], explanation: 'Ambiguous.', confidence: 'low' };
      vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url) => {
        if (String(url).includes('anthropic')) {
          return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(analysis) }] }) };
        }
        return { ok: true, json: async () => ({ status: 1, product: { product_name: 'Chips', ingredients_text: 'corn, natural flavors' } }) };
      }));
      const res = mockRes();
      await handler({ method: 'POST', body: { barcode: '12345678' }, headers: {} }, res);
      expect(res.body.verdict).toBe('caution');
      expect(res.body.confidence).toBe('low');
      expect(res.body).not.toHaveProperty('result_reason');
    });

    it('strips a result_reason the model itself emits — only the handler may set the marker', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      const analysis = { verdict: 'unsafe', flagged_ingredients: ['wheat'], allergen_warnings: [], explanation: 'Wheat.', confidence: 'high', result_reason: 'missing_context' };
      vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url) => {
        if (String(url).includes('anthropic')) {
          return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(analysis) }] }) };
        }
        return { ok: true, json: async () => ({ status: 1, product: { product_name: 'Bread', ingredients_text: 'wheat flour, water' } }) };
      }));
      const res = mockRes();
      await handler({ method: 'POST', body: { barcode: '12345678' }, headers: {} }, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.verdict).toBe('unsafe');
      expect(res.body).not.toHaveProperty('result_reason');
    });

    it('never marks a not_found — that stays a 404 failure, not a fabricated result', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(OFF_MISS));
      const res = mockRes();
      await handler({ method: 'POST', body: { barcode: '12345678' }, headers: {} }, res);
      expect(res.statusCode).toBe(404);
      expect(res.body).not.toHaveProperty('result_reason');
      expect(res.body).not.toHaveProperty('verdict');
    });
  });

  it('tracks a successful analysis with Claude confidence and had_ingredient_data true', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const analysis = {
      verdict: 'safe',
      flagged_ingredients: [],
      allergen_warnings: [],
      explanation: 'All clear.',
      confidence: 'high',
    };
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url) => {
      if (String(url).includes('anthropic')) {
        return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(analysis) }] }) };
      }
      return {
        ok: true,
        json: async () => ({ status: 1, product: { product_name: 'Rice Cakes', ingredients_text: 'rice, salt' } }),
      };
    }));
    const res = mockRes();
    await handler({ method: 'POST', body: { barcode: '12345678' }, headers: {} }, res);
    expect(res.statusCode).toBe(200);
    // Decision 004: the barcode twin of gf_claim_present — explicit false when
    // the record has no label tag at all, so labeled vs unlabeled is readable.
    expect(trackScan).toHaveBeenCalledWith(expect.objectContaining({ gfLabelPresent: false }));
    expect(trackScan).toHaveBeenCalledWith(
      expect.objectContaining({ confidence: 'high', hadIngredientData: true })
    );
    expect(trackScanFailure).not.toHaveBeenCalled();
  });

  it('tracks the caution_reason Claude gave on an analyzed record (decision 006)', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const analysis = { verdict: 'caution', caution_reason: 'may_contain', explanation: 'Traces of wheat.', confidence: 'medium' };
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url) => {
      if (String(url).includes('anthropic')) {
        return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(analysis) }] }) };
      }
      return {
        ok: true,
        json: async () => ({ status: 1, product: { product_name: 'Rice Cakes', ingredients_text: 'rice, salt', traces_tags: ['en:gluten'] } }),
      };
    }));
    const res = mockRes();
    await handler({ method: 'POST', body: { barcode: '12345678' }, headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.caution_reason).toBe('may_contain');
    expect(trackScan).toHaveBeenCalledWith(expect.objectContaining({ verdict: 'caution', cautionReason: 'may_contain' }));
  });
});

describe('formatTimeRemaining (barcode)', () => {
  it('formats hours', () => {
    expect(formatTimeRemaining(2 * 60 * 60 * 1000)).toBe('2 hours');
  });

  it('formats minutes', () => {
    expect(formatTimeRemaining(30 * 60 * 1000)).toBe('30 minutes');
  });
});

// Prompt caching (2026-09-16 credit incident): same contract as the OCR path —
// CLAUDE_PROMPT is a cache-marked block that never changes, the product data
// follows it in its own block.
describe('analyzeWithClaude request shape (prompt caching)', () => {
  const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;
  const CLAUDE_OK = {
    ok: true, status: 200,
    json: async () => ({ content: [{ type: 'text', text: '{"mode":"label","verdict":"caution","flagged_ingredients":[],"allergen_warnings":[],"explanation":"x","confidence":"low"}' }] }),
    text: async () => '',
  };
  beforeEach(() => { process.env.ANTHROPIC_API_KEY = 'test-key'; });
  afterEach(() => { process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY; vi.unstubAllGlobals(); });

  it('sends CLAUDE_PROMPT as a cache-marked first block and the product data after it', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(CLAUDE_OK);
    vi.stubGlobal('fetch', fetchSpy);
    await analyzeWithClaude('Product: Oat Bar\nIngredients: oats, honey');
    const content = JSON.parse(fetchSpy.mock.calls[0][1].body).messages[0].content;
    expect(content[0]).toEqual({ type: 'text', text: CLAUDE_PROMPT, cache_control: { type: 'ephemeral' } });
    expect(content[1]).toEqual({ type: 'text', text: '### Product Data:\nProduct: Oat Bar\nIngredients: oats, honey' });
    expect(content).toHaveLength(2);
  });
});
