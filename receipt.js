/* =========================================================================
   RECEIPT SCANNING
   Turns a camera photo of a receipt into (a) a small compressed thumbnail
   safe to keep in localStorage, and (b) a best-guess dollar amount read
   off the receipt via on-device OCR (Tesseract.js, loaded lazily from a
   CDN only when the user actually taps "Scan receipt" — nothing is
   uploaded anywhere, the image never leaves the device). The guess is
   just a starting point: ui.js always requires the user to confirm (or
   correct) the amount before the expense is saved.
   ========================================================================= */
const TESSERACT_CDN_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';

const RECEIPT_THUMB_MAX_DIM = 160;   // stored with the expense — keep tiny
const RECEIPT_THUMB_QUALITY = 0.5;
const RECEIPT_OCR_MAX_DIM = 1400;    // only used in-memory for reading text
const RECEIPT_OCR_QUALITY = 0.85;

let _tesseractLoadPromise = null;

function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (_tesseractLoadPromise) return _tesseractLoadPromise;
  _tesseractLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TESSERACT_CDN_URL;
    script.onload = () => resolve(window.Tesseract);
    script.onerror = () => reject(new Error('Could not load OCR library'));
    document.head.appendChild(script);
  });
  return _tesseractLoadPromise;
}

function _loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    img.src = url;
  });
}

function _resizeToDataUrl(img, maxDim, quality) {
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

// Picks the dollar amount most likely to be the receipt total: prefers a
// line containing "total" (but not "subtotal"), otherwise falls back to
// the largest amount found anywhere in the text.
function guessAmountFromText(text) {
  const lines = text.split('\n');
  const amountPattern = /\$?\s?(\d{1,4}\.\d{2})/;

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.includes('total') && !lower.includes('subtotal')) {
      const match = line.match(amountPattern);
      if (match) return parseFloat(match[1]);
    }
  }

  const allMatches = [...text.matchAll(new RegExp(amountPattern, 'g'))].map(m => parseFloat(m[1]));
  if (allMatches.length === 0) return null;
  return Math.max(...allMatches);
}

// Returns { thumbnail, guessedAmount, rawText }. `onStatus(text)` is called
// with short progress updates suitable for showing next to the form.
async function scanReceipt(file, { onStatus = () => {} } = {}) {
  onStatus('Reading image…');
  const img = await _loadImage(file);
  const thumbnail = _resizeToDataUrl(img, RECEIPT_THUMB_MAX_DIM, RECEIPT_THUMB_QUALITY);
  const ocrImage = _resizeToDataUrl(img, RECEIPT_OCR_MAX_DIM, RECEIPT_OCR_QUALITY);

  onStatus('Loading OCR engine…');
  const Tesseract = await loadTesseract();

  onStatus('Scanning receipt…');
  const { data } = await Tesseract.recognize(ocrImage, 'eng');

  const guessedAmount = guessAmountFromText(data.text || '');
  return { thumbnail, guessedAmount, rawText: data.text || '' };
}
