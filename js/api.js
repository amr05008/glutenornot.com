/**
 * API Client
 * Handles communication with serverless functions
 */

const API_TIMEOUT = 30000; // 30 seconds

/**
 * Error types for handling
 */
const ErrorType = {
  NETWORK: 'network',
  TIMEOUT: 'timeout',
  RATE_LIMIT: 'rate_limit',
  OCR_FAILED: 'ocr_failed',
  SERVER_ERROR: 'server_error',
  UNKNOWN: 'unknown'
};

/**
 * Custom error class with type information
 */
class APIError extends Error {
  constructor(type, message, retryAfter = null) {
    super(message);
    this.type = type;
    this.retryAfter = retryAfter;
    this.name = 'APIError';
  }
}

/**
 * Analyze an ingredient label image
 * @param {string} base64Image - Base64 encoded image data
 * @returns {Promise<Object>} - Analysis result
 */
async function analyzeImage(base64Image) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ image: base64Image }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return handleErrorResponse(response);
    }

    const result = await response.json();
    return result;

  } catch (error) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      throw new APIError(
        ErrorType.TIMEOUT,
        'Analysis is taking longer than usual. Please try again.'
      );
    }

    if (!navigator.onLine) {
      throw new APIError(
        ErrorType.NETWORK,
        "You're offline. Connect to scan labels."
      );
    }

    throw new APIError(
      ErrorType.NETWORK,
      'Unable to connect. Please check your internet connection.'
    );
  }
}

/**
 * Handle error responses from the API
 */
async function handleErrorResponse(response) {
  let errorData;

  try {
    errorData = await response.json();
  } catch {
    errorData = {};
  }

  switch (response.status) {
    case 429:
      const retryAfter = response.headers.get('Retry-After');
      throw new APIError(
        ErrorType.RATE_LIMIT,
        errorData.message || "You've reached today's scan limit. Try again tomorrow.",
        retryAfter ? parseInt(retryAfter, 10) : null
      );

    case 400:
      if (errorData.code === 'OCR_FAILED') {
        throw new APIError(
          ErrorType.OCR_FAILED,
          errorData.message || "Couldn't read the label. Try getting the ingredients list in focus."
        );
      }
      throw new APIError(
        ErrorType.UNKNOWN,
        errorData.message || 'Invalid request. Please try again.'
      );

    case 503:
      throw new APIError(
        ErrorType.SERVER_ERROR,
        'Our analysis service is temporarily unavailable. Please try again in a few minutes.'
      );

    default:
      throw new APIError(
        ErrorType.SERVER_ERROR,
        errorData.message || 'Something went wrong. Please try again.'
      );
  }
}

/**
 * Check API health status
 * @returns {Promise<Object>} - Health status
 */
async function checkHealth() {
  try {
    const response = await fetch('/api/health', {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      return { healthy: false };
    }

    return await response.json();
  } catch {
    return { healthy: false };
  }
}

export {
  analyzeImage,
  checkHealth,
  APIError,
  ErrorType
};
