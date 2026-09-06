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
  };
});

import handler, {
  RECOVERY_RATE_LIMIT,
  MAX_BODY_BYTES,
  _setRecoveryRateLimitMap,
} from '../../../api/recovery.js';
import { trackScan, trackScanFailure, trackBarcodeRecovery } from '../../../api/_analytics.js';
import { _getRateLimitMap, _setRateLimitMap } from '../../../api/_utils.js';

const FLOW = '9f1c2c9e-3f0a-4d1b-8e6a-2b7f0c5d9e11';

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

describe('POST /api/recovery (barcode recovery funnel, plans/barcode-recovery-2026-09-05.md §7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _setRecoveryRateLimitMap(new Map());
    _setRateLimitMap(new Map());
  });

  it('records a shown stage with platform, app version and geo, and responds 204', async () => {
    const res = await post(
      { flow_id: FLOW, reason: 'not_found', stage: 'shown' },
      {
        'x-client': 'ios',
        'x-client-version': '1.5.0',
        'x-forwarded-for': '203.0.113.9',
        'x-vercel-ip-country': 'US',
        'x-vercel-ip-country-region': 'MA',
        'x-vercel-ip-city': 'Boston',
      }
    );
    expect(res.statusCode).toBe(204);
    expect(trackBarcodeRecovery).toHaveBeenCalledTimes(1);
    expect(trackBarcodeRecovery).toHaveBeenCalledWith({
      ip: '203.0.113.9',
      platform: 'ios',
      appVersion: '1.5.0',
      flowId: FLOW,
      reason: 'not_found',
      stage: 'shown',
      country: 'US',
      region: 'MA',
      city: 'Boston',
    });
  });

  it('accepts every stage and both reasons', async () => {
    for (const stage of ['shown', 'photo_started', 'result_displayed', 'exited']) {
      for (const reason of ['not_found', 'missing_context']) {
        const res = await post({ flow_id: FLOW, reason, stage });
        expect(res.statusCode).toBe(204);
        expect(trackBarcodeRecovery).toHaveBeenLastCalledWith(expect.objectContaining({ stage, reason }));
      }
    }
  });

  it('never emits scan or scan_failed — those contracts are untouched by this endpoint', async () => {
    await post({ flow_id: FLOW, reason: 'not_found', stage: 'result_displayed', verdict: 'safe' });
    expect(trackScan).not.toHaveBeenCalled();
    expect(trackScanFailure).not.toHaveBeenCalled();
  });

  it('does not consume the scan quota', async () => {
    await post({ flow_id: FLOW, reason: 'not_found', stage: 'shown' }, { 'x-forwarded-for': '203.0.113.9' });
    expect(_getRateLimitMap().size).toBe(0);
  });

  describe('rejects invalid beacons and tracks nothing', () => {
    it('non-POST → 405', async () => {
      const res = mockRes();
      await handler({ method: 'GET', headers: {} }, res);
      expect(res.statusCode).toBe(405);
      expect(trackBarcodeRecovery).not.toHaveBeenCalled();
    });

    it('missing body → 400', async () => {
      const res = mockRes();
      await handler({ method: 'POST', headers: {} }, res);
      expect(res.statusCode).toBe(400);
      expect(trackBarcodeRecovery).not.toHaveBeenCalled();
    });

    it('non-object body → 400', async () => {
      for (const body of ['shown', 42, [], null]) {
        const res = await post(body);
        expect(res.statusCode).toBe(400);
      }
      expect(trackBarcodeRecovery).not.toHaveBeenCalled();
    });

    it('flow_id must be a v4 UUID — anything else is rejected, not bucketed', async () => {
      for (const flow_id of [
        undefined,
        '',
        'abc',
        12345,
        FLOW.toUpperCase().slice(0, 35), // truncated
        '9f1c2c9e-3f0a-1d1b-8e6a-2b7f0c5d9e11', // v1, not v4
        'x'.repeat(36),
        `${FLOW} `, // trailing whitespace
        { id: FLOW },
      ]) {
        const res = await post({ flow_id, reason: 'not_found', stage: 'shown' });
        expect(res.statusCode).toBe(400);
      }
      expect(trackBarcodeRecovery).not.toHaveBeenCalled();
    });

    it('accepts an uppercase v4 UUID and normalizes it to lowercase', async () => {
      const res = await post({ flow_id: FLOW.toUpperCase(), reason: 'not_found', stage: 'shown' });
      expect(res.statusCode).toBe(204);
      expect(trackBarcodeRecovery).toHaveBeenCalledWith(expect.objectContaining({ flowId: FLOW }));
    });

    it('unknown stage → 400', async () => {
      for (const stage of [undefined, 'scan', 'result', 'SHOWN', 'shown ', 1, ['shown']]) {
        const res = await post({ flow_id: FLOW, reason: 'not_found', stage });
        expect(res.statusCode).toBe(400);
      }
      expect(trackBarcodeRecovery).not.toHaveBeenCalled();
    });

    it('unknown reason → 400 (server failure reasons cannot be spoofed in here)', async () => {
      for (const reason of [undefined, 'ocr_failed', 'timeout', 'server_error', 'NOT_FOUND', 0]) {
        const res = await post({ flow_id: FLOW, reason, stage: 'shown' });
        expect(res.statusCode).toBe(400);
      }
      expect(trackBarcodeRecovery).not.toHaveBeenCalled();
    });

    it('oversized body → 413, tracks nothing', async () => {
      const res = await post(
        { flow_id: FLOW, reason: 'not_found', stage: 'shown', pad: 'x'.repeat(MAX_BODY_BYTES) },
        { 'content-length': String(MAX_BODY_BYTES + 200) }
      );
      expect(res.statusCode).toBe(413);
      expect(trackBarcodeRecovery).not.toHaveBeenCalled();
    });

    it('measures UTF-8 bytes, not UTF-16 characters, without content-length', async () => {
      const body = { flow_id: FLOW, reason: 'not_found', stage: 'shown', pad: '界'.repeat(400) };
      expect(JSON.stringify(body).length).toBeLessThan(MAX_BODY_BYTES);
      expect(Buffer.byteLength(JSON.stringify(body), 'utf8')).toBeGreaterThan(MAX_BODY_BYTES);
      const res = await post(body);
      expect(res.statusCode).toBe(413);
      expect(trackBarcodeRecovery).not.toHaveBeenCalled();
    });

    it('oversized body is caught by the serialized size even without a content-length header', async () => {
      const res = await post({ flow_id: FLOW, reason: 'not_found', stage: 'shown', pad: 'x'.repeat(MAX_BODY_BYTES) });
      expect(res.statusCode).toBe(413);
      expect(trackBarcodeRecovery).not.toHaveBeenCalled();
    });
  });

  describe('optional fields are reconstructed, never passed through', () => {
    it('keeps source on photo_started only', async () => {
      await post({ flow_id: FLOW, reason: 'missing_context', stage: 'photo_started', source: 'picker' });
      expect(trackBarcodeRecovery).toHaveBeenLastCalledWith(expect.objectContaining({ source: 'picker' }));

      await post({ flow_id: FLOW, reason: 'missing_context', stage: 'shown', source: 'picker' });
      expect(trackBarcodeRecovery.mock.calls[1][0]).not.toHaveProperty('source');
    });

    it('drops an invalid source without rejecting the beacon', async () => {
      const res = await post({ flow_id: FLOW, reason: 'not_found', stage: 'photo_started', source: 'screenshot' });
      expect(res.statusCode).toBe(204);
      expect(trackBarcodeRecovery.mock.calls[0][0]).not.toHaveProperty('source');
    });

    it('keeps result_mode / verdict / confidence on result_displayed only', async () => {
      await post({
        flow_id: FLOW, reason: 'not_found', stage: 'result_displayed',
        result_mode: 'menu', verdict: 'caution', confidence: 'low',
      });
      expect(trackBarcodeRecovery).toHaveBeenLastCalledWith(
        expect.objectContaining({ resultMode: 'menu', verdict: 'caution', confidence: 'low' })
      );

      await post({
        flow_id: FLOW, reason: 'not_found', stage: 'photo_started',
        result_mode: 'label', verdict: 'safe', confidence: 'high',
      });
      const arg = trackBarcodeRecovery.mock.calls[1][0];
      expect(arg).not.toHaveProperty('resultMode');
      expect(arg).not.toHaveProperty('verdict');
      expect(arg).not.toHaveProperty('confidence');
    });

    it('drops invalid result enums individually, keeping the valid ones', async () => {
      const res = await post({
        flow_id: FLOW, reason: 'not_found', stage: 'result_displayed',
        result_mode: 'recipe', verdict: 'probably safe', confidence: 'medium',
      });
      expect(res.statusCode).toBe(204);
      const arg = trackBarcodeRecovery.mock.calls[0][0];
      expect(arg).not.toHaveProperty('resultMode');
      expect(arg).not.toHaveProperty('verdict');
      expect(arg.confidence).toBe('medium');
    });

    it('never forwards arbitrary client properties — the payload is rebuilt from an allowlist', async () => {
      // Sentinels: if any of these reach the tracker, the privacy invariant
      // ("no record of what you scanned") is broken by this endpoint.
      await post({
        flow_id: FLOW, reason: 'missing_context', stage: 'result_displayed',
        verdict: 'safe',
        barcode: 'SENTINEL_BARCODE_7311041088219',
        product_name: 'SENTINEL_PRODUCT_NAME',
        explanation: 'SENTINEL_EXPLANATION',
        ingredients: 'SENTINEL_INGREDIENTS',
        image: 'SENTINEL_IMAGE',
        distinct_id: 'SENTINEL_ID',
        $set: { email: 'SENTINEL_EMAIL' },
      });
      expect(trackBarcodeRecovery).toHaveBeenCalledTimes(1);
      const serialized = JSON.stringify(trackBarcodeRecovery.mock.calls[0][0]);
      expect(serialized).not.toContain('SENTINEL');
      expect(Object.keys(trackBarcodeRecovery.mock.calls[0][0]).sort()).toEqual(
        ['appVersion', 'city', 'country', 'flowId', 'ip', 'platform', 'reason', 'region', 'stage', 'verdict'].sort()
      );
    });
  });

  describe('abuse cap', () => {
    it('rate-limits per IP on its own map, sized for several events per scan', async () => {
      expect(RECOVERY_RATE_LIMIT).toBeGreaterThan(50); // more than the scan/beacon allowance
      const headers = { 'x-forwarded-for': '203.0.113.7' };
      for (let i = 0; i < RECOVERY_RATE_LIMIT; i++) {
        const res = await post({ flow_id: FLOW, reason: 'not_found', stage: 'shown' }, headers);
        expect(res.statusCode).toBe(204);
      }
      const res = await post({ flow_id: FLOW, reason: 'not_found', stage: 'shown' }, headers);
      expect(res.statusCode).toBe(429);
      expect(trackBarcodeRecovery).toHaveBeenCalledTimes(RECOVERY_RATE_LIMIT);

      const other = await post(
        { flow_id: FLOW, reason: 'not_found', stage: 'shown' },
        { 'x-forwarded-for': '198.51.100.2' }
      );
      expect(other.statusCode).toBe(204);
    });

    it('invalid beacons do not count against the cap', async () => {
      const headers = { 'x-forwarded-for': '203.0.113.7' };
      for (let i = 0; i < RECOVERY_RATE_LIMIT + 5; i++) {
        await post({ flow_id: 'nope', reason: 'not_found', stage: 'shown' }, headers);
      }
      const res = await post({ flow_id: FLOW, reason: 'not_found', stage: 'shown' }, headers);
      expect(res.statusCode).toBe(204);
    });
  });

  it('still responds 204 when analytics itself fails — telemetry loses a measurement, not the user', async () => {
    trackBarcodeRecovery.mockRejectedValueOnce(new Error('posthog down'));
    const res = await post({ flow_id: FLOW, reason: 'not_found', stage: 'shown' });
    expect(res.statusCode).toBe(204);
  });
});
