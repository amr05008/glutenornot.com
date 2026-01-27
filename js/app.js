/**
 * Main Application
 * Orchestrates the GlutenOrNot PWA
 */

import { initCamera, initDropZone } from './camera.js';
import { analyzeImage, APIError, ErrorType } from './api.js';
import {
  showProcessing,
  showReady,
  showOffline,
  showResult,
  showError,
  updateScanCounter,
  initModal,
  getState,
  STATES
} from './ui.js';

// Storage key for scan count
const SCAN_COUNT_KEY = 'glutenornot_scan_count';
const SCAN_DATE_KEY = 'glutenornot_scan_date';

// Store current image for result display
let currentImage = null;

/**
 * Initialize the application
 */
function init() {
  // Register service worker
  registerServiceWorker();

  // Initialize UI components
  initModal();

  // Initialize camera with callback
  initCamera(handleImageCapture);

  // Initialize drag-and-drop support
  initDropZone(handleImageCapture);

  // Set up event listeners
  setupEventListeners();

  // Handle online/offline status
  setupNetworkListeners();

  // Update scan counter display
  updateScanCountDisplay();

  // Check initial online status
  if (!navigator.onLine) {
    showOffline();
  }
}

/**
 * Register the service worker
 */
async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('Service Worker registered:', registration.scope);
    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  }
}

/**
 * Set up event listeners for buttons
 */
function setupEventListeners() {
  // Retry button
  const retryBtn = document.getElementById('retry-btn');
  retryBtn.addEventListener('click', () => {
    showReady();
  });

  // Scan again button
  const scanAgainBtn = document.getElementById('scan-again-btn');
  scanAgainBtn.addEventListener('click', () => {
    currentImage = null;
    showReady();
  });
}

/**
 * Set up network status listeners
 */
function setupNetworkListeners() {
  window.addEventListener('online', () => {
    if (getState() === STATES.OFFLINE) {
      showReady();
    }
  });

  window.addEventListener('offline', () => {
    // Only show offline if we're not in the middle of showing a result
    if (getState() !== STATES.RESULT) {
      showOffline();
    }
  });
}

/**
 * Handle captured image
 */
async function handleImageCapture(base64Image) {
  // Check online status first
  if (!navigator.onLine) {
    showOffline();
    return;
  }

  currentImage = base64Image;
  showProcessing();

  try {
    const result = await analyzeImage(base64Image);

    // Increment scan count on success
    incrementScanCount();
    updateScanCountDisplay();

    showResult(result, currentImage);

  } catch (error) {
    handleError(error);
  }
}

/**
 * Handle errors from the API
 */
function handleError(error) {
  if (error instanceof APIError) {
    switch (error.type) {
      case ErrorType.NETWORK:
        if (!navigator.onLine) {
          showOffline();
        } else {
          showError('Connection Error', error.message);
        }
        break;

      case ErrorType.TIMEOUT:
        showError('Request Timeout', error.message);
        break;

      case ErrorType.RATE_LIMIT:
        showError('Limit Reached', error.message);
        break;

      case ErrorType.OCR_FAILED:
        showError("Couldn't Read Label", error.message);
        break;

      case ErrorType.SERVER_ERROR:
        showError('Service Unavailable', error.message);
        break;

      default:
        showError('Something Went Wrong', error.message);
    }
  } else {
    console.error('Unexpected error:', error);
    showError('Something Went Wrong', 'Please try again.');
  }
}

/**
 * Get today's date string for comparison
 */
function getTodayString() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Get the current scan count for today
 */
function getScanCount() {
  const storedDate = localStorage.getItem(SCAN_DATE_KEY);
  const today = getTodayString();

  if (storedDate !== today) {
    // Reset count for new day
    localStorage.setItem(SCAN_DATE_KEY, today);
    localStorage.setItem(SCAN_COUNT_KEY, '0');
    return 0;
  }

  return parseInt(localStorage.getItem(SCAN_COUNT_KEY) || '0', 10);
}

/**
 * Increment the scan count
 */
function incrementScanCount() {
  const today = getTodayString();
  const storedDate = localStorage.getItem(SCAN_DATE_KEY);

  if (storedDate !== today) {
    localStorage.setItem(SCAN_DATE_KEY, today);
    localStorage.setItem(SCAN_COUNT_KEY, '1');
  } else {
    const count = getScanCount();
    localStorage.setItem(SCAN_COUNT_KEY, String(count + 1));
  }
}

/**
 * Update the scan counter display
 */
function updateScanCountDisplay() {
  const count = getScanCount();
  updateScanCounter(count);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
