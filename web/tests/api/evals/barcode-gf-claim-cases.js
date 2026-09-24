/**
 * Frozen eval set for the gluten-free label rule on the BARCODE path
 * (decision 004, 2026-09-16 — the claim block ported from the OCR prompt, with
 * oats covered by a whole-product claim).
 *
 * Every product is SYNTHETIC — database-shaped records written for this eval
 * in the shape Open Food Facts returns (`ingredients_text`, `allergens_tags`,
 * `labels_tags`), never a real user's scan. The shape that matters: OFF
 * auto-derives an `en:gluten` allergen tag from oats, so a labeled-GF oat
 * product arrives as label + oats + gluten tag, and that record used to come
 * back caution.
 *
 * `expect` and `reason` semantics match gf-claim-cases.js (enforced by
 * barcode-gf-claim.live.test.js).
 */
export const BARCODE_GF_CLAIM_CASES = [
  {
    id: 'B1',
    expect: 'safe',
    namesClaim: true,
    oatsCaveat: true,
    why: 'the incident shape — "No gluten" label, list calls its oats gluten-free, auto-derived gluten tag',
    product: {
      product_name: 'Fruit & Oat Bar Strawberry',
      brand: 'Orchard Foods',
      ingredients_text:
        'brown rice flour, brown rice syrup, fruit paste, strawberry filling (cane sugar, rice starch, strawberries, natural flavors, pectin, citric acid), canola oil, gluten free five grain flour (amaranth, quinoa, millet, sorghum, teff), gluten free rolled oats, glycerin, flaxseed, leavening (monocalcium phosphate, baking soda), sea salt, xanthan gum, natural flavor.',
      allergens_tags: ['en:gluten'],
      traces_tags: [],
      labels_tags: ['en:no-gluten', 'en:vegan', 'en:non-gmo-project'],
      source: 'openfoodfacts',
    },
  },
  {
    id: 'B2',
    expect: 'safe',
    namesClaim: true,
    oatsCaveat: true,
    why: 'T2 flipped — "No gluten" label + plain whole grain oats + auto-derived gluten tag',
    product: {
      product_name: 'Honey Oat Granola Clusters',
      ingredients_text:
        'whole grain rolled oats, honey, brown sugar, sunflower oil, almonds, natural flavor, sea salt.',
      allergens_tags: ['en:gluten', 'en:nuts'],
      traces_tags: [],
      labels_tags: ['en:no-gluten'],
      source: 'openfoodfacts',
    },
  },
  {
    id: 'B3',
    expect: 'safe',
    namesClaim: true,
    why: 'claim block ported — "No gluten" label + yeast extract (an undeclared_source the label covers) + natural flavors + maltodextrin, no oats',
    product: {
      product_name: 'Ranch Seasoned Veggie Chips',
      ingredients_text:
        'potato flakes, sunflower oil, maltodextrin, modified food starch, salt, buttermilk powder, yeast extract, spices, onion powder, natural flavors, citric acid.',
      allergens_tags: ['en:milk'],
      traces_tags: [],
      labels_tags: ['en:no-gluten'],
      source: 'openfoodfacts',
    },
  },
  {
    id: 'B4',
    expect: 'caution',
    why: 'no label + whole grain oats + auto-derived gluten tag — plain oats stay caution',
    product: {
      product_name: 'Honey Oat Granola Clusters',
      ingredients_text:
        'whole grain rolled oats, honey, brown sugar, sunflower oil, almonds, sea salt.',
      allergens_tags: ['en:gluten', 'en:nuts'],
      traces_tags: [],
      labels_tags: ['en:non-gmo-project'],
      source: 'openfoodfacts',
    },
  },
  {
    id: 'B5',
    expect: 'not-safe',
    why: 'T3 — "No gluten" label but the list has wheat flour (label and list disagree)',
    product: {
      product_name: 'Crispy Crackers',
      ingredients_text:
        'wheat flour, sunflower oil, rice flour, sugar, salt, raising agents (sodium bicarbonate), natural flavouring.',
      allergens_tags: ['en:gluten'],
      traces_tags: [],
      labels_tags: ['en:no-gluten'],
      source: 'openfoodfacts',
    },
  },
  {
    id: 'B6',
    expect: 'caution',
    why: 'T1 — "No gluten" label + oats, but a wheat trace tag (advisory beats the claim)',
    product: {
      product_name: 'Oat & Seed Crackers',
      ingredients_text:
        'whole grain oats, sunflower seeds, flaxseed, rapeseed oil, sea salt.',
      allergens_tags: ['en:gluten'],
      traces_tags: ['en:wheat'],
      labels_tags: ['en:no-gluten'],
      source: 'openfoodfacts',
    },
  },
  // /grill 2026-09-16 — the cases the first cut of the rule could have gotten
  // wrong: "label wins" must be gated on oats actually being in the list, and
  // "Certifications:" must never lend weight to a non-claim tag.
  {
    id: 'B7',
    expect: 'caution',
    why: 'self-contradicting record — "No gluten" label + gluten tag + NO oats, ambiguous-only list (no innocent explanation for the tag)',
    product: {
      product_name: 'Fruit Gummies',
      ingredients_text: 'sugar, glucose syrup, natural flavouring, yeast extract, citric acid, salt.',
      allergens_tags: ['en:gluten'],
      traces_tags: [],
      labels_tags: ['en:no-gluten'],
      source: 'openfoodfacts',
    },
  },
  {
    id: 'B8',
    expect: 'not-safe',
    why: 'the package says "contains gluten" (EU oat product) — never safe, whatever the tags',
    product: {
      product_name: 'Porridge Oats',
      ingredients_text: 'whole grain oats.',
      allergens_tags: ['en:gluten'],
      traces_tags: [],
      labels_tags: ['en:contains-gluten', 'en:vegan'],
      source: 'openfoodfacts',
    },
  },
  {
    id: 'B9',
    expect: 'caution',
    reason: 'oats',
    why: 'free-text "gluten-free-oats" tag is not a whole-product claim — it covers the gluten-free rolled oats, not the plain whole grain oats beside them',
    product: {
      product_name: 'Maple Oatmeal Cup',
      ingredients_text: 'gluten-free rolled oats, maple sugar, pecans, whole grain oats, sea salt.',
      allergens_tags: ['en:gluten', 'en:nuts'],
      traces_tags: [],
      labels_tags: ['en:gluten-free-oats'],
      source: 'openfoodfacts',
    },
  },
  {
    id: 'B10',
    expect: 'caution',
    reason: 'oats',
    // Decision 006: was "no label + natural flavors", now safe (calibration BC9).
    why: 'baseline — no label + plain oats, no gluten tag (the barcode twin of OCR case 11)',
    product: {
      product_name: 'Oat & Honey Crunch Bars',
      ingredients_text: 'whole grain oats, honey, cane sugar, sunflower oil, sea salt.',
      allergens_tags: [],
      traces_tags: [],
      labels_tags: ['en:vegan'],
      source: 'openfoodfacts',
    },
  },
  // Pi grill on PR #29 — adverse package statements must survive the label
  // allowlist and beat the claim; a wheat-specific tag is not "oats".
  {
    id: 'B11',
    expect: 'not-safe',
    why: 'conflicting labels — "No gluten" AND "contains gluten" on an otherwise-safe list (ignoring the warning would yield safe)',
    product: {
      product_name: 'Plain Rice Cakes',
      ingredients_text: 'whole grain brown rice, sunflower oil, sea salt.',
      allergens_tags: [],
      traces_tags: [],
      labels_tags: ['en:no-gluten', 'en:contains-gluten'],
      source: 'openfoodfacts',
    },
  },
  {
    id: 'B12',
    expect: 'caution',
    why: 'wheat-specific allergen tag + "No gluten" label + oats — oats explain a generic gluten tag, not a wheat tag',
    product: {
      product_name: 'Honey Oat Granola Clusters',
      ingredients_text: 'whole grain rolled oats, honey, brown sugar, sunflower oil, sea salt.',
      allergens_tags: ['en:wheat'],
      traces_tags: [],
      labels_tags: ['en:no-gluten'],
      source: 'openfoodfacts',
    },
  },
  {
    id: 'B13',
    expect: 'not-safe',
    why: 'free-text "very low gluten" tag on an otherwise-safe list — gluten is present; must not read as "no label"',
    product: {
      product_name: 'Seeded Crispbread',
      ingredients_text: 'rice flour, sunflower seeds, flaxseed, rapeseed oil, sea salt.',
      allergens_tags: [],
      traces_tags: [],
      labels_tags: ['en:very-low-gluten'],
      source: 'openfoodfacts',
    },
  },
  // Pi re-grill on PR #29 — unrecognized gluten-related free text must reach
  // Claude (under an explicitly unverified heading) rather than vanish, and
  // must never act as a claim in either direction.
  {
    id: 'B14',
    expect: 'not-safe',
    why: 'unrecognized adverse free text "not suitable for celiacs" beside a "No gluten" tag, oats + generic gluten tag',
    product: {
      product_name: 'Honey Oat Granola Clusters',
      ingredients_text: 'whole grain rolled oats, honey, brown sugar, sunflower oil, sea salt.',
      allergens_tags: ['en:gluten'],
      traces_tags: [],
      labels_tags: ['en:no-gluten', 'en:not-suitable-for-celiacs'],
      source: 'openfoodfacts',
    },
  },
  {
    id: 'B15',
    expect: 'safe',
    namesClaim: true,
    oatsCaveat: true,
    why: 'unrecognized POSITIVE free text "gluten-free-oats" beside a real "No gluten" tag must not demote a labeled product',
    product: {
      product_name: 'Honey Oat Granola Clusters',
      ingredients_text: 'gluten-free rolled oats, honey, brown sugar, sunflower oil, natural flavor, sea salt.',
      allergens_tags: ['en:gluten'],
      traces_tags: [],
      labels_tags: ['en:no-gluten', 'en:gluten-free-oats'],
      source: 'openfoodfacts',
    },
  },
  // PR #32 grill round 2 — B7's shape plus unrecognized gluten-free free text:
  // the label-plus-unrecognized-text branch had no never-safe line.
  {
    id: 'B16',
    expect: 'caution',
    reason: 'conflict',
    why: '"No gluten" label + unrecognized "gluten-free-certified" text + gluten tag + NO oats — the record contradicts itself',
    product: {
      product_name: 'Fruit Gummies',
      ingredients_text: 'sugar, glucose syrup, natural flavouring, citric acid, salt.',
      allergens_tags: ['en:gluten'],
      traces_tags: [],
      labels_tags: ['en:no-gluten', 'en:gluten-free-certified'],
      source: 'openfoodfacts',
    },
  },
];
