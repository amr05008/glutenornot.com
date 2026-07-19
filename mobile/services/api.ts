import * as Network from 'expo-network';
import { API_URL, BARCODE_API_URL, TRACK_API_URL, AnalysisResult } from '../constants/verdicts';

export type ErrorType = 'network' | 'timeout' | 'rate_limit' | 'ocr_failed' | 'server_error' | 'not_found' | 'invalid_input';

export class APIError extends Error {
  type: ErrorType;
  retryAfter?: string;

  constructor(message: string, type: ErrorType, retryAfter?: string) {
    super(message);
    this.name = 'APIError';
    this.type = type;
    this.retryAfter = retryAfter;
  }
}

// Connectivity-framed user messages. A failed scan is almost always the
// network, not the app — say so, so it doesn't read as "the app is broken."
const OFFLINE_MESSAGE = 'You appear to be offline. Check your connection and try again.';
const NETWORK_MESSAGE = "Connection problem — your scan didn't go through. Check your signal and try again.";
const TIMEOUT_MESSAGE = "Weak connection — your scan didn't go through. Check your signal and try again.";

// Pre-flight connectivity check: turns a 30–60s wait for a request that can
// never land into instant, clear feedback. Never let the probe itself block a
// scan — on any uncertainty (probe error, or unknown reachability) fall through
// and let the real request be the source of truth.
async function ensureConnected(): Promise<void> {
  let state: Network.NetworkState;
  try {
    state = await Network.getNetworkStateAsync();
  } catch {
    return; // Probe failed — don't block; let the actual request decide.
  }
  if (state.isConnected === false || state.isInternetReachable === false) {
    throw new APIError(OFFLINE_MESSAGE, 'network');
  }
}

// Failure beacon: a timeout or dropped connection dies on the wire, so the
// server never sees it and scan_failed under-counts exactly the failures that
// hurt most in-store. Fire-and-forget — never awaited on the user path, and a
// failing beacon must never alter the error the user sees. Deliberately not
// fired from the pre-flight offline check: those requests were never sent, and
// a hard-offline beacon can't be delivered anyway.
function sendFailureBeacon(method: 'ocr' | 'barcode', reason: 'timeout' | 'network'): void {
  try {
    fetch(TRACK_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Client': 'ios' },
      body: JSON.stringify({ method, reason }),
    }).catch(() => {});
  } catch {
    // Telemetry can never break a scan.
  }
}

const TIMEOUT_MS = 60000; // 60 seconds - OCR + Claude can take a while

export async function analyzeImage(
  base64Image: string,
  externalSignal?: AbortSignal,
): Promise<AnalysisResult> {
  await ensureConnected();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  // If external signal fires, abort our internal controller too
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener('abort', onExternalAbort);

  // Dev-only: Sentry captures console output as breadcrumbs in release builds,
  // so nothing scan-related may be logged outside __DEV__ ("no record of what
  // you scanned" — the privacy policy's promise applies to Sentry too).
  if (__DEV__) {
    console.log('Starting API call to:', API_URL);
    console.log('Payload size:', Math.round(base64Image.length / 1024), 'KB');
  }
  const startTime = Date.now();

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client': 'ios',
      },
      body: JSON.stringify({ image: base64Image }),
      signal: controller.signal,
    });

    if (__DEV__) console.log('Response received in', Date.now() - startTime, 'ms');

    clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', onExternalAbort);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));

      if (response.status === 429) {
        throw new APIError(
          data.message || 'Rate limit exceeded. Please try again later.',
          'rate_limit',
          data.retryAfter
        );
      }

      if (response.status === 400 && data.code === 'OCR_FAILED') {
        throw new APIError(
          data.message || "Couldn't read the label. Try getting the ingredients list in focus.",
          'ocr_failed'
        );
      }

      throw new APIError(
        data.message || 'Something went wrong. Please try again.',
        'server_error'
      );
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', onExternalAbort);

    if (error instanceof APIError) {
      throw error;
    }

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        if (externalSignal?.aborted) {
          throw error; // User cancelled — preserve AbortError for caller
        }
        sendFailureBeacon('ocr', 'timeout');
        throw new APIError(
          TIMEOUT_MESSAGE,
          'timeout'
        );
      }

      if (error.message.includes('Network') || error.message.includes('fetch')) {
        sendFailureBeacon('ocr', 'network');
        throw new APIError(
          NETWORK_MESSAGE,
          'network'
        );
      }
    }

    throw new APIError(
      'Something went wrong. Please try again.',
      'server_error'
    );
  }
}

const BARCODE_TIMEOUT_MS = 30000; // 30 seconds — no image upload needed

export async function lookupBarcode(
  barcode: string,
  externalSignal?: AbortSignal,
): Promise<AnalysisResult> {
  await ensureConnected();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BARCODE_TIMEOUT_MS);

  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener('abort', onExternalAbort);

  // Dev-only: the barcode value identifies a product — must never reach the
  // release console (Sentry breadcrumbs would carry it off-device).
  if (__DEV__) console.log('Starting barcode lookup:', barcode);
  const startTime = Date.now();

  try {
    const response = await fetch(BARCODE_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Client': 'ios' },
      body: JSON.stringify({ barcode }),
      signal: controller.signal,
    });

    if (__DEV__) console.log('Barcode response received in', Date.now() - startTime, 'ms');

    clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', onExternalAbort);

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));

      if (response.status === 404) {
        throw new APIError(
          data.message || 'Product not found. Try scanning the ingredient label instead.',
          'not_found'
        );
      }

      if (response.status === 429) {
        throw new APIError(
          data.message || 'Rate limit exceeded. Please try again later.',
          'rate_limit',
          data.retryAfter
        );
      }

      if (response.status === 400) {
        throw new APIError(
          data.message || 'Invalid barcode. Try scanning again.',
          'invalid_input'
        );
      }

      throw new APIError(
        data.message || 'Something went wrong. Please try again.',
        'server_error'
      );
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', onExternalAbort);

    if (error instanceof APIError) throw error;

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        if (externalSignal?.aborted) throw error;
        sendFailureBeacon('barcode', 'timeout');
        throw new APIError(TIMEOUT_MESSAGE, 'timeout');
      }
      if (error.message.includes('Network') || error.message.includes('fetch')) {
        sendFailureBeacon('barcode', 'network');
        throw new APIError(NETWORK_MESSAGE, 'network');
      }
    }

    throw new APIError('Something went wrong. Please try again.', 'server_error');
  }
}
