/**
 * Extra cases for the Jev fast-path live eval (decision 007): the shapes the
 * 30 frozen barcode cases never put in front of Jev. Grill, 2026-09-24:
 *   - a may-contain line with no grain word;
 *   - soy sauce;
 *   - non-English lists, including grain words GLUTEN_GRAIN_PATTERN misses;
 *   - a free-text cereal trace tag.
 * Two safe controls show the fast path still settles something.
 *
 * Every product is SYNTHETIC: records written for this eval in the shape Open
 * Food Facts returns, never a real user's scan. `expect` follows the other
 * case files. The fast-path runner fails only a settled `safe` on a case not
 * expected safe; Claude's verdicts on these records are not graded here.
 */
const off = (ingredients_text, tags = {}) => ({
  source: 'openfoodfacts',
  ingredients_text,
  allergens_tags: [],
  traces_tags: [],
  labels_tags: [],
  ...tags,
});

export const JEV_FAST_PATH_CASES = [
  { id: 'F1', expect: 'not-safe', why: 'may-contain line naming no grain ("flour")', product: off('sugar, cocoa butter, whole milk powder, soy lecithin, vanilla extract. May also contain traces of flour.') },
  { id: 'F2', expect: 'caution', reason: 'undeclared_source', why: 'soy sauce with no wheat declaration', product: off('cooked rice, water, soy sauce (water, soybeans, salt), rice vinegar, sesame oil.') },
  { id: 'F3', expect: 'not-safe', why: 'German may-contain line (Weizen)', product: off('Zucker, Kakaobutter, Vollmilchpulver, Emulgator: Lecithine (Soja), Vanilleextrakt. Kann Spuren von Weizen enthalten.') },
  { id: 'F4', expect: 'not-safe', why: 'compound grain word the pattern misses (Hartweizengrieß, durum semolina)', product: off('Hartweizengrieß, Wasser.') },
  { id: 'F5', expect: 'not-safe', why: 'Polish wheat flour (mąka pszenna), in neither the pattern nor the belts', product: off('mąka pszenna, woda, drożdże, sól.') },
  { id: 'F6', expect: 'not-safe', why: 'clean list with a free-text cereal trace tag', product: off('sugar, cocoa butter, whole milk powder, hazelnuts, soy lecithin.', { traces_tags: ['fr:Cereali'] }) },
  { id: 'F7', expect: 'not-safe', why: 'French wheat typed without its accent (farine de ble)', product: off('farine de ble, sucre, beurre, sel.') },
  { id: 'F8', expect: 'not-safe', why: 'Italian may-contain line (frumento)', product: off('zucchero, burro di cacao, latte intero in polvere, emulsionante: lecitina di soia. Può contenere tracce di frumento.') },
  { id: 'F9', expect: 'safe', why: 'control: plain French potato crisps', product: off('pommes de terre, huile de tournesol, sel.') },
  { id: 'F10', expect: 'safe', why: 'control: plain Spanish rice cakes', product: off('arroz integral, aceite de girasol, sal marina.') },
];
