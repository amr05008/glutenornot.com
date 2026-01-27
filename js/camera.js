/**
 * Camera and Image Handling
 * Handles photo capture via file input and image processing
 */

const MAX_IMAGE_DIMENSION = 1280;
const JPEG_QUALITY = 0.85;

/**
 * Initialize the camera input and set up event listener
 * @param {Function} onImageCapture - Callback when image is captured
 */
function initCamera(onImageCapture) {
  const cameraInput = document.getElementById('camera-input');

  cameraInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const base64Image = await processImage(file);
      onImageCapture(base64Image);
    } catch (error) {
      console.error('Error processing image:', error);
      throw error;
    }

    // Reset input so same file can be selected again
    cameraInput.value = '';
  });
}

/**
 * Process an image file: resize and convert to base64
 * @param {File} file - The image file
 * @returns {Promise<string>} - Base64 encoded image data (without data URL prefix)
 */
async function processImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.onload = () => {
        try {
          const base64 = resizeAndEncode(img);
          resolve(base64);
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };

      img.src = e.target.result;
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Resize image to max dimension and encode as base64 JPEG
 * @param {HTMLImageElement} img - The loaded image
 * @returns {string} - Base64 encoded image data (without data URL prefix)
 */
function resizeAndEncode(img) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  let { width, height } = img;

  // Calculate new dimensions while maintaining aspect ratio
  if (width > height) {
    if (width > MAX_IMAGE_DIMENSION) {
      height = Math.round((height * MAX_IMAGE_DIMENSION) / width);
      width = MAX_IMAGE_DIMENSION;
    }
  } else {
    if (height > MAX_IMAGE_DIMENSION) {
      width = Math.round((width * MAX_IMAGE_DIMENSION) / height);
      height = MAX_IMAGE_DIMENSION;
    }
  }

  canvas.width = width;
  canvas.height = height;

  // Draw resized image
  ctx.drawImage(img, 0, 0, width, height);

  // Convert to base64 JPEG
  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);

  // Remove the data URL prefix to get raw base64
  const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '');

  return base64;
}

/**
 * Trigger the camera input programmatically
 */
function triggerCapture() {
  const cameraInput = document.getElementById('camera-input');
  cameraInput.click();
}

/**
 * Initialize drag-and-drop and paste support
 * @param {Function} onImageCapture - Callback when image is captured
 */
function initDropZone(onImageCapture) {
  const dropZone = document.getElementById('drop-zone');
  if (!dropZone) return;

  // Prevent default drag behaviors
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
    document.body.addEventListener(eventName, preventDefaults, false);
  });

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  // Highlight drop zone when dragging over
  let dragCounter = 0;

  dropZone.addEventListener('dragenter', () => {
    dragCounter++;
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dragCounter--;
    if (dragCounter === 0) {
      dropZone.classList.remove('drag-over');
    }
  });

  dropZone.addEventListener('drop', async (e) => {
    dragCounter = 0;
    dropZone.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        try {
          const base64Image = await processImage(file);
          onImageCapture(base64Image);
        } catch (error) {
          console.error('Error processing dropped image:', error);
        }
      }
    }
  });

  // Handle paste from clipboard
  document.addEventListener('paste', async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          try {
            const base64Image = await processImage(file);
            onImageCapture(base64Image);
          } catch (error) {
            console.error('Error processing pasted image:', error);
          }
        }
        break;
      }
    }
  });
}

export {
  initCamera,
  initDropZone,
  processImage,
  triggerCapture
};
