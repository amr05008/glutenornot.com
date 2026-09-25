import { describe, it, expect, vi } from 'vitest';
import {
  JEV_API_URL,
  JEV_MODEL,
  JEV_TIMEOUT_MS,
  JEV_QUESTIONS,
  JEV_SOURCES,
  JEV_DANGER,
  SOURCE_AT,
  CLEAR_BELOW,
  LIST_OK_AT,
  jevMode,
  buildJevRequest,
  askJev,
} from '../../../api/_jev.js';

// The request the TypeSafe SDK 0.6.0 sends for these questions, captured once
// from the SDK with a fake fetch (client.systemOne → POST /v1/systemone; noul()
// drops its undefined `criteria` when serialized). Byte-for-byte, key order
// included: the bake-off graded exactly this payload on unseen data.
const SDK_BODY = {
  model: 'jev-1.13.0',
  state: { ingredients: 'water, sugar' },
  questions: {
    wheat: { type: 'noul', instructions: 'Does the list include wheat or a wheat-derived ingredient, including spelt, kamut, durum, farro, triticale, or semolina made from wheat? Semolina made from rice, corn or maize does not count. `ingredients` is a food product\'s ingredient list and may be in any language.' },
    barley: { type: 'noul', instructions: 'Does the list include barley or a barley-derived ingredient, including malt, malt extract, malt syrup or malt vinegar? `ingredients` is a food product\'s ingredient list and may be in any language.' },
    rye: { type: 'noul', instructions: 'Does the list include rye or a rye-derived ingredient? `ingredients` is a food product\'s ingredient list and may be in any language.' },
    other_source: { type: 'noul', instructions: 'Does the list name gluten itself, seitan, brewer\'s yeast, or another gluten-containing ingredient not made from wheat, barley, rye or oats? `ingredients` is a food product\'s ingredient list and may be in any language.' },
    oats: { type: 'noul', instructions: 'Does the list include oats that are not described as gluten-free? `ingredients` is a food product\'s ingredient list and may be in any language.' },
    may_contain: { type: 'noul', instructions: 'Does the list carry a warning that the product may contain, or is produced alongside, gluten or a gluten-containing cereal? `ingredients` is a food product\'s ingredient list and may be in any language.' },
    meat_poultry: { type: 'noul', instructions: 'Judging from the list, is this product mainly or partly made of meat or poultry, such as a sausage, a soup or meal with chicken, or chili with beef? `ingredients` is a food product\'s ingredient list and may be in any language.' },
    soy_sauce: { type: 'noul', instructions: 'Does the list include soy sauce, tamari or shoyu that is not described as gluten-free? `ingredients` is a food product\'s ingredient list and may be in any language.' },
    yeast_extract: { type: 'noul', instructions: 'Does the list include yeast extract or autolyzed yeast whose source is not stated? `ingredients` is a food product\'s ingredient list and may be in any language.' },
    is_ingredient_list: { type: 'noul', instructions: 'Is this text a food product\'s list of ingredients, rather than nutrition figures, directions for use, medicine instructions, marketing text or other unrelated text? `ingredients` is the text of a food database\'s ingredients field and may be in any language.' },
    looks_complete: { type: 'noul', instructions: 'Does the ingredient list appear complete, ending where a list normally ends, rather than stopping mid-word, mid-ingredient or inside an unclosed bracket? `ingredients` is the text of a food database\'s ingredients field and may be in any language.' },
  },
};

const QUESTION_NAMES = Object.keys(SDK_BODY.questions);

function scoresAll(value) {
  return Object.fromEntries(QUESTION_NAMES.map((k) => [k, value]));
}

function jevResponse({ model = JEV_MODEL, scores = scoresAll(0.1), status = 200 } = {}) {
  const answers = Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, { type: 'noul', noul: v }]));
  return new Response(JSON.stringify({ model, answers, usage: { input_tokens: 900, output_tokens: 200 } }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Jev constants (plans/jev-fast-path-2026-09-24.md F7)', () => {
  it('hardcodes the base URL and pins the model — never from the environment, never jev-latest', () => {
    expect(JEV_API_URL).toBe('https://api.typesafe.ai/v1/systemone');
    expect(JEV_MODEL).toBe('jev-1.13.0');
    expect(JEV_TIMEOUT_MS).toBe(800);
  });

  it('keeps the bake-off thresholds (experiment 03 + v2)', () => {
    expect(SOURCE_AT).toBe(0.5);
    expect(CLEAR_BELOW).toBe(0.2);
    expect(LIST_OK_AT).toBe(0.8);
  });

  it('ports the v2 questions verbatim, in the graded order', () => {
    expect(JEV_QUESTIONS).toEqual(SDK_BODY.questions);
    expect(Object.keys(JEV_QUESTIONS)).toEqual(QUESTION_NAMES);
  });

  it('names the gluten-source questions and the danger set (everything but list quality)', () => {
    expect(JEV_SOURCES).toEqual(['wheat', 'barley', 'rye', 'other_source']);
    expect(JEV_DANGER).toEqual(QUESTION_NAMES.filter((k) => k !== 'is_ingredient_list' && k !== 'looks_complete'));
    expect(JEV_DANGER).toContain('oats');
    expect(JEV_DANGER).toContain('may_contain');
  });
});

describe('jevMode (F3)', () => {
  it('defaults to off', () => {
    expect(jevMode(undefined)).toBe('off');
    expect(jevMode('')).toBe('off');
  });

  it('accepts the four modes, case- and space-insensitively', () => {
    expect(jevMode('shadow')).toBe('shadow');
    expect(jevMode(' Unsafe ')).toBe('unsafe');
    expect(jevMode('FULL')).toBe('full');
    expect(jevMode('off')).toBe('off');
  });

  it('treats anything else as off, so a typo can never serve Jev', () => {
    expect(jevMode('ful')).toBe('off');
    expect(jevMode('on')).toBe('off');
    expect(jevMode('1')).toBe('off');
  });
});

describe('buildJevRequest (payload pinned to the SDK)', () => {
  it('builds the byte-identical body the SDK sends', () => {
    const { url, init } = buildJevRequest('water, sugar', 'sk-test');
    expect(url).toBe('https://api.typesafe.ai/v1/systemone');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify(SDK_BODY));
  });

  it('sends bearer auth and JSON headers, nothing identifying the user', () => {
    const { init } = buildJevRequest('water, sugar', 'sk-test');
    expect(init.headers).toEqual({
      Authorization: 'Bearer sk-test',
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'GlutenOrNot/1.0 (https://glutenornot.com)',
    });
  });

  it('sends only the ingredient text as state', () => {
    const { init } = buildJevRequest('wheat flour, salt', 'sk-test');
    const body = JSON.parse(init.body);
    expect(Object.keys(body)).toEqual(['model', 'state', 'questions']);
    expect(body.state).toEqual({ ingredients: 'wheat flour, salt' });
  });
});

describe('askJev', () => {
  it('returns every score on a good answer', async () => {
    const scores = { ...scoresAll(0.05), wheat: 0.97 };
    const fetchImpl = vi.fn().mockResolvedValue(jevResponse({ scores }));
    const r = await askJev('wheat flour', { fetchImpl, apiKey: 'sk-test' });
    expect(r.outcome).toBe('ok');
    expect(r.scores).toEqual(scores);
    expect(typeof r.ms).toBe('number');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(JEV_API_URL);
    expect(JSON.parse(init.body).state).toEqual({ ingredients: 'wheat flour' });
  });

  it('trims the text before sending (the bake-off sent it trimmed)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jevResponse());
    await askJev('  rice, water \n', { fetchImpl, apiKey: 'sk-test' });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).state.ingredients).toBe('rice, water');
  });

  it('passes an abort signal so the 800 ms budget is enforced', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jevResponse());
    await askJev('rice', { fetchImpl, apiKey: 'sk-test' });
    expect(fetchImpl.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('never calls out without a key', async () => {
    const fetchImpl = vi.fn();
    const r = await askJev('rice', { fetchImpl, apiKey: '' });
    expect(r.outcome).toBe('error');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reads a hang past the budget as a timeout, with no retry', async () => {
    const fetchImpl = vi.fn((url, init) => new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason));
    }));
    const r = await askJev('rice', { fetchImpl, apiKey: 'sk-test', timeoutMs: 20 });
    expect(r.outcome).toBe('timeout');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('reads an HTTP error as an error, with no retry', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{"error":"overloaded"}', { status: 503 }));
    const r = await askJev('rice', { fetchImpl, apiKey: 'sk-test' });
    expect(r.outcome).toBe('error');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('reads a network failure as an error', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    expect((await askJev('rice', { fetchImpl, apiKey: 'sk-test' })).outcome).toBe('error');
  });

  it('rejects an answer from any other model: the thresholds were graded on jev-1.13.0', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jevResponse({ model: 'jev-1.14.0' }));
    expect((await askJev('rice', { fetchImpl, apiKey: 'sk-test' })).outcome).toBe('error');
  });

  it('rejects an answer missing a question', async () => {
    const scores = scoresAll(0.1);
    delete scores.looks_complete;
    const fetchImpl = vi.fn().mockResolvedValue(jevResponse({ scores }));
    expect((await askJev('rice', { fetchImpl, apiKey: 'sk-test' })).outcome).toBe('error');
  });

  it('rejects a score that is not a probability', async () => {
    for (const bad of [null, '0.1', -0.1, 1.5, Number.NaN]) {
      const fetchImpl = vi.fn().mockResolvedValue(jevResponse({ scores: { ...scoresAll(0.1), wheat: bad } }));
      expect((await askJev('rice', { fetchImpl, apiKey: 'sk-test' })).outcome, String(bad)).toBe('error');
    }
  });

  it('rejects a body that is not JSON', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('<html>', { status: 200 }));
    expect((await askJev('rice', { fetchImpl, apiKey: 'sk-test' })).outcome).toBe('error');
  });

  it('never logs the key or the ingredient text', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = vi.fn().mockResolvedValue(new Response('boom sk-test secret-ingredient', { status: 500 }));
    await askJev('secret-ingredient', { fetchImpl, apiKey: 'sk-test' });
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain('sk-test');
    expect(logged).not.toContain('secret-ingredient');
    warn.mockRestore();
  });
});
