jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn(),
}));

// Constants.expoConfig is null under jest (there is no manifest to read), so
// stub it — otherwise every header assertion below compares undefined to
// undefined and passes without testing anything.
const APP_VERSION = '9.9.9';
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '9.9.9' } },
}));

import * as Network from 'expo-network';
import { analyzeImage, lookupBarcode, APIError, ScanProgress } from '../api';

const mockedGetNetworkState = Network.getNetworkStateAsync as jest.Mock;

// ---------------------------------------------------------------------------
// XMLHttpRequest stand-in. analyzeImage sends the photo over XHR rather than
// fetch because only XHR can see the request body going out — on weak signal
// the upload is the leg that takes 10–45 s, and the UI has to say so
// (plans/weak-signal-upload-2026-08-28.md). Scriptable per test via `xhrScript`.
// Everything fires asynchronously, as in the real thing: handlers are attached
// after send() returns.
// ---------------------------------------------------------------------------
type UploadEvent = [loaded: number, total: number];
type XhrScript =
  | { kind: 'respond'; status: number; body?: unknown; uploadEvents?: UploadEvent[] }
  | { kind: 'networkError' }
  | { kind: 'hang'; uploadEvents?: UploadEvent[] };

let xhrScript: XhrScript = { kind: 'respond', status: 200, body: { verdict: 'safe' } };

type ProgressHandler = (e: { lengthComputable: boolean; loaded: number; total: number }) => void;

class MockXHR {
  static instances: MockXHR[] = [];
  method = '';
  url = '';
  headers: Record<string, string> = {};
  body: string | undefined;
  status = 0;
  responseText = '';
  readyState = 0;
  onload: null | (() => void) = null;
  onerror: null | (() => void) = null;
  onabort: null | (() => void) = null;
  onreadystatechange: null | (() => void) = null;
  upload: { onprogress: null | ProgressHandler } = { onprogress: null };
  private settled = false;

  constructor() {
    MockXHR.instances.push(this);
  }

  get isSettled() {
    return this.settled;
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
    this.readyState = 1;
  }

  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }

  send(body?: string) {
    this.body = body;
    const script = xhrScript;
    Promise.resolve().then(() => {
      if (this.settled) return;
      const events = 'uploadEvents' in script ? script.uploadEvents || [] : [];
      for (const [loaded, total] of events) {
        this.upload.onprogress?.({ lengthComputable: true, loaded, total });
      }
      if (script.kind === 'hang' || this.settled) return;
      if (script.kind === 'networkError') {
        this.settled = true;
        this.onerror?.();
        return;
      }
      this.readyState = 2;
      this.onreadystatechange?.();
      this.status = script.status;
      this.responseText = script.body === undefined ? '' : JSON.stringify(script.body);
      this.readyState = 4;
      this.onreadystatechange?.();
      this.settled = true;
      this.onload?.();
    });
  }

  abort() {
    if (this.settled) return;
    this.settled = true;
    this.onabort?.();
  }
}

function lastXhr(): MockXHR {
  return MockXHR.instances[MockXHR.instances.length - 1];
}

// Let the XHR mock's microtask run so a pending request is "on the wire".
async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
}

// The beacon and the barcode lookup still go through fetch. Discriminate by
// URL: /api/track succeeds (or fails, per `beaconError`); /api/barcode behaves
// per `barcode`.
function mockFetch({
  barcode = Promise.resolve({ ok: true, json: async () => ({ verdict: 'safe' }) }) as Promise<unknown>,
  beaconError,
}: { barcode?: Promise<unknown>; beaconError?: Error } = {}) {
  const fetchMock = jest.fn().mockImplementation((url: string) => {
    if (String(url).includes('/api/track')) {
      return beaconError ? Promise.reject(beaconError) : Promise.resolve({ ok: true, status: 204 });
    }
    return barcode;
  });
  (global as any).fetch = fetchMock;
  return fetchMock;
}

function beaconCalls(fetchMock: jest.Mock) {
  return fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/track'));
}

function beaconBody(fetchMock: jest.Mock, index = 0) {
  return JSON.parse(beaconCalls(fetchMock)[index][1].body);
}

beforeEach(() => {
  mockedGetNetworkState.mockReset();
  mockedGetNetworkState.mockResolvedValue({ isConnected: true, isInternetReachable: true });
  (global as any).fetch = undefined;
  (global as any).XMLHttpRequest = MockXHR;
  MockXHR.instances = [];
  xhrScript = { kind: 'respond', status: 200, body: { verdict: 'safe' } };
});

describe('pre-flight connectivity guard', () => {
  it('analyzeImage fails fast with a network error when offline — never hits the network', async () => {
    mockedGetNetworkState.mockResolvedValue({ isConnected: false, isInternetReachable: false });
    const fetchMock = mockFetch();

    await expect(analyzeImage('base64data')).rejects.toMatchObject({
      name: 'APIError',
      type: 'network',
    });
    expect(MockXHR.instances).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled(); // no beacon either — nothing was sent
  });

  it('lookupBarcode fails fast with a network error when offline — never hits the network', async () => {
    mockedGetNetworkState.mockResolvedValue({ isConnected: false, isInternetReachable: false });
    const fetchMock = mockFetch();

    await expect(lookupBarcode('012345678905')).rejects.toBeInstanceOf(APIError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('proceeds to the request when connected', async () => {
    await expect(analyzeImage('base64data')).resolves.toEqual({ verdict: 'safe' });
    expect(MockXHR.instances).toHaveLength(1);
  });

  it('does not block when reachability is unknown (isInternetReachable null)', async () => {
    mockedGetNetworkState.mockResolvedValue({ isConnected: true, isInternetReachable: null });

    await expect(analyzeImage('base64data')).resolves.toBeDefined();
    expect(MockXHR.instances).toHaveLength(1);
  });

  it('never lets a failing connectivity probe block a scan — falls through to the request', async () => {
    mockedGetNetworkState.mockRejectedValue(new Error('probe unavailable'));

    await expect(analyzeImage('base64data')).resolves.toBeDefined();
    expect(MockXHR.instances).toHaveLength(1);
  });
});

describe('analyzeImage request', () => {
  it('POSTs the image as JSON with the client headers', async () => {
    await analyzeImage('base64data');

    const xhr = lastXhr();
    expect(xhr.method).toBe('POST');
    expect(xhr.url).toContain('/api/analyze');
    expect(JSON.parse(xhr.body!)).toEqual({ image: 'base64data' });
    expect(xhr.headers['Content-Type']).toBe('application/json');
    // Without X-Client the server buckets platform as "unknown" and the
    // per-platform dashboards silently miscount; without the version a
    // release is unattributable (analytics is server-side).
    expect(xhr.headers['X-Client']).toBe('ios');
    expect(xhr.headers['X-Client-Version']).toBe(APP_VERSION);
  });

  it('maps 429 to rate_limit with retryAfter', async () => {
    xhrScript = { kind: 'respond', status: 429, body: { message: 'Slow down', retryAfter: '3h' } };
    await expect(analyzeImage('base64data')).rejects.toMatchObject({
      type: 'rate_limit',
      message: 'Slow down',
      retryAfter: '3h',
    });
  });

  it('maps a 400 OCR_FAILED to ocr_failed', async () => {
    xhrScript = { kind: 'respond', status: 400, body: { code: 'OCR_FAILED', message: 'Blurry' } };
    await expect(analyzeImage('base64data')).rejects.toMatchObject({ type: 'ocr_failed', message: 'Blurry' });
  });

  it('maps any other non-2xx to server_error, even with an unparseable body', async () => {
    xhrScript = { kind: 'respond', status: 503 };
    await expect(analyzeImage('base64data')).rejects.toMatchObject({ type: 'server_error' });
  });
});

describe('analyzeImage upload progress', () => {
  it('reports upload percentage, then "reading" once the body is fully sent', async () => {
    xhrScript = {
      kind: 'respond',
      status: 200,
      body: { verdict: 'safe' },
      uploadEvents: [
        [100, 1000],
        [400, 1000],
        [1000, 1000],
      ],
    };
    const seen: ScanProgress[] = [];

    await analyzeImage('base64data', undefined, (p) => seen.push(p));

    expect(seen).toEqual([
      { phase: 'uploading', pct: 10 },
      { phase: 'uploading', pct: 40 },
      { phase: 'reading' },
    ]);
  });

  it('reports "reading" exactly once even when the response arrives without a final upload event', async () => {
    // Headers arriving (readyState 2) also mean the upload is done — but a
    // second "reading" after a 100% progress event would flicker the UI.
    xhrScript = { kind: 'respond', status: 200, body: { verdict: 'safe' }, uploadEvents: [[500, 1000]] };
    const seen: ScanProgress[] = [];

    await analyzeImage('base64data', undefined, (p) => seen.push(p));

    expect(seen).toEqual([{ phase: 'uploading', pct: 50 }, { phase: 'reading' }]);
  });

  it('never lets a throwing progress callback break the scan', async () => {
    xhrScript = { kind: 'respond', status: 200, body: { verdict: 'safe' }, uploadEvents: [[1, 2]] };

    await expect(
      analyzeImage('base64data', undefined, () => {
        throw new Error('UI exploded');
      })
    ).resolves.toEqual({ verdict: 'safe' });
  });
});

describe('failure beacon (timeout/network/cancelled → POST /api/track)', () => {
  it('fires an ocr/timeout beacon with the elapsed time when the analyze request times out', async () => {
    jest.useFakeTimers();
    try {
      const fetchMock = mockFetch();
      xhrScript = { kind: 'hang' };

      const pending = analyzeImage('base64data');
      const rejection = expect(pending).rejects.toMatchObject({ type: 'timeout' });
      await jest.advanceTimersByTimeAsync(60000);
      await rejection;

      expect(lastXhr().isSettled).toBe(true); // the request was aborted, not left dangling
      const beacons = beaconCalls(fetchMock);
      expect(beacons).toHaveLength(1);
      expect(beaconBody(fetchMock)).toEqual({ method: 'ocr', reason: 'timeout', elapsed_ms: 60000 });
      expect(beacons[0][1].headers['X-Client']).toBe('ios');
      expect(beacons[0][1].headers['X-Client-Version']).toBe(APP_VERSION);
    } finally {
      jest.useRealTimers();
    }
  });

  it('sends the app version on the barcode request so releases are attributable', async () => {
    const fetchMock = mockFetch({ barcode: Promise.reject(new Error('Network request failed')) });
    await expect(lookupBarcode('012345678905')).rejects.toBeDefined();

    const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/api/barcode'));
    expect(call[1].headers['X-Client-Version']).toBe(APP_VERSION);
    expect(call[1].headers['X-Client']).toBe('ios');
  });

  it('fires an ocr/network beacon when the analyze request hits a network error', async () => {
    const fetchMock = mockFetch();
    xhrScript = { kind: 'networkError' };

    await expect(analyzeImage('base64data')).rejects.toMatchObject({ type: 'network' });

    expect(beaconCalls(fetchMock)).toHaveLength(1);
    expect(beaconBody(fetchMock)).toMatchObject({ method: 'ocr', reason: 'network', elapsed_ms: expect.any(Number) });
  });

  it('fires a barcode/network beacon when the barcode lookup hits a network error', async () => {
    const fetchMock = mockFetch({ barcode: Promise.reject(new Error('Network request failed')) });

    await expect(lookupBarcode('012345678905')).rejects.toMatchObject({ type: 'network' });

    expect(beaconCalls(fetchMock)).toHaveLength(1);
    expect(beaconBody(fetchMock)).toMatchObject({ method: 'barcode', reason: 'network' });
  });

  it('does not fire a beacon for server errors — the server already records those', async () => {
    const fetchMock = mockFetch();
    xhrScript = { kind: 'respond', status: 500, body: {} };

    await expect(analyzeImage('base64data')).rejects.toMatchObject({ type: 'server_error' });
    expect(beaconCalls(fetchMock)).toHaveLength(0);
  });

  it('fires an ocr/cancelled beacon with how long the user waited, and still surfaces the AbortError', async () => {
    // Before plans/weak-signal-upload-2026-08-28.md a cancel left no trace
    // anywhere — the 2026-08-28 field incident (three attempts, one verdict)
    // recorded as one clean success.
    const fetchMock = mockFetch();
    xhrScript = { kind: 'hang', uploadEvents: [[200, 1000]] };
    const controller = new AbortController();

    const pending = analyzeImage('base64data', controller.signal);
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await flush();
    controller.abort();
    await rejection;

    expect(beaconCalls(fetchMock)).toHaveLength(1);
    const body = beaconBody(fetchMock);
    expect(body).toMatchObject({ method: 'ocr', reason: 'cancelled' });
    expect(body.elapsed_ms).toBeGreaterThanOrEqual(0);
    // The beacon must never carry the image (privacy: no record of what you scanned).
    expect(JSON.stringify(body)).not.toContain('base64data');
  });

  it('fires a barcode/cancelled beacon when a barcode lookup is cancelled', async () => {
    let rejectBarcode: (e: Error) => void = () => {};
    const barcode = new Promise((_, reject) => {
      rejectBarcode = reject;
    });
    const fetchMock = mockFetch({ barcode });
    const controller = new AbortController();

    const pending = lookupBarcode('012345678905', controller.signal);
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await flush();
    controller.abort();
    const e = new Error('Aborted');
    e.name = 'AbortError';
    rejectBarcode(e);
    await rejection;

    expect(beaconCalls(fetchMock)).toHaveLength(1);
    expect(beaconBody(fetchMock)).toMatchObject({ method: 'barcode', reason: 'cancelled', elapsed_ms: expect.any(Number) });
  });

  it('a failing beacon never changes the error surfaced to the user', async () => {
    const fetchMock = mockFetch({ beaconError: new Error('beacon also failed') });
    xhrScript = { kind: 'networkError' };

    await expect(analyzeImage('base64data')).rejects.toMatchObject({
      name: 'APIError',
      type: 'network',
    });
    expect(beaconCalls(fetchMock)).toHaveLength(1);
  });

  it('a missing fetch implementation cannot break a scan either', async () => {
    (global as any).fetch = undefined;
    xhrScript = { kind: 'networkError' };

    await expect(analyzeImage('base64data')).rejects.toMatchObject({ type: 'network' });
  });
});
