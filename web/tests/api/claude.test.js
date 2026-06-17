import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  callClaude,
  claudeErrorResponse,
  describeClaudeError,
  ClaudeError,
  CLAUDE_MODEL,
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
  return makeResponse({ ok: true, status: 200, json: { content: [{ text: textContent }] } });
}

// No-op sleep + zero backoff so retry tests don't actually wait.
const fast = { baseDelayMs: 0, sleepImpl: async () => {} };

describe('callClaude', () => {
  const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
    vi.restoreAllMocks();
  });

  it('returns the text content on a successful response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okWithText('hello world'));
    const result = await callClaude({ maxTokens: 16, content: 'hi' }, { fetchImpl, ...fast });
    expect(result).toBe('hello world');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
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
    expect(result).toBe('recovered');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('retries on a network error then succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(okWithText('back'));
    const result = await callClaude({ maxTokens: 8, content: 'hi' }, { fetchImpl, ...fast });
    expect(result).toBe('back');
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
