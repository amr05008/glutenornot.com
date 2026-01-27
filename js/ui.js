/**
 * UI State Management
 * Handles showing/hiding states and rendering results
 */

const STATES = {
  READY: 'ready',
  PROCESSING: 'processing',
  RESULT: 'result',
  ERROR: 'error',
  OFFLINE: 'offline'
};

const VERDICT_ICONS = {
  safe: '✓',
  caution: '⚠',
  unsafe: '✗'
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
  const thumbnail = document.getElementById('result-thumbnail');
  if (thumbnail) {
    thumbnail.style.display = 'none';
    thumbnail.src = '';
  }
  setState(STATES.READY);
}

/**
 * Show the offline state
 */
function showOffline() {
  setState(STATES.OFFLINE);
}

/**
 * Render and show the result
 */
function showResult(result, imageData = null) {
  const { verdict, flagged_ingredients, allergen_warnings, explanation, confidence } = result;

  // Update verdict badge
  const verdictBadge = document.getElementById('verdict-badge');
  const verdictIcon = document.getElementById('verdict-icon');
  const verdictText = document.getElementById('verdict-text');

  verdictBadge.className = `verdict-badge ${verdict}`;
  verdictIcon.textContent = VERDICT_ICONS[verdict] || '';
  verdictText.textContent = verdict;

  // Update flagged ingredients
  const flaggedSection = document.getElementById('flagged-section');
  const flaggedList = document.getElementById('flagged-list');
  flaggedList.innerHTML = '';

  if (flagged_ingredients && flagged_ingredients.length > 0) {
    flaggedSection.style.display = 'block';
    flagged_ingredients.forEach(ingredient => {
      const li = document.createElement('li');
      li.textContent = ingredient;
      flaggedList.appendChild(li);
    });
  } else {
    flaggedSection.style.display = 'none';
  }

  // Update allergen warnings
  const warningsSection = document.getElementById('warnings-section');
  const warningsList = document.getElementById('warnings-list');
  warningsList.innerHTML = '';

  if (allergen_warnings && allergen_warnings.length > 0) {
    warningsSection.style.display = 'block';
    allergen_warnings.forEach(warning => {
      const li = document.createElement('li');
      li.textContent = warning;
      warningsList.appendChild(li);
    });
  } else {
    warningsSection.style.display = 'none';
  }

  // Update explanation
  const explanationText = document.getElementById('explanation-text');
  explanationText.textContent = explanation || '';

  // Update confidence
  const confidenceSection = document.getElementById('confidence-section');
  const confidenceValue = document.getElementById('confidence-value');

  if (confidence) {
    confidenceSection.style.display = 'flex';
    confidenceValue.textContent = confidence;
    confidenceValue.className = `confidence-value ${confidence}`;
  } else {
    confidenceSection.style.display = 'none';
  }

  // Display thumbnail
  const thumbnail = document.getElementById('result-thumbnail');
  if (thumbnail) {
    if (imageData) {
      thumbnail.src = `data:image/jpeg;base64,${imageData}`;
      thumbnail.style.display = 'block';
    } else {
      thumbnail.style.display = 'none';
    }
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
    if (count === 0) {
      counter.textContent = '0 scans today';
    } else if (count === 1) {
      counter.textContent = '1 scan today';
    } else {
      counter.textContent = `${count} scans today`;
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
