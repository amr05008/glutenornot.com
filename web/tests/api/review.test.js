import { describe, it, expect, beforeEach, vi } from 'vitest';

// Replace the analytics senders with spies so handler tests can assert on what
// gets tracked without ever talking to PostHog. Everything else stays real.
vi.mock('../../../api/_analytics.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    trackScan: vi.fn(),
    trackScanFailure: vi.fn(),
    trackBarcodeRecovery: vi.fn(),
    trackReviewPrompt: vi.fn(),
  };
});

import handler, {
  REVIEW_RATE_LIMIT,
  MAX_BODY_BYTES,
  _setReviewRateLimitMap,
} from '../../../api/review.js';
import {
  trackScan,
  trackScanFailure,
  trackBarcodeRecovery,
  trackReviewPrompt,
} from '../../../api/_analytics.js';
import { _getRateLimitMap, _setRateLimitMap } from '../../../api/_utils.js';

function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
    setHeader() {},
  };
}

function post(body, headers = {}) {
  const res = mockRes();
  return handler({ method: 'POST', body, headers }, res).then(() => res);
}

describe('POST /api/review (review prompt beacon, plans/review-prompt-visibility-2026-09-15.md)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _setReviewRateLimitMap(new Map());
    _setRateLimitMap(new Map());
  });

  it('records a requested stage with platform, app version and geo, and responds 204', async () => {
    const res = await post(
      { stage: 'requested' },
      {
        'x-client': 'ios',
        'x-client-version': '1.5.1',
        'x-forwarded-for': '203.0.113.9',
        'x-vercel-ip-country': 'US',
        'x-vercel-ip-country-region': 'NY',
        'x-vercel-ip-city': 'Brooklyn',
      }
    );
    expect(res.statusCode).toBe(204);
    expect(trackReviewPrompt).toHaveBeenCalledTimes(1);
    expect(trackReviewPrompt).toHaveBeenCalledWith({
      ip: '203.0.113.9',
      platform: 'ios',
      appVersion: '1.5.1',
      stage: 'requested',
      country: 'US',
      region: 'NY',
      city: 'Brooklyn',
    });
  });

  it('accepts both stages', async () => {
    for (const stage of ['requested', 'store_opened']) {
      const res = await post({ stage });
      expect(res.statusCode).toBe(204);
      expect(trackReviewPrompt).toHaveBeenLastCalledWith(expect.objectContaining({ stage }));
    }
  });

  it('never emits scan, scan_failed or barcode_recovery — those contracts are untouched', async () => {
    await post({ stage: 'requested' });
    expect(trackScan).not.toHaveBeenCalled();
    expect(trackScanFailure).not.toHaveBeenCalled();
    expect(trackBarcodeRecovery).not.toHaveBeenCalled();
  });

  it('does not consume the scan quota', async () => {
    await post({ stage: 'requested' }, { 'x-forwarded-for': '203.0.113.9' });
    expect(_getRateLimitMap().size).toBe(0);
  });

  it('forwards nothing but the stage — extra properties are discarded, not passed through', async () => {
    const res = await post({
      stage: 'store_opened',
      rating: 5,
      review: 'loved it',
      barcode: '0123456789012',
      scan_count: 3,
    });
    expect(res.statusCode).toBe(204);
    const arg = trackReviewPrompt.mock.calls[0][0];
    const CONTRACT = ['appVersion', 'city', 'country', 'ip', 'platform', 'region', 'stage'];
    for (const key of Object.keys(arg)) expect(CONTRACT).toContain(key);
    expect(JSON.stringify(arg)).not.toContain('loved it');
    expect(JSON.stringify(arg)).not.toContain('0123456789012');
  });

  describe('rejects invalid beacons and tracks nothing', () => {
    it('non-POST → 405', async () => {
      const res = mockRes();
      await handler({ method: 'GET', headers: {} }, res);
      expect(res.statusCode).toBe(405);
      expect(trackReviewPrompt).not.toHaveBeenCalled();
    });

    it('missing body → 400', async () => {
      const res = mockRes();
      await handler({ method: 'POST', headers: {} }, res);
      expect(res.statusCode).toBe(400);
      expect(trackReviewPrompt).not.toHaveBeenCalled();
    });

    it('non-object body → 400', async () => {
      for (const body of ['requested', 42, [], null]) {
        const res = await post(body);
        expect(res.statusCode).toBe(400);
      }
      expect(trackReviewPrompt).not.toHaveBeenCalled();
    });

    it('unknown stage → 400 (nothing can be bucketed into the funnel)', async () => {
      for (const stage of [undefined, 'shown', 'rated', 'REQUESTED', 'requested ', 1, ['requested'], { stage: 'requested' }]) {
        const res = await post({ stage });
        expect(res.statusCode).toBe(400);
      }
      expect(trackReviewPrompt).not.toHaveBeenCalled();
    });

    it('oversized body → 413, tracks nothing', async () => {
      const res = await post(
        { stage: 'requested', pad: 'x'.repeat(MAX_BODY_BYTES) },
        { 'content-length': String(MAX_BODY_BYTES + 200) }
      );
      expect(res.statusCode).toBe(413);
      expect(trackReviewPrompt).not.toHaveBeenCalled();
    });

    it('oversized body is caught by the serialized UTF-8 size without a content-length header', async () => {
      const body = { stage: 'requested', pad: '界'.repeat(200) };
      expect(JSON.stringify(body).length).toBeLessThan(MAX_BODY_BYTES);
      expect(Buffer.byteLength(JSON.stringify(body), 'utf8')).toBeGreaterThan(MAX_BODY_BYTES);
      const res = await post(body);
      expect(res.statusCode).toBe(413);
      expect(trackReviewPrompt).not.toHaveBeenCalled();
    });
  });

  describe('rate limiting (own map — never the scan limiter)', () => {
    it(`allows ${REVIEW_RATE_LIMIT} beacons per IP per day, then 429s and tracks nothing`, async () => {
      const headers = { 'x-forwarded-for': '198.51.100.7' };
      for (let i = 0; i < REVIEW_RATE_LIMIT; i++) {
        const res = await post({ stage: 'store_opened' }, headers);
        expect(res.statusCode).toBe(204);
      }
      const res = await post({ stage: 'store_opened' }, headers);
      expect(res.statusCode).toBe(429);
      expect(trackReviewPrompt).toHaveBeenCalledTimes(REVIEW_RATE_LIMIT);
    });

    it('is per IP', async () => {
      for (let i = 0; i < REVIEW_RATE_LIMIT; i++) {
        await post({ stage: 'store_opened' }, { 'x-forwarded-for': '198.51.100.7' });
      }
      const res = await post({ stage: 'store_opened' }, { 'x-forwarded-for': '198.51.100.8' });
      expect(res.statusCode).toBe(204);
    });

    it('resets after the window', async () => {
      const map = new Map();
      _setReviewRateLimitMap(map);
      const headers = { 'x-forwarded-for': '198.51.100.7' };
      for (let i = 0; i < REVIEW_RATE_LIMIT; i++) await post({ stage: 'store_opened' }, headers);
      expect((await post({ stage: 'store_opened' }, headers)).statusCode).toBe(429);
      map.get('198.51.100.7').windowStart = Date.now() - 25 * 60 * 60 * 1000;
      expect((await post({ stage: 'store_opened' }, headers)).statusCode).toBe(204);
    });
  });

  it('still responds 204 when tracking throws — telemetry never becomes a client-visible failure', async () => {
    trackReviewPrompt.mockRejectedValueOnce(new Error('posthog down'));
    const res = await post({ stage: 'requested' });
    expect(res.statusCode).toBe(204);
  });
});
