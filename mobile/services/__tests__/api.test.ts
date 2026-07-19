jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn(),
}));

import * as Network from 'expo-network';
import { analyzeImage, lookupBarcode, APIError } from '../api';

const mockedGetNetworkState = Network.getNetworkStateAsync as jest.Mock;

function mockFetchOk(body: unknown = { verdict: 'safe' }) {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => body,
  });
  (global as any).fetch = fetchMock;
  return fetchMock;
}

beforeEach(() => {
  mockedGetNetworkState.mockReset();
  (global as any).fetch = undefined;
});

describe('pre-flight connectivity guard', () => {
  it('analyzeImage fails fast with a network error when offline — never hits the network', async () => {
    mockedGetNetworkState.mockResolvedValue({ isConnected: false, isInternetReachable: false });
    const fetchMock = mockFetchOk();

    await expect(analyzeImage('base64data')).rejects.toMatchObject({
      name: 'APIError',
      type: 'network',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lookupBarcode fails fast with a network error when offline — never hits the network', async () => {
    mockedGetNetworkState.mockResolvedValue({ isConnected: false, isInternetReachable: false });
    const fetchMock = mockFetchOk();

    await expect(lookupBarcode('012345678905')).rejects.toBeInstanceOf(APIError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('proceeds to the request when connected', async () => {
    mockedGetNetworkState.mockResolvedValue({ isConnected: true, isInternetReachable: true });
    const fetchMock = mockFetchOk({ verdict: 'safe' });

    await expect(analyzeImage('base64data')).resolves.toEqual({ verdict: 'safe' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not block when reachability is unknown (isInternetReachable null)', async () => {
    mockedGetNetworkState.mockResolvedValue({ isConnected: true, isInternetReachable: null });
    const fetchMock = mockFetchOk();

    await expect(analyzeImage('base64data')).resolves.toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never lets a failing connectivity probe block a scan — falls through to the request', async () => {
    mockedGetNetworkState.mockRejectedValue(new Error('probe unavailable'));
    const fetchMock = mockFetchOk();

    await expect(analyzeImage('base64data')).resolves.toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('failure beacon (timeout/network → POST /api/track)', () => {
  // Discriminate by URL: the scan request fails per `scanError`, the beacon
  // call succeeds (or fails, per `beaconError`) — mirrors production where
  // both go through the same global fetch.
  function mockFetchScanFails(scanError: Error, beaconError?: Error) {
    const fetchMock = jest.fn().mockImplementation((url: string) => {
      if (String(url).includes('/api/track')) {
        return beaconError
          ? Promise.reject(beaconError)
          : Promise.resolve({ ok: true, status: 204 });
      }
      return Promise.reject(scanError);
    });
    (global as any).fetch = fetchMock;
    return fetchMock;
  }

  function beaconCalls(fetchMock: jest.Mock) {
    return fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/track'));
  }

  function abortError() {
    const e = new Error('Aborted');
    e.name = 'AbortError';
    return e;
  }

  beforeEach(() => {
    mockedGetNetworkState.mockResolvedValue({ isConnected: true, isInternetReachable: true });
  });

  it('fires an ocr/timeout beacon when the analyze request times out', async () => {
    const fetchMock = mockFetchScanFails(abortError());

    await expect(analyzeImage('base64data')).rejects.toMatchObject({ type: 'timeout' });

    const beacons = beaconCalls(fetchMock);
    expect(beacons).toHaveLength(1);
    expect(JSON.parse(beacons[0][1].body)).toEqual({ method: 'ocr', reason: 'timeout' });
    // Without X-Client the server buckets platform as "unknown" and the
    // per-platform failure dashboards silently miscount.
    expect(beacons[0][1].headers['X-Client']).toBe('ios');
  });

  it('fires an ocr/network beacon when the analyze request hits a network error', async () => {
    const fetchMock = mockFetchScanFails(new Error('Network request failed'));

    await expect(analyzeImage('base64data')).rejects.toMatchObject({ type: 'network' });

    const beacons = beaconCalls(fetchMock);
    expect(beacons).toHaveLength(1);
    expect(JSON.parse(beacons[0][1].body)).toEqual({ method: 'ocr', reason: 'network' });
  });

  it('fires a barcode/network beacon when the barcode lookup hits a network error', async () => {
    const fetchMock = mockFetchScanFails(new Error('Network request failed'));

    await expect(lookupBarcode('012345678905')).rejects.toMatchObject({ type: 'network' });

    const beacons = beaconCalls(fetchMock);
    expect(beacons).toHaveLength(1);
    expect(JSON.parse(beacons[0][1].body)).toEqual({ method: 'barcode', reason: 'network' });
  });

  it('does not fire a beacon for server errors — the server already records those', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });
    (global as any).fetch = fetchMock;

    await expect(analyzeImage('base64data')).rejects.toMatchObject({ type: 'server_error' });
    expect(beaconCalls(fetchMock)).toHaveLength(0);
  });

  it('does not fire a beacon when the user cancelled the scan', async () => {
    const controller = new AbortController();
    const fetchMock = jest.fn().mockImplementation(() => {
      controller.abort();
      return Promise.reject(abortError());
    });
    (global as any).fetch = fetchMock;

    await expect(analyzeImage('base64data', controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(beaconCalls(fetchMock)).toHaveLength(0);
  });

  it('a failing beacon never changes the error surfaced to the user', async () => {
    const fetchMock = mockFetchScanFails(
      new Error('Network request failed'),
      new Error('beacon also failed')
    );

    await expect(analyzeImage('base64data')).rejects.toMatchObject({
      name: 'APIError',
      type: 'network',
    });
    expect(beaconCalls(fetchMock)).toHaveLength(1);
  });
});
