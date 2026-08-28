import * as Network from 'expo-network';
import Constants from 'expo-constants';
import { API_URL, BARCODE_API_URL, TRACK_API_URL, AnalysisResult } from '../constants/verdicts';

// Analytics ships server-side, so every event carries $lib_version =
// posthog-node — the SDK's version, not the app's. Without this header a
// release is unattributable: there is no way to tell whether a capture change
// moved the OCR failure rate. Read from app.json (the version the release
// runbook keeps in lockstep) rather than hardcoded, so it can't drift.
const APP_VERSION = Constants.expoConfig?.version;

// Server whitelists this header, so a missing/odd value is simply omitted.
const clientHeaders = (): Record<string, string> => ({
  'Content-Type': 'application/json',
  'X-Client': 'ios',
  ...(APP_VERSION ? { 'X-Client-Version': APP_VERSION } : {}),
});

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

// Failure beacon: a timeout, a dropped connection, or the user giving up all
// die on the client side, so the server never sees them and scan_failed
// under-counts exactly the failures that hurt most in-store. Fire-and-forget —
// never awaited on the user path, and a failing beacon must never alter the
// error the user sees. Deliberately not fired from the pre-flight offline
// check: those requests were never sent, and a hard-offline beacon can't be
// delivered anyway. `elapsedMs` is how long the user waited — on weak signal
// it is the only measurement of the upload leg that exists anywhere
// (plans/weak-signal-upload-2026-08-28.md).
type BeaconReason = 'timeout' | 'network' | 'cancelled';
function sendFailureBeacon(method: 'ocr' | 'barcode', reason: BeaconReason, elapsedMs?: number): void {
  try {
    const elapsed = Number.isFinite(elapsedMs) ? { elapsed_ms: Math.round(elapsedMs as number) } : {};
    fetch(TRACK_API_URL, {
      method: 'POST',
      headers: clientHeaders(),
      body: JSON.stringify({ method, reason, ...elapsed }),
    }).catch(() => {});
  } catch {
    // Telemetry can never break a scan.
  }
}

// Where a scan is in its life, for the reading screen. On 2-bar LTE the ~500 KB
// photo upload is the leg that takes 10–45 s; before this the screen said
// "Reading ingredients…" from t=0 and, at 30 s, told the user to cancel and
// restart the very upload that was about to land. `fetch` cannot see the
// request body going out, so the OCR request goes over XMLHttpRequest, whose
// `upload` target reports progress (React Native wires it to
// didSendNetworkData). "reading" = the body has fully arrived at the server.
export type ScanProgress = { phase: 'uploading'; pct: number } | { phase: 'reading' };
export type ProgressCallback = (progress: ScanProgress) => void;

interface JsonResponse {
  ok: boolean;
  status: number;
  json(): Promise<any>;
}

function abortError(): Error {
  const e = new Error('Aborted');
  e.name = 'AbortError';
  return e;
}

// fetch-shaped POST over XHR so the status handling below is unchanged. Abort
// and timeout keep using the AbortSignal (one mechanism, and the caller's
// timeout-vs-cancel discrimination stays intact); a network failure rejects
// with the same message React Native's fetch uses, so the existing
// classification matches it.
function postJsonWithProgress(
  url: string,
  body: string,
  headers: Record<string, string>,
  signal: AbortSignal,
  onProgress?: ProgressCallback,
): Promise<JsonResponse> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }

    const xhr = new XMLHttpRequest();
    let readingReported = false;
    const report = (progress: ScanProgress) => {
      if (!onProgress) return;
      if (progress.phase === 'reading') {
        if (readingReported) return; // a 100% upload event and the headers arriving both mean this
        readingReported = true;
      }
      try {
        onProgress(progress);
      } catch {
        // The UI can never break a scan.
      }
    };

    const onAbort = () => xhr.abort();
    signal.addEventListener('abort', onAbort);
    const done = () => signal.removeEventListener('abort', onAbort);

    xhr.open('POST', url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable || e.total <= 0) return;
      if (e.loaded >= e.total) report({ phase: 'reading' });
      else report({ phase: 'uploading', pct: Math.round((e.loaded / e.total) * 100) });
    };
    xhr.onreadystatechange = () => {
      if (xhr.readyState >= 2) report({ phase: 'reading' }); // headers received ⇒ upload done
    };
    xhr.onload = () => {
      done();
      const status = xhr.status;
      resolve({
        ok: status >= 200 && status < 300,
        status,
        json: async () => JSON.parse(xhr.responseText),
      });
    };
    xhr.onerror = () => {
      done();
      reject(new TypeError('Network request failed'));
    };
    xhr.onabort = () => {
      done();
      reject(abortError());
    };

    xhr.send(body);
  });
}

const TIMEOUT_MS = 60000; // 60 seconds - OCR + Claude can take a while

export async function analyzeImage(
  base64Image: string,
  externalSignal?: AbortSignal,
  onProgress?: ProgressCallback,
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
    const response = await postJsonWithProgress(
      API_URL,
      JSON.stringify({ image: base64Image }),
      clientHeaders(),
      controller.signal,
      onProgress,
    );

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
          // User cancelled — the one failure that used to leave no trace
          // anywhere (the caller drops AbortError before reporting).
          sendFailureBeacon('ocr', 'cancelled', Date.now() - startTime);
          throw error; // preserve AbortError for caller
        }
        sendFailureBeacon('ocr', 'timeout', Date.now() - startTime);
        throw new APIError(
          TIMEOUT_MESSAGE,
          'timeout'
        );
      }

      if (error.message.includes('Network') || error.message.includes('fetch')) {
        sendFailureBeacon('ocr', 'network', Date.now() - startTime);
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
      headers: clientHeaders(),
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
        if (externalSignal?.aborted) {
          sendFailureBeacon('barcode', 'cancelled', Date.now() - startTime);
          throw error;
        }
        sendFailureBeacon('barcode', 'timeout', Date.now() - startTime);
        throw new APIError(TIMEOUT_MESSAGE, 'timeout');
      }
      if (error.message.includes('Network') || error.message.includes('fetch')) {
        sendFailureBeacon('barcode', 'network', Date.now() - startTime);
        throw new APIError(NETWORK_MESSAGE, 'network');
      }
    }

    throw new APIError('Something went wrong. Please try again.', 'server_error');
  }
}
