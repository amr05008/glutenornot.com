jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '9.9.9' } },
}));

import {
  newRecoveryFlowId,
  sendRecoveryEvent,
  _resetRecoveryEventDedupe,
} from '../recovery';
import { RECOVERY_API_URL } from '../../constants/verdicts';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const FLOW = '9f1c2c9e-3f0a-4d1b-8e6a-2b7f0c5d9e11';

function mockFetch(impl?: () => Promise<unknown>): jest.Mock {
  const fetchMock: jest.Mock = jest.fn(impl ?? (() => Promise.resolve({ ok: true, status: 204 })));
  (global as any).fetch = fetchMock;
  return fetchMock;
}

function body(fetchMock: jest.Mock, index = 0) {
  return JSON.parse(fetchMock.mock.calls[index][1].body);
}

beforeEach(() => {
  _resetRecoveryEventDedupe();
});

afterEach(() => {
  (global as any).fetch = undefined;
});

describe('newRecoveryFlowId', () => {
  it('mints a v4 UUID — the server rejects anything else', () => {
    const id = newRecoveryFlowId();
    expect(id).toMatch(UUID_V4);
  });

  it('mints a valid v4 without a platform crypto — the production path on Expo/Hermes, which ships no globalThis.crypto', () => {
    const saved = (globalThis as any).crypto;
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
    try {
      const ids = new Set(Array.from({ length: 200 }, () => newRecoveryFlowId()));
      expect(ids.size).toBe(200);
      for (const id of ids) expect(id).toMatch(UUID_V4);
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: saved, configurable: true, writable: true });
    }
  });

  it('mints a different ID each time — one ID per recovery journey, never reused', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newRecoveryFlowId()));
    expect(ids.size).toBe(50);
  });
});

describe('sendRecoveryEvent', () => {
  it('POSTs flow_id / reason / stage to /api/recovery with the client headers', () => {
    const fetchMock = mockFetch();

    expect(sendRecoveryEvent(FLOW, 'not_found', 'shown')).toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(RECOVERY_API_URL);
    expect(init.method).toBe('POST');
    expect(init.headers['X-Client']).toBe('ios');
    expect(init.headers['X-Client-Version']).toBe('9.9.9');
    expect(body(fetchMock)).toEqual({ flow_id: FLOW, reason: 'not_found', stage: 'shown' });
  });

  it('carries source on photo_started', () => {
    const fetchMock = mockFetch();
    sendRecoveryEvent(FLOW, 'missing_context', 'photo_started', { source: 'picker' });
    expect(body(fetchMock)).toEqual({ flow_id: FLOW, reason: 'missing_context', stage: 'photo_started', source: 'picker' });
  });

  it('carries the bounded result fields on result_displayed', () => {
    const fetchMock = mockFetch();
    sendRecoveryEvent(FLOW, 'not_found', 'result_displayed', { resultMode: 'menu', verdict: 'caution', confidence: 'low' });
    expect(body(fetchMock)).toEqual({
      flow_id: FLOW, reason: 'not_found', stage: 'result_displayed',
      result_mode: 'menu', verdict: 'caution', confidence: 'low',
    });
  });

  it('sends only the allowlisted keys — nothing else can ride along', () => {
    const fetchMock = mockFetch();
    sendRecoveryEvent(FLOW, 'not_found', 'result_displayed', {
      verdict: 'safe',
      // @ts-expect-error — deliberately smuggling content the contract forbids
      product_name: 'SENTINEL_PRODUCT', barcode: 'SENTINEL_BARCODE', explanation: 'SENTINEL_TEXT',
    });
    const raw = fetchMock.mock.calls[0][1].body as string;
    expect(raw).not.toContain('SENTINEL');
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual(['flow_id', 'reason', 'stage', 'verdict']);
  });

  it('sends shown and result_displayed at most once per flow (remounts / re-renders cannot duplicate them)', () => {
    const fetchMock = mockFetch();
    expect(sendRecoveryEvent(FLOW, 'not_found', 'shown')).toBe(true);
    expect(sendRecoveryEvent(FLOW, 'not_found', 'shown')).toBe(false);
    expect(sendRecoveryEvent(FLOW, 'not_found', 'result_displayed', { verdict: 'safe' })).toBe(true);
    expect(sendRecoveryEvent(FLOW, 'not_found', 'result_displayed', { verdict: 'safe' })).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // A different flow is a different journey
    expect(sendRecoveryEvent('1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d', 'not_found', 'shown')).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('lets photo_started and exited repeat — retries are dedupable by flow_id server-side, not here', () => {
    const fetchMock = mockFetch();
    sendRecoveryEvent(FLOW, 'not_found', 'photo_started', { source: 'camera' });
    sendRecoveryEvent(FLOW, 'not_found', 'photo_started', { source: 'camera' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never throws — with no fetch at all, or when fetch rejects', async () => {
    (global as any).fetch = undefined;
    expect(() => sendRecoveryEvent(FLOW, 'not_found', 'shown')).not.toThrow();

    _resetRecoveryEventDedupe();
    mockFetch(() => Promise.reject(new Error('offline')));
    expect(() => sendRecoveryEvent(FLOW, 'not_found', 'shown')).not.toThrow();
    await Promise.resolve(); // let the rejection settle — nothing should surface
  });
});
