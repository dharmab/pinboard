// Light-mode color tokens for consistent PNG export regardless of current theme
const LIGHT_COLORS = {
  '--canvas-bg': '#f1f5f9',
  '--card-bg': '#ffffff',
  '--card-border': '#e2e8f0',
  '--card-title-color': '#0f172a',
  '--card-description-color': '#475569',
  '--group-fill': 'rgba(148, 163, 184, 0.12)',
  '--group-border': '#94a3b8',
  '--text-primary': '#0f172a',
  '--text-secondary': '#64748b',
  '--focus-ring': '#2563eb',
};

const PADDING = 40;

function computeBoundingBox(svg) {
  const cardLayer = svg.querySelector('#card-layer');
  const groupLayer = svg.querySelector('#group-layer');

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const g of cardLayer.children) {
    const transform = g.getAttribute('transform');
    const match = transform?.match(/translate\(([^,]+),\s*([^)]+)\)/);
    if (!match) continue;
    const x = parseFloat(match[1]);
    const y = parseFloat(match[2]);
    const fo = g.querySelector('foreignObject');
    const w = parseFloat(fo?.getAttribute('width') || '220');
    const h = parseFloat(fo?.getAttribute('height') || '80');
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  }

  for (const g of groupLayer.children) {
    const transform = g.getAttribute('transform');
    const match = transform?.match(/translate\(([^,]+),\s*([^)]+)\)/);
    if (!match) continue;
    const x = parseFloat(match[1]);
    const y = parseFloat(match[2]);
    const rect = g.querySelector('.group-rect');
    const w = parseFloat(rect?.getAttribute('width') || '300');
    const h = parseFloat(rect?.getAttribute('height') || '200');
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  }

  if (!isFinite(minX)) {
    // No elements — use a default
    return { x: 0, y: 0, width: 800, height: 600 };
  }

  return {
    x: minX - PADDING,
    y: minY - PADDING,
    width: maxX - minX + PADDING * 2,
    height: maxY - minY + PADDING * 2,
  };
}

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

function buildInlineCSS() {
  return `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    .card-content {
      padding: 12px;
      width: 220px;
      background: ${LIGHT_COLORS['--card-bg']};
      border: 1px solid ${LIGHT_COLORS['--card-border']};
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    }
    .card-title {
      font-size: 14px;
      font-weight: 600;
      color: ${LIGHT_COLORS['--card-title-color']};
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    .card-description {
      font-size: 12px;
      color: ${LIGHT_COLORS['--card-description-color']};
      margin-top: 6px;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    .card-photo {
      position: relative;
      margin: -12px -12px 8px -12px;
      height: 140px;
      overflow: hidden;
      border-radius: 7px 7px 0 0;
    }
    .card-photo img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .card-photo-overlay { display: none; }
    .group-rect {
      fill: ${LIGHT_COLORS['--group-fill']};
      stroke: ${LIGHT_COLORS['--group-border']};
      stroke-width: 2;
    }
    .group-label {
      font-size: 13px;
      font-weight: 600;
      fill: ${LIGHT_COLORS['--group-border']};
    }
    .connection-path {
      fill: none;
      stroke-width: 2.5;
      stroke-linecap: round;
    }
    .connection-label {
      display: inline-block;
      padding: 2px 8px;
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
      border-radius: 10px;
      background: ${LIGHT_COLORS['--card-bg']};
      opacity: 0.9;
      border-style: solid;
      border-width: 1.5px;
      color: ${LIGHT_COLORS['--text-primary']};
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    }
  `;
}

function formatDate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*]/g, '_').trim() || 'export';
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
  // Find the corresponding image in the original SVG by matching position in tree
  const allClonedImgs = [...document.querySelectorAll('#canvas .card-photo img')];
  const allOrigImgs = [...originalSvg.querySelectorAll('.card-photo img')];
  // Use src comparison as a heuristic
  const src = clonedImg.getAttribute('src');
  return allOrigImgs.find(img => img.src === src || img.getAttribute('src') === src);
}

function imageToDataUrl(img) {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL('image/png');
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
