import * as Sentry from '@sentry/react-native';
import { APIError } from './api';

export { Sentry };

export function reportError(error: unknown, extra?: Record<string, unknown>): void {
  if (error instanceof APIError) {
    const isExpected = error.type === 'network' || error.type === 'timeout';
    Sentry.captureException(error, {
      tags: { error_type: error.type },
      level: isExpected ? 'warning' : 'error',
      ...(extra && { extra }),
    });
  } else {
    Sentry.captureException(error, extra ? { extra } : undefined);
  }
}
