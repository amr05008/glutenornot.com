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
 * `expect` semantics match gf-claim-cases.js (enforced by
 * barcode-gf-claim.live.test.js).
 */
export const BARCODE_GF_CLAIM_CASES = [
  {
    id: 'B1',
    expect: 'safe',
    namesClaim: true,
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
    why: 'claim block ported — "No gluten" label + natural flavors + maltodextrin, no oats',
    product: {
      product_name: 'Ranch Seasoned Veggie Chips',
      ingredients_text:
        'potato flakes, sunflower oil, maltodextrin, modified food starch, salt, buttermilk powder, spices, onion powder, natural flavors, citric acid.',
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
    why: 'free-text "gluten-free-oats" tag is not a whole-product claim — oats covered at ingredient level, natural flavors stay ambiguous',
    product: {
      product_name: 'Maple Oatmeal Cup',
      ingredients_text: 'gluten-free rolled oats, maple sugar, pecans, natural flavor, sea salt.',
      allergens_tags: ['en:gluten', 'en:nuts'],
      traces_tags: [],
      labels_tags: ['en:gluten-free-oats'],
      source: 'openfoodfacts',
    },
  },
  {
    id: 'B10',
    expect: 'caution',
    why: 'baseline, unchanged — no label + natural flavors, no oats (the barcode twin of OCR case 11)',
    product: {
      product_name: 'Sea Salt & Vinegar Potato Chips',
      ingredients_text: 'potatoes, vegetable oil (sunflower, canola), sea salt, vinegar powder, natural flavors, citric acid.',
      allergens_tags: [],
      traces_tags: [],
      labels_tags: ['en:vegan'],
      source: 'openfoodfacts',
    },
  },
];
