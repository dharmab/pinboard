// Light-mode color tokens for consistent export regardless of current theme
export const LIGHT_COLORS = {
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

export const PADDING = 40;

export function formatDate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*]/g, '_').trim() || 'export';
}

export function computeBoundingBox(svg) {
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
    return { x: 0, y: 0, width: 800, height: 600 };
  }

  return {
    x: minX - PADDING,
    y: minY - PADDING,
    width: maxX - minX + PADDING * 2,
    height: maxY - minY + PADDING * 2,
  };
}

export function buildInlineCSS() {
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

export function imageToDataUrl(img) {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL('image/png');
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
