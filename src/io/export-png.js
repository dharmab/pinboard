import { LIGHT_COLORS, PADDING, computeBoundingBox, buildInlineCSS, formatDate, sanitizeFilename, imageToDataUrl, downloadBlob } from '../utils/export-helpers.js';

function inlineStyles(clonedSvg, bbox) {
  // Set viewBox to the bounding box so only the content area is rendered
  clonedSvg.setAttribute('viewBox', `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`);
  clonedSvg.setAttribute('width', bbox.width);
  clonedSvg.setAttribute('height', bbox.height);

  // Remove the viewport-transform's translate/scale since we're using viewBox directly
  const vpTransform = clonedSvg.querySelector('#viewport-transform');
  if (vpTransform) vpTransform.removeAttribute('transform');

  // Remove the canvas background rect (we'll draw our own background)
  const bgRect = clonedSvg.querySelector('#canvas-bg');
  if (bgRect) bgRect.remove();

  // Hide interaction elements
  for (const el of clonedSvg.querySelectorAll('.connection-handle, .resize-handle, .connection-hit, .connection-preview')) {
    el.remove();
  }

  // Inject inline CSS with light-mode colors
  const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  styleEl.textContent = buildInlineCSS();
  clonedSvg.insertBefore(styleEl, clonedSvg.firstChild);
}

// Max pixel dimension at which we prefer WebP over PNG (16384px is the WebP max)
const WEBP_MAX_DIMENSION = 16384;

function supportsWebp() {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  return canvas.toDataURL('image/webp').startsWith('data:image/webp');
}

export async function exportTabAsImage(boardName, tabName, scale = 2) {
  const svg = document.getElementById('canvas');
  const bbox = computeBoundingBox(svg);

  // Clone the SVG
  const cloned = svg.cloneNode(true);
  cloned.removeAttribute('id');
  inlineStyles(cloned, bbox);

  // Convert images to data URLs for cross-origin safety
  const images = cloned.querySelectorAll('.card-photo img');
  for (const img of images) {
    const origImg = findOriginalImg(svg, img);
    if (origImg && origImg.complete && origImg.naturalWidth > 0) {
      try {
        const dataUrl = imageToDataUrl(origImg);
        img.setAttribute('src', dataUrl);
      } catch {
        // If conversion fails, keep the blob URL — it may still work
      }
    }
  }

  // Serialize to XML
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(cloned);
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  // Render to canvas
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(bbox.width * scale);
  canvas.height = Math.ceil(bbox.height * scale);
  const ctx = canvas.getContext('2d');

  // Draw background
  ctx.fillStyle = LIGHT_COLORS['--canvas-bg'];
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Choose WebP when dimensions fit and the browser supports it
  const useWebp = supportsWebp() &&
    canvas.width <= WEBP_MAX_DIMENSION &&
    canvas.height <= WEBP_MAX_DIMENSION;
  const mimeType = useWebp ? 'image/webp' : 'image/png';
  const ext = useWebp ? '.webp' : '.png';

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);

      canvas.toBlob((imgBlob) => {
        if (!imgBlob) {
          reject(new Error('Failed to generate image'));
          return;
        }
        const filename = sanitizeFilename(boardName) + '_' + sanitizeFilename(tabName) + '_' + formatDate() + ext;
        downloadBlob(imgBlob, filename);
        resolve();
      }, mimeType, useWebp ? 0.9 : undefined);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to render SVG to image'));
    };
    image.src = url;
  });
}

function findOriginalImg(originalSvg, clonedImg) {
  const allOrigImgs = [...originalSvg.querySelectorAll('.card-photo img')];
  // Use src comparison as a heuristic
  const src = clonedImg.getAttribute('src');
  return allOrigImgs.find(img => img.src === src || img.getAttribute('src') === src);
}
