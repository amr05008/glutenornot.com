import * as Sentry from '@sentry/react-native';
import { APIError } from './api';

export { Sentry };

export function reportError(error: unknown, extra?: Record<string, unknown>): void {
  if (error instanceof APIError) {
    // Normal user flows, not actionable errors — don't report:
    // - not_found: barcode not in any database
    // - ocr_failed: photo too blurry/off-angle to read; user is already prompted to refocus
    if (error.type === 'not_found' || error.type === 'ocr_failed') return;

    const isExpected = error.type === 'network' || error.type === 'timeout'
      || error.type === 'rate_limit' || error.type === 'invalid_input';
    Sentry.captureException(error, {
      tags: { error_type: error.type },
      level: isExpected ? 'warning' : 'error',
      ...(extra && { extra }),
    });
  } else {
    Sentry.captureException(error, extra ? { extra } : undefined);
  }
}
