/**
 * Frozen eval set for the gluten-free label-claim rule
 * (plans/gf-label-claim-2026-08-28.md, decision 003).
 *
 * Every ocrText is SYNTHETIC — label-shaped text written for this eval, never
 * copied from a real user scan (privacy: no record of what anyone scanned).
 *
 * `expect` semantics, enforced by gf-claim.live.test.js:
 *   'safe'     — must be "safe" on every run (the rule's payoff cases)
 *   'caution'  — must be exactly "caution" on every run (a specific rubric rule
 *                is expected to carry the verdict: oats, advisory, unchanged
 *                baseline, near-claims, incomplete read)
 *   'unsafe'   — must be exactly "unsafe" on every run (a gluten statement)
 *   'not-safe' — must never be "safe"; "caution" or "unsafe" both pass (toggle
 *                T3: a listed gluten source despite a claim — either verdict is
 *                defensible, a false safe is not)
 * `namesClaim: true` additionally requires every explanation to name the label
 * / certification as the reason (the definition of done says "with the claim
 * named").
 *
 * Adversarial cases are built so that "safe" is reachable ONLY through the
 * mistake under test: each carries an ambiguous ingredient (natural flavors,
 * maltodextrin…) that a real claim would clear, so a near-claim, a negated
 * claim, or an ingredient-level claim mistaken for a product claim shows up
 * as a false safe rather than hiding behind the baseline caution.
 *
 * The plan's toggles live here as expectations: T1 (advisory on a labeled
 * product → caution: cases 13, 14), T2 (a whole-product claim covers oats —
 * flipped 2026-09-16, decision 004: cases 5, 6, 23; oats with no claim stay
 * caution: cases 24, 25), T3 (listed gluten source beats the claim: cases 7,
 * 8). Flip a toggle in the plan → edit the prompt AND the matching
 * expectation here.
 */
export const GF_CLAIM_CASES = [
  {
    id: 1,
    expect: 'safe',
    namesClaim: true,
    why: 'the incident — labeled GF kettle corn with flavors + hydrolyzed soy protein',
    ocrText: `FARM STAND KETTLE CORN
Gluten Free
INGREDIENTS: Non-GMO popcorn, cane sugar, sunflower oil, sea salt, natural & artificial flavor, natural smoke flavor, hydrolyzed soy protein.
CONTAINS: SOY.
NET WT 7 OZ (198g)`,
  },
  {
    id: 2,
    expect: 'safe',
    namesClaim: true,
    why: 'labeled GF + maltodextrin + modified food starch + spices',
    ocrText: `RANCH SEASONED VEGGIE CHIPS
GLUTEN FREE
INGREDIENTS: Potato flakes, sunflower oil, maltodextrin, modified food starch, salt, buttermilk powder, spices, onion powder, garlic powder, citric acid.
CONTAINS: MILK.
NET WT 4.5 OZ (128g)`,
  },
  {
    id: 3,
    expect: 'safe',
    namesClaim: true,
    why: 'Spanish "Sin gluten" + aromas naturales + almidón modificado',
    ocrText: `PATATAS FRITAS SABOR JAMÓN
Sin gluten
INGREDIENTES: Patatas, aceite de girasol, sal, aromas naturales, almidón modificado, dextrosa, especias, colorante (extracto de pimentón).
Puede contener leche.
Peso neto 130 g`,
  },
  {
    id: 4,
    expect: 'safe',
    namesClaim: true,
    why: "Dutch \"Glutenvrij\" + gemodificeerd zetmeel + natuurlijke aroma's",
    ocrText: `PAPRIKA CHIPS
Glutenvrij
INGREDIËNTEN: aardappelen, zonnebloemolie, gemodificeerd zetmeel, zout, suiker, natuurlijke aroma's, paprikapoeder, uienpoeder, citroenzuur.
Kan sporen van melk bevatten.
Netto 150 g`,
  },
  {
    id: 5,
    // Decision 004 (2026-09-16): was `caution` under T2 (oats stay caution
    // without a certification mark). A whole-product claim now covers oats.
    expect: 'safe',
    namesClaim: true,
    oatsCaveat: true,
    why: 'T2 flipped — labeled GF + rolled oats, no certification mark',
    ocrText: `HONEY OAT GRANOLA CLUSTERS
Gluten Free
INGREDIENTS: Whole grain rolled oats, honey, brown sugar, sunflower oil, almonds, natural flavor, sea salt.
CONTAINS: TREE NUTS (ALMONDS).
NET WT 11 OZ (312g)`,
  },
  {
    id: 6,
    expect: 'safe',
    namesClaim: true,
    oatsCaveat: true,
    why: 'T2 — "Certified Gluten-Free (GFCO)" + rolled oats',
    ocrText: `MAPLE ALMOND OATMEAL CUP
Certified Gluten-Free (GFCO)
INGREDIENTS: Certified gluten-free whole grain rolled oats, maple sugar, almonds, chia seeds, natural flavor, sea salt.
CONTAINS: TREE NUTS (ALMONDS).
NET WT 2.1 OZ (60g)`,
  },
  {
    id: 7,
    expect: 'not-safe',
    why: 'T3 — labeled GF but lists malt extract',
    ocrText: `CHOCOLATE MALT BALLS
Gluten Free
INGREDIENTS: Milk chocolate (sugar, cocoa butter, whole milk powder, cocoa mass, soy lecithin), sugar, malt extract, corn syrup, natural flavor.
CONTAINS: MILK, SOY.
NET WT 5 OZ (142g)`,
  },
  {
    id: 8,
    expect: 'not-safe',
    why: 'T3 — labeled GF (EU-style) but lists wheat starch',
    ocrText: `CRISPY CRACKERS
Gluten-free
INGREDIENTS: Wheat starch, sunflower oil, rice flour, sugar, salt, raising agents (sodium bicarbonate), natural flavouring.
CONTAINS: WHEAT.
Net weight 150 g`,
  },
  {
    id: 9,
    // The plan expected "caution"; the 2026-08-28 baseline returned "unsafe"
    // 3/3 at high confidence, and the first wording of the negation guard
    // ("ignore 'not gluten-free'") measurably demoted it to caution ×3. A
    // manufacturer's explicit "not gluten-free" is a gluten statement — the
    // prompt now says so and this pins "unsafe" (caught by /grill).
    expect: 'unsafe',
    why: 'negation guard — "This product is not gluten-free" + natural flavors',
    ocrText: `SMOKY BBQ SNACK MIX
This product is not gluten-free.
INGREDIENTS: Corn, rice, sunflower oil, sugar, salt, natural flavors, paprika, onion powder, yeast extract.
NET WT 8 OZ (227g)`,
  },
  {
    id: 10,
    expect: 'caution',
    why: 'negation guard — "Gluten-free options available" on a multi-product sheet + natural flavors',
    ocrText: `MARKET PANTRY GRANOLA BARS — VARIETY PACK
Gluten-free options available in our product line — see individual packaging.
INGREDIENTS (Peanut Butter Bar): Peanuts, brown rice syrup, sugar, natural flavors, salt.
CONTAINS: PEANUTS.
NET WT 8.8 OZ (250g)`,
  },
  {
    id: 11,
    expect: 'caution',
    why: 'baseline, unchanged — no claim + natural flavors',
    ocrText: `SEA SALT & VINEGAR POTATO CHIPS
INGREDIENTS: Potatoes, vegetable oil (sunflower, canola), sea salt, vinegar powder, natural flavors, citric acid.
NET WT 5 OZ (142g)
Distributed by Example Foods Co.`,
  },
  {
    id: 12,
    expect: 'safe',
    why: 'baseline, unchanged — no claim, rice + salt + sunflower oil',
    ocrText: `PLAIN RICE CAKES
INGREDIENTS: Whole grain brown rice, sunflower oil, sea salt.
NET WT 4.9 OZ (139g). Store in a cool, dry place.
Distributed by Example Foods Co.`,
  },
  {
    id: 13,
    expect: 'caution',
    why: 'T1 — labeled GF + "may contain wheat"',
    ocrText: `DARK CHOCOLATE ALMONDS
Gluten Free
INGREDIENTS: Dark chocolate (sugar, chocolate liquor, cocoa butter, soy lecithin, vanilla), almonds, natural flavor, confectioner's glaze.
CONTAINS: TREE NUTS (ALMONDS), SOY. MAY CONTAIN WHEAT.
NET WT 6 OZ (170g)`,
  },
  {
    id: 14,
    expect: 'caution',
    why: 'T1 — labeled GF + "processed on equipment that also processes wheat"',
    ocrText: `CHEDDAR RICE CRISPS
Gluten Free
INGREDIENTS: Brown rice, cheddar cheese (milk, salt, cultures, enzymes), sunflower oil, maltodextrin, natural flavor, salt.
CONTAINS: MILK. Processed on equipment that also processes wheat.
NET WT 3.5 OZ (99g)`,
  },
  {
    id: 15,
    expect: 'safe',
    namesClaim: true,
    why: 'labeled GF + hydrolyzed vegetable protein (source unstated) — the claim covers it',
    ocrText: `SAVORY BROTH CUBES
Gluten Free
INGREDIENTS: Salt, hydrolyzed vegetable protein, sugar, palm oil, onion powder, natural flavor, turmeric, celery seed.
CONTAINS: CELERY.
NET WT 2.3 OZ (66g)`,
  },
  {
    id: 16,
    expect: 'safe',
    why: 'no claim + hydrolyzed soy protein only — the HVP narrowing (a named non-gluten source)',
    ocrText: `GARLIC RICE CRACKERS
INGREDIENTS: Rice, sugar, sunflower oil, hydrolyzed soy protein, salt, garlic powder, ginger powder, sesame seeds.
CONTAINS: SOY, SESAME.
NET WT 3 OZ (85g)`,
  },
  // Cases 17–22 added after the 2026-08-28 /grill: the near-claims, the
  // ingredient-level claim, and the front-of-pack-only capture were the places
  // where "zero new false-safe paths" rested on nothing.
  {
    id: 17,
    expect: 'caution',
    why: 'near-claim — "Wheat-Free" is not a gluten-free claim; natural flavors stay ambiguous',
    ocrText: `COCONUT SNACK BITES
Wheat-Free
INGREDIENTS: Coconut, tapioca starch, cane sugar, natural flavors, sea salt.
NET WT 4 OZ (113g)`,
  },
  {
    id: 18,
    expect: 'caution',
    why: 'near-claim — "Gluten Friendly" is not a gluten-free claim; maltodextrin + natural flavors stay ambiguous',
    ocrText: `KITCHEN CRAFTED VEGGIE STRAWS
Gluten Friendly
INGREDIENTS: Potato starch, potato flour, sunflower oil, maltodextrin, natural flavors, salt, spinach powder, tomato powder.
NET WT 6 OZ (170g)`,
  },
  {
    id: 19,
    expect: 'not-safe',
    why: 'near-claim — EU "Very low gluten" (≤100 ppm) means gluten is present; natural flavouring present',
    ocrText: `SEEDED CRISPBREAD
Very low gluten
INGREDIENTS: Rice flour, sunflower seeds, flaxseed, rapeseed oil, salt, natural flavouring.
Net weight 200 g`,
  },
  {
    id: 20,
    expect: 'not-safe',
    why: 'near-claim — "Gluten-Reduced / crafted to remove gluten" means gluten is present; natural flavors present',
    ocrText: `GLUTEN-REDUCED CRISPY SNACK MIX
Crafted to remove gluten
INGREDIENTS: Corn, rice, sunflower oil, sugar, salt, natural flavors, yeast extract.
NET WT 8 OZ (227g)`,
  },
  {
    id: 21,
    expect: 'caution',
    why: 'ingredient-level claim — "gluten-free soy sauce" covers the soy sauce only; natural flavors stay ambiguous',
    ocrText: `SESAME GINGER RICE CRISPS
INGREDIENTS: Brown rice, gluten-free soy sauce (water, soybeans, rice, salt), sesame oil, sugar, natural flavors, ginger powder.
CONTAINS: SOY, SESAME.
NET WT 4 OZ (113g)`,
  },
  {
    id: 22,
    expect: 'caution',
    why: 'front-of-pack only — a claim with no visible ingredient list is an incomplete read',
    ocrText: `FARM STAND KETTLE CORN
Gluten Free · Non-GMO · Made in Vermont
Small-batch popped in copper kettles. A sweet and salty snack the whole family will love.
NET WT 7 OZ (198g). Keep sealed for freshness. Made with love since 1998.`,
  },
  // Decision 004 (2026-09-16) — the oats rule after the T2 flip.
  {
    id: 23,
    expect: 'safe',
    namesClaim: true,
    oatsCaveat: true,
    why: 'T2 flipped — labeled GF fruit bar, list calls its oats gluten-free, natural flavors present',
    ocrText: `ORCHARD FRUIT & OAT BAR — STRAWBERRY
Gluten Free · Plant Based · Whole Grains & Real Fruit
INGREDIENTS: Brown rice flour, brown rice syrup, fruit paste, strawberry filling (cane sugar, rice starch, strawberries, natural flavors, pectin, citric acid), canola oil, gluten free five grain flour (amaranth, quinoa, millet, sorghum, teff), gluten free rolled oats, glycerin, flaxseed, leavening (monocalcium phosphate, sodium bicarbonate), sea salt, xanthan gum, natural flavor.
Made in a dedicated peanut and tree nut free facility.
NET WT 2 OZ (57g)`,
  },
  {
    id: 24,
    expect: 'caution',
    why: 'no claim + rolled oats — plain oats are still a cross-contamination caution (the flip needs a claim)',
    ocrText: `HONEY OAT GRANOLA CLUSTERS
INGREDIENTS: Whole grain rolled oats, honey, brown sugar, sunflower oil, almonds, sea salt.
CONTAINS: TREE NUTS (ALMONDS).
NET WT 11 OZ (312g)`,
  },
  {
    id: 25,
    expect: 'caution',
    why: 'ingredient-level "gluten-free oats" with no product claim covers the oats only; natural flavors stay ambiguous',
    ocrText: `MAPLE PECAN OATMEAL CUP
INGREDIENTS: Gluten-free whole grain rolled oats, maple sugar, pecans, chia seeds, natural flavor, sea salt.
CONTAINS: TREE NUTS (PECANS).
NET WT 2.1 OZ (60g)`,
  },
  // /grill 2026-09-16: the per-language glossaries used to say "avena (oats —
  // treat as caution)" unconditionally, above the claims block — the traveler
  // case got two contradicting instructions. Now "caution unless the label
  // claims gluten-free".
  {
    id: 26,
    expect: 'safe',
    namesClaim: true,
    oatsCaveat: true,
    why: 'T2 flipped, Spanish — "Sin gluten" + avena integral + aromas naturales',
    ocrText: `GRANOLA DE AVENA CON MIEL
Sin gluten
INGREDIENTES: Copos de avena integral, miel, azúcar de caña, aceite de girasol, almendras, aromas naturales, sal marina.
CONTIENE: FRUTOS DE CÁSCARA (ALMENDRAS).
Peso neto 300 g`,
  },
  // /grill 2026-09-16: a two-product frame with a real certification mark on
  // product A and unlabeled oats on product B. The claim is "about this
  // product"; it must not lift the other product's oats.
  {
    id: 27,
    expect: 'not-safe',
    why: 'multi-product frame — "CERTIFIED GLUTEN-FREE" belongs to the rice crackers, not the oat granola beside them',
    ocrText: `SEA SALT RICE CRACKERS
CERTIFIED GLUTEN-FREE
INGREDIENTS: Whole grain brown rice, sunflower oil, sea salt.
NET WT 3.5 OZ (100g)

HONEY OAT GRANOLA
INGREDIENTS: Whole grain rolled oats, honey, brown sugar, sunflower oil, natural flavor, sea salt.
NET WT 11 OZ (312g)`,
  },
];
