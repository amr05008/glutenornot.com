import { API_URL, AnalysisResult } from '../constants/verdicts';

export type ErrorType = 'network' | 'timeout' | 'rate_limit' | 'ocr_failed' | 'server_error';

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

const TIMEOUT_MS = 60000; // 60 seconds - OCR + Claude can take a while

export async function analyzeImage(
  base64Image: string,
  externalSignal?: AbortSignal,
): Promise<AnalysisResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  // If external signal fires, abort our internal controller too
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener('abort', onExternalAbort);

  console.log('Starting API call to:', API_URL);
  console.log('Payload size:', Math.round(base64Image.length / 1024), 'KB');
  const startTime = Date.now();

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ image: base64Image }),
      signal: controller.signal,
    });

    console.log('Response received in', Date.now() - startTime, 'ms');

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
        throw new APIError(
          'Request timed out. Please check your connection and try again.',
          'timeout'
        );
      }

      if (error.message.includes('Network') || error.message.includes('fetch')) {
        throw new APIError(
          'Network error. Please check your connection.',
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
