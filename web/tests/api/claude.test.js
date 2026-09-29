import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  callClaude,
  claudeErrorResponse,
  describeClaudeError,
  ClaudeError,
  CLAUDE_MODEL,
  buildCachedContent,
  OPENROUTER_MODEL,
  OPENROUTER_API_URL,
  OPENROUTER_PROVIDER,
  CLAUDE_ATTEMPT_TIMEOUT_MS,
  CLAUDE_RETRY_DEADLINE_MS,
  CLAUDE_RETRY_DEADLINE_WITH_FALLBACK_MS,
} from '../../../api/_utils.js';

// Build a minimal fetch Response stand-in.
function makeResponse({ ok, status, json, text }) {
  return {
    ok,
    status,
    json: async () => {
      if (typeof json === 'function') return json();
      return json;
    },
    text: async () => (typeof text === 'string' ? text : ''),
  };
}

function okWithText(textContent) {
  return makeResponse({ ok: true, status: 200, json: { content: [{ type: 'text', text: textContent }] } });
}

// No-op sleep + zero backoff so retry tests don't actually wait.
const fast = { baseDelayMs: 0, sleepImpl: async () => {} };

describe('callClaude', () => {
  const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    // These pin the direct path; the fallback has its own block below.
    vi.stubEnv('OPENROUTER_API_KEY', '');
  });

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('returns the text content on a successful response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okWithText('hello world'));
    const result = await callClaude({ maxTokens: 16, content: 'hi' }, { fetchImpl, ...fast });
    expect(result).toEqual({ text: 'hello world', via: 'anthropic' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('finds the text block when a non-text block precedes it', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse({
      ok: true,
      status: 200,
      json: { content: [{ type: 'thinking', thinking: 'hmm' }, { type: 'text', text: 'the verdict' }] },
    }));
    const result = await callClaude({ maxTokens: 16, content: 'hi' }, { fetchImpl, ...fast });
    expect(result.text).toBe('the verdict');
  });

  it('skips an empty-string text block and returns a later non-empty one', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse({
      ok: true,
      status: 200,
      json: { content: [{ type: 'text', text: '' }, { type: 'text', text: 'real content' }] },
    }));
    const result = await callClaude({ maxTokens: 16, content: 'hi' }, { fetchImpl, ...fast });
    expect(result.text).toBe('real content');
  });

  it('throws empty ClaudeError when the only text-bearing block lacks a type', async () => {
    // Intentionally strict: the real Messages API always sets type on blocks,
    // so a type-less block is a malformed response, not content to trust.
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse({
      ok: true,
      status: 200,
      json: { content: [{ text: 'no type field' }] },
    }));
    await expect(callClaude({ maxTokens: 16, content: 'hi' }, { fetchImpl, ...fast }))
      .rejects.toMatchObject({ name: 'ClaudeError', kind: 'empty' });
  });

  it('throws empty ClaudeError when content is not an array', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse({
      ok: true,
      status: 200,
      json: { content: 'oops' },
    }));
    await expect(callClaude({ maxTokens: 16, content: 'hi' }, { fetchImpl, ...fast }))
      .rejects.toMatchObject({ name: 'ClaudeError', kind: 'empty' });
  });

  it('warns when the response was truncated at max_tokens', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse({
      ok: true,
      status: 200,
      json: {
        content: [{ type: 'text', text: '{"verdict": "cau' }],
        stop_reason: 'max_tokens',
        usage: { output_tokens: 16 },
      },
    }));
    const result = await callClaude({ maxTokens: 16, content: 'hi' }, { fetchImpl, ...fast });
    expect(result.text).toBe('{"verdict": "cau');
    expect(warnSpy).toHaveBeenCalledWith(
      'Claude response truncated at max_tokens',
      { maxTokens: 16, outputTokens: 16 }
    );
  });

  it('sends the configured model and api key headers', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okWithText('ok'));
    await callClaude({ maxTokens: 8, content: 'hi' }, { fetchImpl, ...fast });
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(opts.headers['x-api-key']).toBe('test-key');
    const body = JSON.parse(opts.body);
    expect(body.model).toBe(CLAUDE_MODEL);
    expect(body.max_tokens).toBe(8);
  });

  it('throws auth ClaudeError without calling fetch when key is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const fetchImpl = vi.fn();
    await expect(callClaude({ maxTokens: 8, content: 'hi' }, { fetchImpl, ...fast }))
      .rejects.toMatchObject({ name: 'ClaudeError', kind: 'auth' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('retries on 529 (overloaded) and succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(makeResponse({ ok: false, status: 529, text: 'overloaded' }))
      .mockResolvedValueOnce(okWithText('recovered'));
    const result = await callClaude({ maxTokens: 8, content: 'hi' }, { fetchImpl, ...fast });
    expect(result.text).toBe('recovered');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  // Pre-release review 2026-07-27 #2: a hung Anthropic connection held the
  // serverless function until Vercel's 300s kill while the client gave up at
  // 60s. Every attempt must carry an abort signal, and an aborted attempt is
  // transient (overloaded) — it takes the existing retry path.
  it('passes an abort signal to fetch on every attempt', async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }))
      .mockResolvedValueOnce(okWithText('ok'));
    const result = await callClaude({ maxTokens: 16, content: 'hi' }, { fetchImpl, ...fast });
    expect(result.text).toBe('ok');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const call of fetchImpl.mock.calls) {
      expect(call[1].signal).toBeInstanceOf(AbortSignal);
    }
  });

  // Grill follow-up to #2: per-attempt timeouts alone let 3 hung attempts run
  // ~76s, past the OCR client's 60s budget. A total retry deadline stops
  // launching new attempts once the budget is spent, so a fully hung upstream
  // resolves in ~50s of Claude time instead.
  it('stops launching retries once the total retry deadline has passed', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      makeResponse({ ok: false, status: 529, text: 'overloaded' }),
    );
    const sleepImpl = vi.fn(async () => {});
    await expect(
      callClaude({ maxTokens: 16, content: 'hi' }, { fetchImpl, ...fast, sleepImpl, retryDeadlineMs: 0 }),
    ).rejects.toMatchObject({ name: 'ClaudeError', kind: 'overloaded' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    // Grill round 2 (PR #37): out of budget means fail now, not after one more backoff.
    expect(sleepImpl).not.toHaveBeenCalled();
  });

  it('exhausts retries when every attempt times out and throws overloaded', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(
      Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }),
    );
    await expect(callClaude({ maxTokens: 16, content: 'hi' }, { fetchImpl, ...fast }))
      .rejects.toMatchObject({ name: 'ClaudeError', kind: 'overloaded' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('retries on a network error then succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(okWithText('back'));
    const result = await callClaude({ maxTokens: 8, content: 'hi' }, { fetchImpl, ...fast });
    expect(result.text).toBe('back');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('exhausts retries on persistent 529 and throws overloaded', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(makeResponse({ ok: false, status: 529, text: 'overloaded' }));
    await expect(
      callClaude({ maxTokens: 8, content: 'hi' }, { fetchImpl, maxRetries: 2, ...fast })
    ).rejects.toMatchObject({ name: 'ClaudeError', kind: 'overloaded', status: 529 });
    expect(fetchImpl).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  // 2026-07-22: a Cloudflare 522 in front of api.anthropic.com reached a user
  // as CLAUDE_ERROR, unretried. Every 5xx is the server's side of the wire.
  it.each([501, 505, 520, 521, 522, 523, 524, 525, 526, 527])(
    'treats a %i as overloaded and retries it',
    async (s) => {
      const fetchImpl = vi.fn().mockResolvedValue(
        makeResponse({ ok: false, status: s, text: '<html>error code: 522</html>' }),
      );
      await expect(callClaude({ maxTokens: 8, content: 'hi' }, { fetchImpl, ...fast }))
        .rejects.toMatchObject({ kind: 'overloaded', status: s });
      expect(fetchImpl).toHaveBeenCalledTimes(3);
    },
  );

  it.each([402, 408, 409, 413, 422])('keeps a %i as error, unretried', async (s) => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse({ ok: false, status: s, text: 'nope' }));
    await expect(callClaude({ maxTokens: 8, content: 'hi' }, { fetchImpl, ...fast }))
      .rejects.toMatchObject({ kind: 'error', status: s });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('classifies 401 as auth and does not retry', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(makeResponse({ ok: false, status: 401, text: 'invalid x-api-key' }));
    await expect(callClaude({ maxTokens: 8, content: 'hi' }, { fetchImpl, ...fast }))
      .rejects.toMatchObject({ kind: 'auth', status: 401 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('classifies a 400 credit-balance error as credit', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      makeResponse({
        ok: false,
        status: 400,
        text: 'Your credit balance is too low to access the Anthropic API.',
      })
    );
    await expect(callClaude({ maxTokens: 8, content: 'hi' }, { fetchImpl, ...fast }))
      .rejects.toMatchObject({ kind: 'credit', status: 400 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  // 2026-09-24: a Console spend limit answers 400 "specified API usage limits"
  // — billing, like a credit run-out, not our malformed request.
  it('classifies a 400 usage-limit error as credit', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      makeResponse({
        ok: false,
        status: 400,
        text: 'You have reached your specified API usage limits. You will regain access on 2026-10-01 at 00:00 UTC.',
      })
    );
    await expect(callClaude({ maxTokens: 8, content: 'hi' }, { fetchImpl, ...fast }))
      .rejects.toMatchObject({ kind: 'credit', status: 400 });
  });

  // 2026-06-17: a retired pin answers 404 not_found_error.
  it('classifies a 404 as model_retired and does not retry', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      makeResponse({ ok: false, status: 404, text: '{"type":"error","error":{"type":"not_found_error","message":"model: claude-old"}}' })
    );
    await expect(callClaude({ maxTokens: 8, content: 'hi' }, { fetchImpl, ...fast }))
      .rejects.toMatchObject({ kind: 'model_retired', status: 404 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('classifies other 400s as bad_request', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(makeResponse({ ok: false, status: 400, text: 'invalid model' }));
    await expect(callClaude({ maxTokens: 8, content: 'hi' }, { fetchImpl, ...fast }))
      .rejects.toMatchObject({ kind: 'bad_request', status: 400 });
  });

  it('throws empty when a 200 response has no text content', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(makeResponse({ ok: true, status: 200, json: { content: [] } }));
    await expect(callClaude({ maxTokens: 8, content: 'hi' }, { fetchImpl, ...fast }))
      .rejects.toMatchObject({ kind: 'empty' });
  });
});

// Decision 008: when the direct Anthropic call fails, the same model answers
// through OpenRouter (Bedrock / Vertex) — "same brain, different pipe".
// 2026-09-29: Anthropic answered every keyed call from our org with 503
// "credential validation failed" on every model.
describe('callClaude OpenRouter fallback', () => {
  const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;
  const ORIGINAL_OR_KEY = process.env.OPENROUTER_API_KEY;
  const ANTHROPIC = 'https://api.anthropic.com/v1/messages';

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.OPENROUTER_API_KEY = 'or-key';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
    if (ORIGINAL_OR_KEY === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = ORIGINAL_OR_KEY;
    vi.restoreAllMocks();
  });

  // Anthropic answers with `primary`; OpenRouter with `fallback`.
  function routedFetch(primary, fallback) {
    return vi.fn(async (url) => (url === ANTHROPIC ? primary() : fallback()));
  }
  const status = (s, text = '') => () => makeResponse({ ok: false, status: s, text });

  it('pairs the fallback model with CLAUDE_MODEL', () => {
    // OpenRouter spells the version with a dot: claude-opus-4-8 → anthropic/claude-opus-4.8.
    expect(OPENROUTER_MODEL).toBe(`anthropic/${CLAUDE_MODEL.replace(/-(\d+)-(\d+)$/, '-$1.$2')}`);
  });

  it('never calls OpenRouter while Anthropic answers', async () => {
    const fetchImpl = routedFetch(() => okWithText('direct'), () => okWithText('fallback'));
    const result = await callClaude({ maxTokens: 8, content: 'hi' }, { fetchImpl, ...fast });
    expect(result).toEqual({ text: 'direct', via: 'anthropic' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('falls back after the Anthropic retries are spent on a persistent 503', async () => {
    const fetchImpl = routedFetch(status(503), () => okWithText('via bedrock'));
    const result = await callClaude({ maxTokens: 8, content: 'hi' }, { fetchImpl, ...fast });
    expect(result).toEqual({ text: 'via bedrock', via: 'openrouter' });
    const urls = fetchImpl.mock.calls.map(([url]) => url);
    expect(urls).toEqual([ANTHROPIC, ANTHROPIC, ANTHROPIC, OPENROUTER_API_URL]);
  });

  it('falls back on a Cloudflare 522 once the Anthropic retries are spent', async () => {
    const fetchImpl = routedFetch(status(522, '<html>error code: 522</html>'), () => okWithText('via bedrock'));
    const result = await callClaude({ maxTokens: 8, content: 'hi' }, { fetchImpl, ...fast });
    expect(result).toEqual({ text: 'via bedrock', via: 'openrouter' });
    expect(fetchImpl.mock.calls.map(([url]) => url))
      .toEqual([ANTHROPIC, ANTHROPIC, ANTHROPIC, OPENROUTER_API_URL]);
  });

  it('sends the same model and message to OpenRouter, routed to Bedrock or Vertex only', async () => {
    const fetchImpl = routedFetch(status(503), () => okWithText('ok'));
    const content = buildCachedContent('STATIC', 'dynamic');
    await callClaude({ maxTokens: 16, content }, { fetchImpl, ...fast });
    const [url, opts] = fetchImpl.mock.calls.at(-1);
    expect(url).toBe('https://openrouter.ai/api/v1/messages');
    expect(opts.headers.Authorization).toBe('Bearer or-key');
    expect(opts.headers['x-api-key']).toBeUndefined();
    expect(opts.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(opts.body)).toEqual({
      model: OPENROUTER_MODEL,
      max_tokens: 16,
      messages: [{ role: 'user', content }],
      provider: OPENROUTER_PROVIDER,
    });
    expect(OPENROUTER_PROVIDER.only).toEqual(['amazon-bedrock', 'google-vertex']);
  });

  it.each([
    ['auth (401)', status(401, 'invalid x-api-key')],
    ['credit', status(400, 'Your credit balance is too low')],
    ['a usage limit', status(400, 'You have reached your specified API usage limits.')],
    ['model_retired (404)', status(404, 'not_found_error')],
    ['empty', () => makeResponse({ ok: true, status: 200, json: { content: [] } })],
  ])('falls back at once on %s, without retrying Anthropic', async (_label, primary) => {
    const fetchImpl = routedFetch(primary, () => okWithText('fallback'));
    const result = await callClaude({ maxTokens: 8, content: 'hi' }, { fetchImpl, ...fast });
    expect(result).toEqual({ text: 'fallback', via: 'openrouter' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('falls back when the Anthropic key is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const fetchImpl = routedFetch(() => okWithText('direct'), () => okWithText('fallback'));
    const result = await callClaude({ maxTokens: 8, content: 'hi' }, { fetchImpl, ...fast });
    expect(result).toEqual({ text: 'fallback', via: 'openrouter' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  // Our own malformed request fails on any pipe; masking it helps no one.
  it('does not fall back on a bad_request', async () => {
    const fetchImpl = routedFetch(status(400, 'messages: field required'), () => okWithText('fallback'));
    await expect(callClaude({ maxTokens: 8, content: 'hi' }, { fetchImpl, ...fast }))
      .rejects.toMatchObject({ kind: 'bad_request' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('surfaces the Anthropic error when OpenRouter fails too', async () => {
    const fetchImpl = routedFetch(status(503), status(502, 'no provider'));
    await expect(callClaude({ maxTokens: 8, content: 'hi' }, { fetchImpl, ...fast }))
      .rejects.toMatchObject({ name: 'ClaudeError', kind: 'overloaded', status: 503 });
    expect(fetchImpl).toHaveBeenCalledTimes(4); // 3 Anthropic + 1 OpenRouter, no fallback retry
  });

  it('surfaces the Anthropic error when OpenRouter throws on the network', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (url === ANTHROPIC) return makeResponse({ ok: false, status: 401, text: 'bad key' });
      throw new Error('fetch failed');
    });
    await expect(callClaude({ maxTokens: 8, content: 'hi' }, { fetchImpl, ...fast }))
      .rejects.toMatchObject({ kind: 'auth', status: 401 });
  });

  it('leaves the fallback one attempt inside the old worst case', () => {
    // A hung Anthropic attempt can start just before the retry deadline and
    // run a full attempt timeout; the fallback then gets one more attempt.
    // With a fallback configured that path must fit where the no-fallback
    // path already ended (deadline + one hung attempt).
    expect(CLAUDE_RETRY_DEADLINE_WITH_FALLBACK_MS + 2 * CLAUDE_ATTEMPT_TIMEOUT_MS)
      .toBeLessThanOrEqual(CLAUDE_RETRY_DEADLINE_MS + CLAUDE_ATTEMPT_TIMEOUT_MS);
  });

  it('stops retrying Anthropic at the shorter deadline when a fallback is configured', async () => {
    let now = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const fetchImpl = vi.fn(async (url) => {
      if (url !== ANTHROPIC) return okWithText('fallback');
      now += CLAUDE_RETRY_DEADLINE_WITH_FALLBACK_MS; // each Anthropic attempt burns the whole budget
      return makeResponse({ ok: false, status: 503 });
    });
    const result = await callClaude({ maxTokens: 8, content: 'hi' }, { fetchImpl, ...fast });
    expect(result.via).toBe('openrouter');
    expect(fetchImpl.mock.calls.filter(([url]) => url === ANTHROPIC)).toHaveLength(1);
  });

  // Grill (PR #37): the deadline was checked before the backoff sleep, so an
  // attempt could launch up to ~1 s past it and break the stated bound.
  it('does not launch an Anthropic retry that the backoff pushed past the deadline', async () => {
    let now = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const fetchImpl = vi.fn(async (url) => {
      if (url !== ANTHROPIC) return okWithText('fallback');
      now = CLAUDE_RETRY_DEADLINE_WITH_FALLBACK_MS - 1; // fails just inside the deadline
      return makeResponse({ ok: false, status: 503 });
    });
    const sleepImpl = async (ms) => { now += ms; };
    const result = await callClaude({ maxTokens: 8, content: 'hi' }, { fetchImpl, baseDelayMs: 400, sleepImpl });
    expect(result.via).toBe('openrouter');
    expect(fetchImpl.mock.calls.filter(([url]) => url === ANTHROPIC)).toHaveLength(1);
  });

  it('keeps the old behavior when no OpenRouter key is set', async () => {
    delete process.env.OPENROUTER_API_KEY;
    const fetchImpl = routedFetch(status(503), () => okWithText('fallback'));
    await expect(callClaude({ maxTokens: 8, content: 'hi' }, { fetchImpl, ...fast }))
      .rejects.toMatchObject({ kind: 'overloaded', status: 503 });
    expect(fetchImpl.mock.calls.every(([url]) => url === ANTHROPIC)).toBe(true);
  });
});

describe('claudeErrorResponse', () => {
  it('maps overloaded to a retryable 503 busy response', () => {
    const { status, body } = claudeErrorResponse(new ClaudeError('overloaded', 529));
    expect(status).toBe(503);
    expect(body.code).toBe('ANALYSIS_BUSY');
    expect(body.retryable).toBe(true);
  });

  it('maps auth to a non-retryable 503 unavailable response', () => {
    const { status, body } = claudeErrorResponse(new ClaudeError('auth', 401));
    expect(status).toBe(503);
    expect(body.code).toBe('ANALYSIS_UNAVAILABLE');
    expect(body.retryable).toBe(false);
  });

  it('maps credit to a non-retryable 503 unavailable response', () => {
    const { body } = claudeErrorResponse(new ClaudeError('credit', 400));
    expect(body.code).toBe('ANALYSIS_UNAVAILABLE');
    expect(body.retryable).toBe(false);
  });

  it('defaults unknown/non-Claude errors to the non-retryable response', () => {
    const { body } = claudeErrorResponse(new Error('boom'));
    expect(body.code).toBe('ANALYSIS_UNAVAILABLE');
    expect(body.retryable).toBe(false);
  });
});

describe('describeClaudeError', () => {
  it('summarizes a ClaudeError', () => {
    expect(describeClaudeError(new ClaudeError('auth', 401, 'bad key'))).toEqual({
      kind: 'auth',
      status: 401,
      detail: 'bad key',
    });
  });

  it('summarizes a generic error', () => {
    expect(describeClaudeError(new Error('boom'))).toEqual({ kind: 'unknown', message: 'boom' });
  });
});

// Prompt caching (2026-09-16 credit incident): the static prompt travels as
// its own content block with a cache breakpoint so the ~4K-token prefix is
// read from cache on every scan after the first, instead of billed in full.
describe('buildCachedContent', () => {
  it('puts the static text in a cache-marked block and the dynamic text after it', () => {
    const blocks = buildCachedContent('STATIC PROMPT', '### OCR Text:\nflour');
    expect(blocks).toEqual([
      { type: 'text', text: 'STATIC PROMPT', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: '### OCR Text:\nflour' },
    ]);
  });

  it('keeps the static block byte-identical across different dynamic inputs', () => {
    const a = buildCachedContent('STATIC PROMPT', 'first');
    const b = buildCachedContent('STATIC PROMPT', 'second');
    expect(JSON.stringify(a[0])).toBe(JSON.stringify(b[0]));
    expect(a[1].text).toBe('first');
    expect(b[1].text).toBe('second');
  });
});

describe('callClaude with block content', () => {
  const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => { process.env.ANTHROPIC_API_KEY = 'test-key'; });
  afterEach(() => { process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY; vi.restoreAllMocks(); });

  it('sends an array of content blocks through unchanged as the user message', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okWithText('ok'));
    const content = buildCachedContent('STATIC', 'dynamic');
    await callClaude({ maxTokens: 16, content }, { fetchImpl, ...fast });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.messages).toEqual([{ role: 'user', content }]);
  });
});
