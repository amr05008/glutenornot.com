import { describe, it, expect, beforeEach, vi } from 'vitest';

// Replace the analytics senders with spies so handler tests can assert on what
// gets tracked without ever talking to PostHog. Everything else stays real.
vi.mock('../../../api/_analytics.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, trackScan: vi.fn(), trackScanFailure: vi.fn() };
});

import handler, { BEACON_RATE_LIMIT, _setBeaconRateLimitMap } from '../../../api/track.js';
import { trackScan, trackScanFailure } from '../../../api/_analytics.js';

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

describe('POST /api/track (client failure beacon)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _setBeaconRateLimitMap(new Map());
  });

  it('rate-limits beacon floods per IP without touching the scan quota', async () => {
    // Open, unauthenticated endpoint: without a cap, a flood of valid beacons
    // poisons the weekly failure-rate metrics. Separate map from the scan
    // limiter — a user's failed scans must never consume their scan allowance.
    const headers = { 'x-forwarded-for': '203.0.113.7' };
    for (let i = 0; i < BEACON_RATE_LIMIT; i++) {
      const res = mockRes();
      await handler({ method: 'POST', body: { method: 'ocr', reason: 'timeout' }, headers }, res);
      expect(res.statusCode).toBe(204);
    }

    const res = mockRes();
    await handler({ method: 'POST', body: { method: 'ocr', reason: 'timeout' }, headers }, res);
    expect(res.statusCode).toBe(429);
    expect(trackScanFailure).toHaveBeenCalledTimes(BEACON_RATE_LIMIT);
  });

  it('rate-limits per IP, not globally', async () => {
    const flood = { 'x-forwarded-for': '203.0.113.7' };
    for (let i = 0; i < BEACON_RATE_LIMIT; i++) {
      await handler({ method: 'POST', body: { method: 'ocr', reason: 'timeout' }, headers: flood }, mockRes());
    }

    const res = mockRes();
    await handler(
      { method: 'POST', body: { method: 'ocr', reason: 'timeout' }, headers: { 'x-forwarded-for': '198.51.100.2' } },
      res
    );
    expect(res.statusCode).toBe(204);
  });

  it('rejects non-POST methods with 405 and tracks nothing', async () => {
    const res = mockRes();
    await handler({ method: 'GET', headers: {} }, res);
    expect(res.statusCode).toBe(405);
    expect(trackScanFailure).not.toHaveBeenCalled();
  });

  it('rejects a reason outside the client allowlist and tracks nothing', async () => {
    // Server-emitted reasons (ocr_failed, not_found, …) must not be spoofable
    // through the beacon — only the two failures the server can never see.
    const res = mockRes();
    await handler({ method: 'POST', body: { method: 'ocr', reason: 'ocr_failed' }, headers: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(trackScanFailure).not.toHaveBeenCalled();
  });

  it('rejects an unknown method value and tracks nothing', async () => {
    const res = mockRes();
    await handler({ method: 'POST', body: { method: 'menu', reason: 'timeout' }, headers: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(trackScanFailure).not.toHaveBeenCalled();
  });

  it('rejects a missing body and tracks nothing', async () => {
    const res = mockRes();
    await handler({ method: 'POST', headers: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(trackScanFailure).not.toHaveBeenCalled();
  });

  it('records a timeout failure with platform from X-Client and responds 204', async () => {
    const res = mockRes();
    await handler(
      {
        method: 'POST',
        body: { method: 'ocr', reason: 'timeout' },
        headers: { 'x-client': 'ios', 'x-forwarded-for': '203.0.113.9' },
      },
      res
    );
    expect(res.statusCode).toBe(204);
    expect(trackScanFailure).toHaveBeenCalledTimes(1);
    expect(trackScanFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        ip: '203.0.113.9',
        platform: 'ios',
        method: 'ocr',
        reason: 'timeout',
      })
    );
  });

  it('records a network failure on the barcode path', async () => {
    const res = mockRes();
    await handler(
      { method: 'POST', body: { method: 'barcode', reason: 'network' }, headers: {} },
      res
    );
    expect(res.statusCode).toBe(204);
    expect(trackScanFailure).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'barcode', reason: 'network', platform: 'unknown' })
    );
  });

  it('passes edge geo through to the failure event', async () => {
    const res = mockRes();
    await handler(
      {
        method: 'POST',
        body: { method: 'ocr', reason: 'timeout' },
        headers: {
          'x-vercel-ip-country': 'US',
          'x-vercel-ip-country-region': 'MA',
          'x-vercel-ip-city': 'Boston',
        },
      },
      res
    );
    expect(trackScanFailure).toHaveBeenCalledWith(
      expect.objectContaining({ country: 'US', region: 'MA', city: 'Boston' })
    );
  });

  it('never emits a scan event, ever', async () => {
    // `scan` is success-only by contract — every existing dashboard insight
    // counts it as successful scans. The beacon must not be able to inflate it.
    const res = mockRes();
    await handler(
      { method: 'POST', body: { method: 'ocr', reason: 'timeout' }, headers: {} },
      res
    );
    expect(res.statusCode).toBe(204);
    expect(trackScan).not.toHaveBeenCalled();
  });
});

describe('POST /api/track — cancelled attempts (plans/weak-signal-upload-2026-08-28.md)', () => {
  // A user who gives up on a slow upload is a failed attempt from their seat,
  // but it used to be invisible everywhere: user-cancel is an AbortError that
  // the client drops before Sentry or the beacon fire. The 2026-08-28 field
  // incident was three attempts and one server-side event.
  beforeEach(() => {
    vi.clearAllMocks();
    _setBeaconRateLimitMap(new Map());
  });

  it('records a cancelled OCR attempt with how long the user waited', async () => {
    const res = mockRes();
    await handler(
      {
        method: 'POST',
        body: { method: 'ocr', reason: 'cancelled', elapsed_ms: 31450 },
        headers: { 'x-client': 'ios' },
      },
      res
    );
    expect(res.statusCode).toBe(204);
    expect(trackScanFailure).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'ocr', reason: 'cancelled', elapsedMs: 31450, platform: 'ios' })
    );
    expect(trackScan).not.toHaveBeenCalled();
  });

  it('accepts elapsed_ms on the existing timeout/network reasons too', async () => {
    const res = mockRes();
    await handler(
      { method: 'POST', body: { method: 'barcode', reason: 'network', elapsed_ms: 4020 }, headers: {} },
      res
    );
    expect(res.statusCode).toBe(204);
    expect(trackScanFailure).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'barcode', reason: 'network', elapsedMs: 4020 })
    );
  });

  it('leaves elapsedMs out when the client did not send it', async () => {
    await handler({ method: 'POST', body: { method: 'ocr', reason: 'cancelled' }, headers: {} }, mockRes());
    const arg = trackScanFailure.mock.calls[0][0];
    expect(arg.reason).toBe('cancelled');
    expect(arg.elapsedMs).toBeUndefined();
  });

  it('clamps elapsed_ms into [0, 120000] and rounds it — untrusted input on an open endpoint', async () => {
    for (const [sent, expected] of [
      [999999, 120000],
      [-50, 0],
      [1234.7, 1235],
    ]) {
      vi.clearAllMocks();
      await handler(
        { method: 'POST', body: { method: 'ocr', reason: 'cancelled', elapsed_ms: sent }, headers: {} },
        mockRes()
      );
      expect(trackScanFailure.mock.calls[0][0].elapsedMs).toBe(expected);
    }
  });

  it('drops a non-numeric elapsed_ms instead of shipping junk to analytics', async () => {
    for (const junk of ['abc', '31450', null, {}, [], NaN, Infinity, true]) {
      vi.clearAllMocks();
      const res = mockRes();
      await handler(
        { method: 'POST', body: { method: 'ocr', reason: 'cancelled', elapsed_ms: junk }, headers: {} },
        res
      );
      expect(res.statusCode).toBe(204); // the beacon itself is still valid
      expect(trackScanFailure.mock.calls[0][0].elapsedMs).toBeUndefined();
    }
  });
});
