import { describe, it, expect } from 'vitest';
import {
  decideFastPath,
  fastPathGate,
  blocksFastPathSafe,
  isGlutenFamilyTag,
} from '../../../api/barcode.js';
import { JEV_QUESTIONS, JEV_DANGER } from '../../../api/_jev.js';
import { JEV_BAKEOFF } from '../fixtures/jev-bakeoff-records.js';

// Every question clear, the text a complete ingredient list.
const CLEAR = Object.fromEntries(Object.keys(JEV_QUESTIONS).map((k) => [k, 0.02]));
CLEAR.is_ingredient_list = 0.97;
CLEAR.looks_complete = 0.95;
const scores = (over = {}) => ({ ...CLEAR, ...over });
const WHEAT = scores({ wheat: 0.99 });

const off = (over = {}) => ({
  source: 'openfoodfacts',
  ingredients_text: 'rice, water, sea salt.',
  allergens_tags: [],
  traces_tags: [],
  labels_tags: [],
  ...over,
});

describe('decideFastPath: the settled verdicts', () => {
  it('settles a clean, complete list safe, with the templated result', () => {
    const d = decideFastPath(off(), CLEAR);
    expect(d).toEqual({
      settled: true,
      via: 'safe',
      result: {
        mode: 'label',
        verdict: 'safe',
        flagged_ingredients: [],
        allergen_warnings: [],
        explanation: "No gluten ingredients are listed, and there's no may-contain warning.",
        confidence: 'medium',
        engine: 'jev',
      },
    });
  });

  it('settles a listed gluten grain unsafe, naming it (T2: high confidence)', () => {
    const d = decideFastPath(off({ ingredients_text: 'enriched wheat flour, sugar, salt.' }), WHEAT);
    expect(d).toEqual({
      settled: true,
      via: 'unsafe',
      result: {
        mode: 'label',
        verdict: 'unsafe',
        flagged_ingredients: ['wheat'],
        allergen_warnings: [],
        explanation: 'This product lists wheat, which contains gluten.',
        confidence: 'high',
        engine: 'jev',
      },
    });
  });

  it.each([
    ['farine de blé, sucre, sel.', 'blé (wheat)'],
    ['Weizenmehl, Zucker, Salz.', 'weizenmehl (wheat)'],
    ['tarwebloem, suiker, zout.', 'tarwebloem (wheat)'],
    ['harina de trigo, azúcar, sal.', 'trigo (wheat)'],
    ['farina di frumento, zucchero, sale.', 'frumento (wheat)'],
    ['farinha de trigo, açúcar.', 'trigo (wheat)'],
    ['Roggenmehl, Wasser, Salz.', 'roggenmehl (rye)'],
    ['flocons d\'orge, sucre.', 'orge (barley)'],
    ['sémola de trigo duro, agua.', 'sémola (semolina)'],
    ['ENRICHED WHEAT FLOUR, SUGAR.', 'wheat'],
    ['orzo, olive oil, salt.', 'orzo'],
  ])('names the grain in the app\'s "original (english)" style: %s', (text, flagged) => {
    const d = decideFastPath(off({ ingredients_text: text }), scores({ wheat: 0.99, barley: 0.99, rye: 0.99 }));
    expect(d.result.verdict).toBe('unsafe');
    expect(d.result.flagged_ingredients).toEqual([flagged]);
    expect(d.result.explanation).toBe(`This product lists ${flagged}, which contains gluten.`);
  });

  it('prefers a specific grain over farina, which is only "flour" in Italian', () => {
    const d = decideFastPath(off({ ingredients_text: 'farina di grano, farina di frumento.' }), WHEAT);
    expect(d.result.flagged_ingredients).toEqual(['frumento (wheat)']);
  });

  it('settles on any gluten-source question, not just wheat', () => {
    expect(decideFastPath(off({ ingredients_text: 'barley malt extract, rice.' }), scores({ barley: 0.95 })).result.verdict).toBe('unsafe');
    expect(decideFastPath(off({ ingredients_text: 'rye flour, water.' }), scores({ rye: 0.9 })).result.verdict).toBe('unsafe');
    expect(decideFastPath(off({ ingredients_text: 'seitan, soy.' }), scores({ other_source: 0.9 })).result.verdict).toBe('unsafe');
  });

  it('does not let a gluten allergen tag block unsafe (OFF tags nearly every wheat product en:gluten)', () => {
    const d = decideFastPath(off({ ingredients_text: 'wheat flour, salt.', allergens_tags: ['en:gluten'] }), WHEAT);
    expect(d.result.verdict).toBe('unsafe');
  });
});

describe('decideFastPath: thresholds', () => {
  const wheatText = off({ ingredients_text: 'wheat flour, salt.' });

  it('counts a source question at exactly 0.5 as present, below it as absent', () => {
    expect(decideFastPath(wheatText, scores({ wheat: 0.5 })).via).toBe('unsafe');
    expect(decideFastPath(wheatText, scores({ wheat: 0.49 })).settled).toBe(false);
  });

  it('lets a may-contain score of 0.5 or more block unsafe (the grain may be inside the warning)', () => {
    const text = off({ ingredients_text: 'sugar, cocoa butter. May contain wheat.' });
    expect(decideFastPath(text, scores({ wheat: 0.8, may_contain: 0.5 })).settled).toBe(false);
    expect(decideFastPath(text, scores({ wheat: 0.8, may_contain: 0.49 })).via).toBe('unsafe');
  });

  it.each(JEV_DANGER)('blocks safe when %s is 0.2 or more, and not at 0.19', (name) => {
    expect(decideFastPath(off(), scores({ [name]: 0.2 }))).toEqual({ settled: false, via: 'not_clear' });
    expect(decideFastPath(off(), scores({ [name]: 0.19 })).via).toBe('safe');
  });

  it('needs both list-quality scores at 0.8 or more for safe', () => {
    expect(decideFastPath(off(), scores({ is_ingredient_list: 0.79 }))).toEqual({ settled: false, via: 'list_quality' });
    expect(decideFastPath(off(), scores({ looks_complete: 0.79 }))).toEqual({ settled: false, via: 'list_quality' });
    expect(decideFastPath(off(), scores({ is_ingredient_list: 0.8, looks_complete: 0.8 })).via).toBe('safe');
  });

  it('never needs list quality for unsafe: a cut can hide gluten, not remove a listed grain', () => {
    const d = decideFastPath(off({ ingredients_text: 'wheat flour, sugar, CO' }), scores({ wheat: 0.99, looks_complete: 0.05 }));
    expect(d.via).toBe('unsafe');
  });
});

describe('decideFastPath: neither signal alone settles anything', () => {
  it('Jev alone never settles unsafe: the grain pattern must name it too', () => {
    // "Hartweizengrieß" (durum semolina): Jev knows it's wheat, the pattern
    // doesn't match mid-word, so no unsafe. (The safe-side belt names it.)
    const d = decideFastPath(off({ ingredients_text: 'Hartweizengrieß, Wasser.' }), WHEAT);
    expect(d).toEqual({ settled: false, via: 'pattern_match' });
    // Polish "pszenna" (wheat) isn't in the pattern either: no unsafe (the belt names it).
    expect(decideFastPath(off({ ingredients_text: 'mąka pszenna, woda, sól.' }), WHEAT)).toEqual({ settled: false, via: 'pattern_match' });
  });

  it('the pattern alone never settles unsafe, and any match blocks safe', () => {
    const d = decideFastPath(off({ ingredients_text: 'semoule de riz, eau, sel.' }), CLEAR);
    expect(d).toEqual({ settled: false, via: 'pattern_match' });
  });

  it('maltodextrin is not a pattern match (malt is matched whole)', () => {
    expect(decideFastPath(off({ ingredients_text: 'maltodextrin, rice flour, salt.' }), CLEAR).via).toBe('safe');
  });

  it('buckwheat is not a pattern match', () => {
    expect(decideFastPath(off({ ingredients_text: 'buckwheat flour, water, salt.' }), CLEAR).via).toBe('safe');
  });
});

describe('decideFastPath: T3, a wheat-derived glucose syrup or dextrose falls through', () => {
  it.each([
    'glucose syrup (wheat), sugar, cocoa butter.',
    'wheat glucose syrup, sugar.',
    'dextrose (wheat), salt.',
    'sirop de glucose de blé, sucre.',
    'dextrose de blé et maïs, sel.',
    'Glukosesirup (Weizen), Zucker.',
    'Weizenglukosesirup, Zucker.',
    'glucosestroop (tarwe), suiker.',
    'jarabe de glucosa de trigo, azúcar.',
    'sciroppo di glucosio di frumento, zucchero.',
    'destrosio di frumento, sale.',
    'xarope de glicose de trigo, açúcar.',
  ])('%s', (text) => {
    expect(decideFastPath(off({ ingredients_text: text }), WHEAT)).toEqual({ settled: false, via: 'wheat_sugar' });
  });

  it('still settles unsafe on a real grain next to a wheat sugar, naming the real one', () => {
    const d = decideFastPath(off({ ingredients_text: 'glucose syrup (wheat), wheat flour, sugar.' }), WHEAT);
    expect(d.via).toBe('unsafe');
    expect(d.result.flagged_ingredients).toEqual(['wheat']);
  });

  it('errs toward falling through when a grain and a sugar share one ingredient entry', () => {
    const d = decideFastPath(off({ ingredients_text: 'farine de blé et sirop de glucose, sel.' }), WHEAT);
    expect(d).toEqual({ settled: false, via: 'wheat_sugar' });
  });

  it('a wheat sugar still blocks safe when Jev scores it clear', () => {
    expect(decideFastPath(off({ ingredients_text: 'glucose syrup (wheat), sugar.' }), CLEAR)).toEqual({ settled: false, via: 'pattern_match' });
  });
});

describe('decideFastPath: the multilingual gluten-tag check blocks safe', () => {
  it('blocks on en:gluten in allergens or traces', () => {
    expect(decideFastPath(off({ traces_tags: ['en:gluten'] }), CLEAR)).toEqual({ settled: false, via: 'gluten_tag' });
  });

  it.each(JEV_BAKEOFF.missedTagForms.map((t) => [t.tag, t.field]))(
    'blocks on %s (%s), a form the shared isGlutenFamilyTag misses',
    (tag, field) => {
      expect(isGlutenFamilyTag(tag)).toBe(false);
      expect(blocksFastPathSafe(tag)).toBe(true);
      expect(decideFastPath(off({ [field]: [tag] }), CLEAR)).toEqual({ settled: false, via: 'gluten_tag' });
    }
  );

  it.each(['en:Gluten', 'hu:glutén', 'es:glúten', 'de:glutenhaltig', 'fi:gluteeni', 'en:wheat', 'en:spelt', 'de:dinkel', 'en:oats', 'de:hafer', 'fr:avoine'])(
    'blocks on %s',
    (tag) => {
      expect(blocksFastPathSafe(tag)).toBe(true);
    }
  );

  it.each([
    'en:milk', 'en:eggs', 'en:nuts', 'en:peanuts', 'en:soybeans', 'en:sesame-seeds', 'en:celery', 'en:mustard',
    'en:lupin', 'en:fish', 'en:crustaceans', 'en:molluscs', 'en:sulphur-dioxide-and-sulphites', 'en:none',
    'en:apple', 'en:orange', 'en:banana', 'en:gelatin',
  ])('lets %s through: an allowlisted id that is not a gluten source', (tag) => {
    expect(blocksFastPathSafe(tag)).toBe(false);
    expect(decideFastPath(off({ traces_tags: [tag], allergens_tags: [tag] }), CLEAR).via).toBe('safe');
  });
});

describe('decideFastPath: the tag check fails closed (grill, 2026-09-24)', () => {
  // Jev reads only the ingredient text, so a tag is the code's call alone: any
  // tag not on the allowlist blocks safe. Each of these settled safe under the
  // first cut's gluten denylist; fr:Cereali, nl:Granen and "Et produits à base
  // de ces céréales" are in the bake-off's real sample.
  it.each([
    'fr:Cereali', 'nl:Granen', 'de:Getreide', 'en:cereals', 'es:cereales', 'fr:céréales',
    'fr:Et produits à base de ces céréales', 'pl:pszenica', 'sv:vete', 'da:hvede', 'fi:vehnä',
    'cs:pšenice', 'ru:пшеница', 'ja:小麦', 'de:Hartweizengrieß', 'de:Dinkelmehl', 'de:Malzextrakt',
    'fr:ble', 'fr:epeautre', 'en:buckwheat', 'es:Puede contener trazas de frutos secos soja y sésamo.',
  ])('blocks safe on %s, as a trace or an allergen', (tag) => {
    expect(blocksFastPathSafe(tag)).toBe(true);
    expect(decideFastPath(off({ traces_tags: [tag] }), CLEAR).settled).toBe(false);
    expect(decideFastPath(off({ allergens_tags: [tag] }), CLEAR).settled).toBe(false);
  });

  it('names a recognized gluten form gluten_tag and anything else unknown_tag', () => {
    expect(decideFastPath(off({ traces_tags: ['en:Glutine'] }), CLEAR).via).toBe('gluten_tag');
    expect(decideFastPath(off({ traces_tags: ['fr:Cereali'] }), CLEAR).via).toBe('unknown_tag');
    expect(decideFastPath(off({ traces_tags: ['fr:Cereali', 'en:gluten'] }), CLEAR).via).toBe('gluten_tag');
  });

  it('is case-sensitive on the allowlist: a crowd-typed form is unknown', () => {
    expect(blocksFastPathSafe('en:Milk')).toBe(true);
    expect(blocksFastPathSafe('fr:lait')).toBe(true);
  });

  it('blocks on a tag that is not a string', () => {
    expect(blocksFastPathSafe(null)).toBe(true);
    expect(blocksFastPathSafe(42)).toBe(true);
  });

  it('still never blocks unsafe', () => {
    const d = decideFastPath(off({ ingredients_text: 'wheat flour, salt.', traces_tags: ['fr:Cereali'] }), WHEAT);
    expect(d.via).toBe('unsafe');
  });
});

describe('decideFastPath: word belts on the text side of safe (grill, 2026-09-24)', () => {
  // Jev alone would decide these; each one gets a deterministic belt too.
  // None of the 173 safes in the bake-off replay trips one.
  it.each([
    ['plain oats', 'whole grain oats, honey, sea salt.'],
    ['a gluten word', 'Zucker, Kakaobutter. Kann Spuren von Gluten enthalten.'],
    ['a gluten word, accented', 'azúcar, cacao. Puede contener glúten.'],
    ['a cereal word', 'sugar, cocoa butter. May contain other cereals.'],
    ['a cereal word (fr)', 'sucre, beurre de cacao. Traces de céréales.'],
    ['a compound grain (durum)', 'Hartweizengrieß, Wasser.'],
    ['a compound grain (spelt)', 'Dinkelmehl, Wasser, Salz.'],
    ['a compound grain (whole wheat)', 'Vollkornweizenmehl, Wasser, Hefe.'],
    ['a compound grain (malt)', 'Malzextrakt, Zucker.'],
    ['malted', 'sugar, malted milk powder, cocoa.'],
    ['a compound grain (nl malt)', 'moutextract, suiker.'],
    ['teriyaki', 'tofu, teriyaki sauce, sesame seeds.'],
    ['blé without its accent', 'farine de ble, sucre, sel.'],
    ['épeautre without its accent', 'farine d\'epeautre, eau.'],
    ['épeautre, decomposed Unicode', 'farine d\'e\u0301peautre, eau.'],
    ['blé, decomposed Unicode', 'farine de ble\u0301, sucre.'],
    ['wholewheat', 'wholewheat flour, water, yeast.'],
    ['wheatgerm', 'oil, wheatgerm, salt.'],
    ['maltextract', 'sugar, maltextract, cocoa.'],
    ['barleymalt', 'water, barleymalt syrup.'],
    ['oatmilk', 'oatmilk, cocoa, sugar.'],
    ['Finnish oats (kaura)', 'kaurahiutale, vesi, suola.'],
    ['Nordic oats (havre)', 'havre, vatten, salt.'],
    ['Polish wheat (pszenna)', 'mąka pszenna, woda, sól.'],
    ['Polish spelt (orkisz)', 'mąka orkiszowa, woda.'],
    ['Swedish wheat (vete)', 'vete, vatten, salt.'],
    ['Danish wheat (hvede)', 'hvedemel, vand, salt.'],
    ['Finnish wheat (vehnä)', 'vehnäjauho, vesi.'],
    ['noodles', 'vegetables, noodles, soy.'],
    ['breadcrumbs', 'chicken breast, breadcrumbs, oil.'],
    ['panko', 'shrimp, panko, oil.'],
    ['Paniermehl', 'Kartoffeln, Paniermehl, Öl.'],
    ['chapelure', 'poisson, chapelure, huile.'],
    ['freekeh', 'freekeh, olive oil, salt.'],
    ['Grünkern', 'Grünkern, Wasser, Salz.'],
  ])('%s blocks safe', (_, text) => {
    expect(decideFastPath(off({ ingredients_text: text }), CLEAR)).toEqual({ settled: false, via: 'pattern_match' });
  });

  it.each([
    'moutarde, vinaigre, sel.',
    'Buchweizenmehl, Wasser, Salz.',
    'buckwheat flour, water.',
    'maltodextrin, rice flour, salt.',
    'sugar, maltitol, cocoa butter.',
    'pasta de cacao, azúcar.',
    'grano saraceno, acqua.',
    'rice, water, sea salt.',
  ])('%s still settles safe', (text) => {
    expect(decideFastPath(off({ ingredients_text: text }), CLEAR).via).toBe('safe');
  });
});

describe('fastPathGate: records the fast path never judges (a hit means no Jev call)', () => {
  const unsafeRecord = { ingredients_text: 'wheat flour, salt.' };

  it('passes a plain Open Food Facts record', () => {
    expect(fastPathGate(off())).toBeNull();
    expect(fastPathGate(off({ labels_tags: ['en:organic', 'en:vegan', 'fr:ab-agriculture-biologique'] }))).toBeNull();
  });

  it.each([
    ['source', { source: 'usda' }],
    ['source', { source: 'upcitemdb' }],
    ['source', { source: 'nutritionix' }],
    ['no_text', { ingredients_text: '' }],
    ['no_text', { ingredients_text: '   ' }],
    ['no_text', { ingredients_text: null }],
    ['gf_label', { labels_tags: ['en:no-gluten'] }],
    ['label_text', { labels_tags: ['en:contains-gluten'] }],
    ['label_text', { labels_tags: ['en:gluten-free-oats'] }],
    ['label_text', { labels_tags: ['it:senza-glutine'] }],
    ['label_text', { labels_tags: ['es:sin-glúten'] }],
    ['label_text', { labels_tags: ['fr:sans-gluten'] }],
    ['label_text', { labels_tags: ['fr:convient-aux-cœliaques'] }],
    ['label_text', { labels_tags: ['de:für-zöliakie-betroffene'] }],
    ['label_text', { labels_tags: ['nl:geschikt-voor-coeliakie'] }],
    ['label_text', { labels_tags: ['it:adatto-ai-celiachi'] }],
    ['label_text', { labels_tags: ['es:apto-para-celíacos'] }],
    ['signal_note', { allergens_tags: ['en:gluten'] }],
  ])('%s: %j', (via, over) => {
    expect(fastPathGate(off(over))).toBe(via);
    // Whatever Jev would have said, the gate wins.
    expect(decideFastPath(off(over), CLEAR)).toEqual({ settled: false, via });
    if (via !== 'no_text' && via !== 'signal_note') {
      expect(decideFastPath(off({ ...unsafeRecord, ...over }), WHEAT)).toEqual({ settled: false, via });
    }
  });

  it('falls through without scores', () => {
    expect(decideFastPath(off(), null)).toEqual({ settled: false, via: 'no_scores' });
  });
});

describe('decideFastPath on the bake-off\'s reviewed misses (real records, recorded Jev v2 scores)', () => {
  it.each(JEV_BAKEOFF.listQuality.map((r) => [r.id, r]))('%s falls through on list quality', (id, r) => {
    expect(r.opus).toMatch(/^caution/);
    expect(decideFastPath(r.product, r.scores)).toEqual({ settled: false, via: 'list_quality' });
    // It's the list-quality check that holds it: everything else is clear.
    expect(decideFastPath(r.product, { ...r.scores, is_ingredient_list: 0.99, looks_complete: 0.99 }).via).toBe('safe');
  });

  it('the tofu with trace tag en:Glutine falls through on the tag (the graded run\'s false-safe)', () => {
    const { product, scores: s, opus } = JEV_BAKEOFF.tofu;
    expect(product.traces_tags).toContain('en:Glutine');
    expect(opus).toBe('caution/may_contain');
    expect(decideFastPath(product, s)).toEqual({ settled: false, via: 'gluten_tag' });
    // Without the tag, the same record settles safe: the tag check is what holds it.
    expect(decideFastPath({ ...product, traces_tags: [] }, s).via).toBe('safe');
  });

  it('rice semolina never settles unsafe on v2\'s scores (v1 scored it 0.65)', () => {
    const { product, scores: s, v1Wheat } = JEV_BAKEOFF.riceSemolina;
    expect(product.ingredients_text).toContain('semoule de riz');
    expect(s.wheat).toBeLessThan(0.5);
    const d = decideFastPath(product, s);
    expect(d.settled).toBe(false);
    // Without its trace tag, the pattern match still blocks safe.
    expect(decideFastPath({ ...product, traces_tags: [] }, s)).toEqual({ settled: false, via: 'pattern_match' });
    // The rule alone can't tell rice semolina from wheat semolina: v2's
    // narrower wheat question is the fix, so a reworded question is a regression.
    expect(decideFastPath({ ...product, traces_tags: [] }, { ...s, wheat: v1Wheat }).via).toBe('unsafe');
  });

  it('"dextrose de blé" falls through to Claude (T3)', () => {
    const { product, scores: s, opus } = JEV_BAKEOFF.wheatDextrose;
    expect(opus).toBe('caution/undeclared_source');
    expect(s.wheat).toBeGreaterThanOrEqual(0.5);
    expect(decideFastPath(product, s)).toEqual({ settled: false, via: 'wheat_sugar' });
  });
});

describe('fast-path templates carry nothing from the record but the grain word', () => {
  it('the unsafe explanation holds no other ingredient text', () => {
    const d = decideFastPath(off({ ingredients_text: 'secret-sauce, wheat flour, mystery-spice.' }), WHEAT);
    expect(JSON.stringify(d.result)).not.toMatch(/secret|mystery/);
  });

  it('the safe result is the same for every record', () => {
    const a = decideFastPath(off({ ingredients_text: 'rice, water.' }), CLEAR);
    const b = decideFastPath(off({ ingredients_text: 'potatoes, sunflower oil, salt.' }), CLEAR);
    expect(a).toEqual(b);
  });
});

describe('fast-path live-eval cases (offline shape check)', () => {
  it('every extra case is a synthetic Open Food Facts record that reaches Jev (no gate hit)', async () => {
    const { JEV_FAST_PATH_CASES } = await import('./evals/jev-fast-path-cases.js');
    expect(JEV_FAST_PATH_CASES.length).toBeGreaterThanOrEqual(10);
    for (const c of JEV_FAST_PATH_CASES) {
      expect(['safe', 'caution', 'unsafe', 'not-safe'], c.id).toContain(c.expect);
      expect(fastPathGate(c.product), c.id).toBeNull();
    }
    expect(new Set(JEV_FAST_PATH_CASES.map((c) => c.id)).size).toBe(JEV_FAST_PATH_CASES.length);
  });
});
