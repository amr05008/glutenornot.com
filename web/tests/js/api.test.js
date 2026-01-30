import { describe, it, expect } from 'vitest';
import { handleErrorResponse, APIError, ErrorType } from '../../js/api.js';

// Helper to create mock Response objects
function createMockResponse(status, body = {}, headers = {}) {
  return {
    status,
    headers: {
      get: (name) => headers[name] || null
    },
    json: async () => body
  };
}

// Helper to create mock Response that fails JSON parsing
function createMockResponseNoJson(status, headers = {}) {
  return {
    status,
    headers: {
      get: (name) => headers[name] || null
    },
    json: async () => {
      throw new Error('Invalid JSON');
    }
  };
}

describe('handleErrorResponse', () => {
  it('returns RATE_LIMIT error for 429 with Retry-After header', async () => {
    const response = createMockResponse(
      429,
      { message: "You've reached today's limit" },
      { 'Retry-After': '3600' }
    );

    await expect(handleErrorResponse(response)).rejects.toMatchObject({
      type: ErrorType.RATE_LIMIT,
      retryAfter: 3600,
      message: "You've reached today's limit"
    });
  });

  it('returns RATE_LIMIT error for 429 without Retry-After header', async () => {
    const response = createMockResponse(429, { message: 'Rate limited' });

    await expect(handleErrorResponse(response)).rejects.toMatchObject({
      type: ErrorType.RATE_LIMIT,
      retryAfter: null
    });
  });

  it('returns OCR_FAILED error for 400 with OCR_FAILED code', async () => {
    const response = createMockResponse(400, {
      code: 'OCR_FAILED',
      message: "Couldn't read the label"
    });

    await expect(handleErrorResponse(response)).rejects.toMatchObject({
      type: ErrorType.OCR_FAILED,
      message: "Couldn't read the label"
    });
  });

  it('returns UNKNOWN error for 400 without OCR code', async () => {
    const response = createMockResponse(400, { error: 'Bad request' });

    await expect(handleErrorResponse(response)).rejects.toMatchObject({
      type: ErrorType.UNKNOWN
    });
  });

  it('returns SERVER_ERROR for 503 response', async () => {
    const response = createMockResponse(503, {});

    await expect(handleErrorResponse(response)).rejects.toMatchObject({
      type: ErrorType.SERVER_ERROR
    });
  });

  it('returns SERVER_ERROR for 500 response', async () => {
    const response = createMockResponse(500, { message: 'Internal error' });

    await expect(handleErrorResponse(response)).rejects.toMatchObject({
      type: ErrorType.SERVER_ERROR,
      message: 'Internal error'
    });
  });

  it('handles response with no JSON body gracefully', async () => {
    const response = createMockResponseNoJson(500);

    await expect(handleErrorResponse(response)).rejects.toMatchObject({
      type: ErrorType.SERVER_ERROR
    });
  });
});

describe('APIError', () => {
  it('creates error with correct properties', () => {
    const error = new APIError(ErrorType.RATE_LIMIT, 'Test message', 3600);

    expect(error).toBeInstanceOf(Error);
    expect(error.type).toBe(ErrorType.RATE_LIMIT);
    expect(error.message).toBe('Test message');
    expect(error.retryAfter).toBe(3600);
    expect(error.name).toBe('APIError');
  });

  it('creates error with null retryAfter by default', () => {
    const error = new APIError(ErrorType.NETWORK, 'Network error');

    expect(error.retryAfter).toBeNull();
  });
});

describe('ErrorType', () => {
  it('has all expected error types', () => {
    expect(ErrorType.NETWORK).toBe('network');
    expect(ErrorType.TIMEOUT).toBe('timeout');
    expect(ErrorType.RATE_LIMIT).toBe('rate_limit');
    expect(ErrorType.OCR_FAILED).toBe('ocr_failed');
    expect(ErrorType.SERVER_ERROR).toBe('server_error');
    expect(ErrorType.UNKNOWN).toBe('unknown');
  });
});
