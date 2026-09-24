/**
 * Frozen eval set for decision 006 — caution means a specific reason to worry.
 * SYNTHETIC label text and database records written for this eval, never a
 * user's scan. `expect` semantics match gf-claim-cases.js; `reason` is the
 * caution_reason every caution sample must carry.
 */
export const CALIBRATION_CASES = [
  // Not a reason on its own → safe
  { id: 'C1', expect: 'safe', why: 'unnamed natural flavor only', ocrText: 'SEA SALT KETTLE CHIPS\nINGREDIENTS: Potatoes, sunflower oil, sea salt, natural flavor.\nNET WT 8 OZ (227g)' },
  { id: 'C2', expect: 'safe', why: 'maltodextrin + modified food starch + spices', ocrText: 'RANCH DIP MIX\nINGREDIENTS: Buttermilk powder, maltodextrin, salt, modified food starch, onion powder, garlic powder, spices, citric acid.\nCONTAINS: MILK.' },
  { id: 'C3', expect: 'safe', why: 'spices + dextrin + caramel color', ocrText: 'CHILI SEASONING\nINGREDIENTS: Chili pepper, spices, salt, onion, garlic, dextrin, caramel color, paprika.\nNET WT 1 OZ (28g)' },
  { id: 'C4', expect: 'safe', why: 'HVP of unstated source in a rice mix (not a meat product)', ocrText: 'SAVORY RICE MIX\nINGREDIENTS: Long grain rice, salt, hydrolyzed vegetable protein, onion powder, natural flavors, turmeric.\nNET WT 6 OZ (170g)' },
  { id: 'C5', expect: 'safe', why: 'Spanish aromas naturales + almidón modificado', ocrText: 'PATATAS FRITAS\nINGREDIENTES: Patatas, aceite de girasol, sal, aromas naturales, almidón modificado.\nPeso neto 150 g' },
  { id: 'C6', expect: 'safe', why: 'French arôme naturel + sirop de glucose', ocrText: 'BISCUITS AU RIZ\nINGRÉDIENTS : Riz, sucre, sirop de glucose, huile de tournesol, arôme naturel, sel.\nPoids net 120 g' },
  { id: 'C7', expect: 'safe', why: 'Dutch natuurlijk aroma + maltodextrine', ocrText: 'RIJSTWAFELS\nINGREDIËNTEN: rijst, zonnebloemolie, maltodextrine, zout, natuurlijk aroma.\nNetto 100 g' },
  { id: 'C21', expect: 'safe', why: 'maltodextrin is not malt', ocrText: 'SPORTS DRINK POWDER\nINGREDIENTS: Sugar, maltodextrin, citric acid, natural flavor, salt, potassium chloride.\nNET WT 21 OZ (595g)' },
  // A specific reason → caution with that reason
  { id: 'C10', expect: 'caution', reason: 'oats', why: 'plain oats, no claim', ocrText: 'OAT BITES\nINGREDIENTS: Whole grain oats, honey, sunflower oil, natural flavor, sea salt.\nNET WT 7 OZ (198g)' },
  { id: 'C11', expect: 'caution', reason: 'may_contain', why: '"may contain wheat" on an otherwise clean list', ocrText: 'RICE CRACKERS\nINGREDIENTS: Rice, sunflower oil, salt, natural flavor.\nMAY CONTAIN WHEAT.' },
  { id: 'C12', expect: 'caution', reason: 'may_contain', why: 'shared-facility statement', ocrText: 'ALMOND BUTTER BITES\nINGREDIENTS: Almonds, dates, cocoa, sea salt.\nMade in a facility that also processes wheat.' },
  { id: 'C13', expect: 'caution', reason: 'may_contain', why: 'Spanish "puede contener trazas de trigo"', ocrText: 'TORTITAS DE MAÍZ\nINGREDIENTES: Maíz, aceite de girasol, sal.\nPuede contener trazas de trigo.' },
  { id: 'C14', expect: 'caution', reason: 'undeclared_source', why: 'T3 — US sausage: spices + flavorings in a meat product', ocrText: 'SMOKED SAUSAGE\nINGREDIENTS: Pork, water, salt, corn syrup, spices, dextrose, natural flavorings, sodium nitrite.\nINSPECTED AND PASSED BY DEPARTMENT OF AGRICULTURE EST. 1234.' },
  { id: 'C15', expect: 'not-safe', reason: 'undeclared_source', why: 'T5 — soy sauce with no wheat declaration and no claim', ocrText: 'TERIYAKI SAUCE\nINGREDIENTS: Sugar, water, soy sauce, rice vinegar, garlic, ginger, natural flavor.\nNET WT 10 OZ (283g)' },
  { id: 'C16', expect: 'caution', reason: 'undeclared_source', why: 'T4 — yeast extract of unstated source', ocrText: 'VEGETABLE BROTH\nINGREDIENTS: Water, carrots, celery, onions, salt, yeast extract, natural flavor.\nNET WT 32 OZ (907g)' },
  { id: 'C17', expect: 'caution', reason: 'incomplete', why: 'front of pack only — no ingredient list', ocrText: 'CRUNCHY RICE SNACK\nOnly 110 calories per serving!\nNET WT 4 OZ (113g)' },
  { id: 'C18', expect: 'caution', reason: 'incomplete', why: 'garbled OCR', ocrText: 'INGRED ENTS: Ri e, su ar, na ur l fl vo , s lt,\nC NT IN : ...' },
  // Named gluten → unsafe (the rule must not soften these)
  { id: 'C19', expect: 'unsafe', why: 'a flavor that names barley', ocrText: 'BBQ CHIPS\nINGREDIENTS: Potatoes, sunflower oil, sugar, salt, natural flavor (barley), paprika.\nNET WT 8 OZ (227g)' },
  { id: 'C20', expect: 'unsafe', why: 'malt flavoring', ocrText: 'CORN FLAKES\nINGREDIENTS: Milled corn, sugar, malt flavoring, salt.\nNET WT 12 OZ (340g)' },
  { id: 'C22', expect: 'unsafe', why: 'barley malt syrup beside natural flavor', ocrText: 'HONEY RICE CRISPS\nINGREDIENTS: Rice, sugar, barley malt syrup, honey, natural flavor, salt.\nNET WT 10 OZ (283g)' },
  // Retired claim-rule cases (decision 006): their only caution was an ingredient that is no longer a reason
  { id: 'C23', expect: 'safe', why: 'was gf-claim #11 — no claim + natural flavors (decision 006: not a reason)', ocrText: 'SEA SALT & VINEGAR POTATO CHIPS\nINGREDIENTS: Potatoes, vegetable oil (sunflower, canola), sea salt, vinegar powder, natural flavors, citric acid.\nNET WT 5 OZ (142g)\nDistributed by Example Foods Co.' },
  { id: 'C24', expect: 'safe', why: 'was gf-claim #17 — "Wheat-Free" + natural flavors', ocrText: 'COCONUT SNACK BITES\nWheat-Free\nINGREDIENTS: Coconut, tapioca starch, cane sugar, natural flavors, sea salt.\nNET WT 4 OZ (113g)' },
  { id: 'C25', expect: 'safe', why: 'was gf-claim #18 — "Gluten Friendly" + maltodextrin + natural flavors', ocrText: 'KITCHEN CRAFTED VEGGIE STRAWS\nGluten Friendly\nINGREDIENTS: Potato starch, potato flour, sunflower oil, maltodextrin, natural flavors, salt, spinach powder, tomato powder.\nNET WT 6 OZ (170g)' },
  // PR #32 grill (fresh-eyes Opus review) — the gaps the old ambiguous-ingredient cautions were hiding
  { id: 'C26', expect: 'not-safe', why: '"CONTAINS: WHEAT." declares the wheat inside the modified food starch (FALCPA)', ocrText: 'VANILLA PUDDING MIX\nINGREDIENTS: Sugar, modified food starch, salt, natural and artificial flavor, color added.\nCONTAINS: WHEAT.' },
  { id: 'C27', expect: 'not-safe', why: 'glucose syrup labeled with its wheat source names wheat (the EU exemption call is out of scope)', ocrText: 'FRUIT GUMMIES\nINGREDIENTS: Glucose syrup (wheat), sugar, gelatine, citric acid, natural flavouring.\nNet weight 150 g' },
  { id: 'C28', expect: 'caution', reason: 'undeclared_source', why: 'T3 — chicken soup: chicken mid-list, no USDA legend', ocrText: 'CHICKEN & RICE SOUP\nINGREDIENTS: Water, carrots, cooked white rice, chicken meat, celery, salt, modified food starch, natural flavor, spices.\nNET WT 18.6 OZ (527g)' },
  { id: 'C29', expect: 'caution', reason: 'undeclared_source', why: 'T3 — frozen meal: turkey + seasoning, no USDA legend', ocrText: 'TURKEY & WILD RICE BOWL\nINGREDIENTS: Cooked wild rice, turkey, water, carrots, seasoning (salt, spices, natural flavor), modified corn starch, onion powder.\nKeep frozen. NET WT 10 OZ (283g)' },
  { id: 'C30', expect: 'not-safe', why: 'malt vinegar beside maltodextrin — "malt" hiding in a longer word', ocrText: 'SALT & MALT VINEGAR CHIPS\nINGREDIENTS: Potatoes, sunflower oil, malt vinegar powder (maltodextrin, malt vinegar), salt, natural flavor.\nNET WT 5 OZ (142g)' },
  { id: 'C31', expect: 'safe', why: 'German "Aroma"', ocrText: 'KARTOFFELCHIPS\nZUTATEN: Kartoffeln, Sonnenblumenöl, Salz, Aroma.\nNettofüllmenge 150 g' },
];

export const BARCODE_CALIBRATION_CASES = [
  { id: 'BC1', expect: 'safe', why: 'natural flavors + maltodextrin, no tags', product: { product_name: 'Sour Cream & Onion Chips', ingredients_text: 'potatoes, sunflower oil, maltodextrin, salt, onion powder, natural flavors, citric acid.', allergens_tags: [], traces_tags: [], labels_tags: [], source: 'openfoodfacts' } },
  { id: 'BC2', expect: 'safe', why: 'French arôme + amidon modifié', product: { product_name: 'Galettes de riz', ingredients_text: 'riz, huile de tournesol, amidon modifié, sel, arôme.', allergens_tags: [], traces_tags: [], labels_tags: [], source: 'openfoodfacts' } },
  { id: 'BC7', expect: 'safe', why: 'spices + dextrin + caramel color', product: { product_name: 'Chili Seasoning Mix', ingredients_text: 'chili pepper, spices, salt, dextrin, caramel color, garlic.', allergens_tags: [], traces_tags: [], labels_tags: [], source: 'openfoodfacts' } },
  { id: 'BC3', expect: 'caution', reason: 'oats', why: 'plain oats, no label, no gluten tag', product: { product_name: 'Oat Clusters', ingredients_text: 'whole grain oats, honey, sunflower oil, salt.', allergens_tags: [], traces_tags: [], labels_tags: [], source: 'openfoodfacts' } },
  { id: 'BC4', expect: 'caution', reason: 'may_contain', why: 'gluten trace tag on a clean list', product: { product_name: 'Rice Cakes', ingredients_text: 'brown rice, salt, natural flavor.', allergens_tags: [], traces_tags: ['en:gluten'], labels_tags: [], source: 'openfoodfacts' } },
  { id: 'BC5', expect: 'caution', reason: 'undeclared_source', why: 'T3 — pork sausage, spices + flavorings', product: { product_name: 'Breakfast Pork Sausage', ingredients_text: 'pork, water, salt, spices, sugar, natural flavorings.', allergens_tags: [], traces_tags: [], labels_tags: [], source: 'openfoodfacts' } },
  { id: 'BC6', expect: 'unsafe', why: 'malt extract', product: { product_name: 'Chocolate Malt Drink', ingredients_text: 'sugar, cocoa, malt extract, milk powder, natural flavor.', allergens_tags: ['en:gluten', 'en:milk'], traces_tags: [], labels_tags: [], source: 'openfoodfacts' } },
  { id: 'BC8', expect: 'caution', reason: 'incomplete', why: 'placeholder ingredient text', product: { product_name: 'Snack Mix', ingredients_text: 'see package.', allergens_tags: [], traces_tags: [], labels_tags: [], source: 'openfoodfacts' } },
  { id: 'BC9', expect: 'safe', why: 'was B10 — no label + natural flavors, no oats', product: { product_name: 'Sea Salt & Vinegar Potato Chips', ingredients_text: 'potatoes, vegetable oil (sunflower, canola), sea salt, vinegar powder, natural flavors, citric acid.', allergens_tags: [], traces_tags: [], labels_tags: ['en:vegan'], source: 'openfoodfacts' } },
  // PR #32 grill
  { id: 'BC10', expect: 'not-safe', reason: 'conflict', why: 'unlabeled record, gluten allergen tag nothing in the list explains — may be the package\'s "Contains: wheat"', product: { product_name: 'Vanilla Pudding Mix', ingredients_text: 'sugar, modified food starch, salt, natural and artificial flavor, color added.', allergens_tags: ['en:gluten'], traces_tags: [], labels_tags: [], source: 'openfoodfacts' } },
  { id: 'BC11', expect: 'caution', reason: 'undeclared_source', why: 'T3 — canned chili, beef mid-list', product: { product_name: 'Chili with Beans', ingredients_text: 'water, beans, beef, tomato paste, chili pepper, onion, salt, spices, modified corn starch, natural flavors.', allergens_tags: [], traces_tags: [], labels_tags: [], source: 'openfoodfacts' } },
  { id: 'BC12', expect: 'not-safe', why: 'malt vinegar', product: { product_name: 'Salt & Vinegar Crisps', ingredients_text: 'potatoes, sunflower oil, malt vinegar powder (maltodextrin, malt vinegar), salt.', allergens_tags: [], traces_tags: [], labels_tags: [], source: 'openfoodfacts' } },
  { id: 'BC13', expect: 'caution', reason: 'incomplete', why: 'USDA record (no allergen data, "Contains" line may be missing) + modified food starch', product: { product_name: 'Ranch Dip Mix', ingredients_text: 'buttermilk powder, modified food starch, salt, natural flavor.', allergens_tags: null, traces_tags: null, labels_tags: [], source: 'usda' } },
];
