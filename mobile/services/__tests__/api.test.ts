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
