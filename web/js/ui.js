/**
 * UI State Management
 * Handles showing/hiding states and rendering results
 */

import { VERDICT_CONFIG } from './config.js';

// Inline SVG marks (ported from the V2 design package, gon-shared.jsx).
// stroke="currentColor" so color is driven by the surrounding element.
const ICON = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4.5L21 19.5H3z"/><path d="M12 10v4.5"/><path d="M12 17.4v.1"/></svg>',
  cross: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7"/></svg>',
};

// Allergen-warning row glyph (thinner stroke than the band glyph).
const ROW_ALERT_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4.5L21 19.5H3z"/><path d="M12 10v4.5"/><path d="M12 17.4v.1"/></svg>';

// Confidence → number of filled meter segments
const CONFIDENCE_LEVEL = { high: 3, medium: 2, low: 1 };

const STATES = {
  READY: 'ready',
  PROCESSING: 'processing',
  RESULT: 'result',
  ERROR: 'error',
  OFFLINE: 'offline'
};

let currentState = STATES.READY;

/**
 * Switch to a new UI state
 */
function setState(newState) {
  const states = document.querySelectorAll('.state');
  states.forEach(state => state.classList.remove('active'));

  const targetState = document.getElementById(`state-${newState}`);
  if (targetState) {
    targetState.classList.add('active');
    currentState = newState;
  }
}

/**
 * Get the current UI state
 */
function getState() {
  return currentState;
}

/**
 * Show the processing state
 */
function showProcessing() {
  setState(STATES.PROCESSING);
}

/**
 * Show the ready state
 */
function showReady() {
  setState(STATES.READY);
}

/**
 * Show the offline state
 */
function showOffline() {
  setState(STATES.OFFLINE);
}

/**
 * Build a result row: leading dot (flagged) or alert glyph (warning) + text.
 * Text is set via textContent — no HTML injection.
 */
function buildRow(text, variant) {
  const li = document.createElement('li');
  if (variant === 'warning') {
    const glyph = document.createElement('span');
    glyph.className = 'row-glyph';
    glyph.innerHTML = ROW_ALERT_SVG;
    li.appendChild(glyph);
  } else {
    const dot = document.createElement('span');
    dot.className = 'row-dot';
    li.appendChild(dot);
  }
  const span = document.createElement('span');
  span.className = 'row-text';
  span.textContent = text;
  li.appendChild(span);
  return li;
}

/**
 * Render and show the result
 */
function showResult(result) {
  const { verdict, flagged_ingredients, allergen_warnings, explanation, confidence } = result;
  const config = VERDICT_CONFIG[verdict] || VERDICT_CONFIG.caution;

  // Verdict color theming is scoped to the card via its verdict class
  const resultCard = document.getElementById('result-card');
  resultCard.className = `result-card ${verdict}`;

  // Verdict band — glyph mark + word
  const verdictIcon = document.getElementById('verdict-icon');
  const verdictText = document.getElementById('verdict-text');
  verdictIcon.innerHTML = ICON[config.glyph] || ICON.alert;
  verdictText.textContent = config.label;

  // Flagged ingredients
  const flaggedSection = document.getElementById('flagged-section');
  const flaggedList = document.getElementById('flagged-list');
  flaggedList.innerHTML = '';
  if (flagged_ingredients && flagged_ingredients.length > 0) {
    flaggedSection.style.display = 'block';
    flagged_ingredients.forEach(ingredient => flaggedList.appendChild(buildRow(ingredient, 'flagged')));
  } else {
    flaggedSection.style.display = 'none';
  }

  // Allergen warnings
  const warningsSection = document.getElementById('warnings-section');
  const warningsList = document.getElementById('warnings-list');
  warningsList.innerHTML = '';
  if (allergen_warnings && allergen_warnings.length > 0) {
    warningsSection.style.display = 'block';
    allergen_warnings.forEach(warning => warningsList.appendChild(buildRow(warning, 'warning')));
  } else {
    warningsSection.style.display = 'none';
  }

  // Explanation
  document.getElementById('explanation-text').textContent = explanation || '';

  // Confidence — fill meter segments + capitalized level
  const confidenceSection = document.getElementById('confidence-section');
  const confidenceValue = document.getElementById('confidence-value');
  if (confidence) {
    confidenceSection.style.display = 'flex';
    confidenceValue.textContent = confidence;
    const level = CONFIDENCE_LEVEL[confidence] || 0;
    confidenceSection.querySelectorAll('.conf-seg').forEach((seg, i) => {
      seg.classList.toggle('filled', i < level);
    });
  } else {
    confidenceSection.style.display = 'none';
  }

  setState(STATES.RESULT);
}

/**
 * Show an error message
 */
function showError(title, message) {
  const errorTitle = document.getElementById('error-title');
  const errorMessage = document.getElementById('error-message');

  errorTitle.textContent = title || 'Something went wrong';
  errorMessage.textContent = message || 'Please try again.';

  setState(STATES.ERROR);
}

/**
 * Update the scan counter in the footer
 */
function updateScanCounter(count) {
  const counter = document.getElementById('scan-counter');
  if (counter) {
    if (count === 1) {
      counter.textContent = '1 scan';
    } else {
      counter.textContent = `${count} scans`;
    }
  }
}

/**
 * Initialize the about modal
 */
function initModal() {
  const aboutBtn = document.getElementById('about-btn');
  const modal = document.getElementById('about-modal');
  const closeBtn = document.getElementById('modal-close');
  const backdrop = modal.querySelector('.modal-backdrop');

  const openModal = () => {
    modal.hidden = false;
  };

  const closeModal = () => {
    modal.hidden = true;
  };

  aboutBtn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);
  backdrop.addEventListener('click', closeModal);

  // Close on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) {
      closeModal();
    }
  });
}

export {
  STATES,
  setState,
  getState,
  showProcessing,
  showReady,
  showOffline,
  showResult,
  showError,
  updateScanCounter,
  initModal
};
