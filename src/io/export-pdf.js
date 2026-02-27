import { jsPDF } from 'jspdf';
import { LIGHT_COLORS, computeBoundingBox, buildInlineCSS, formatDate, sanitizeFilename, imageToDataUrl } from '../utils/export-helpers.js';

export async function exportTabAsPdf(boardName, tabName, pageSize = 'a4') {
  const svg = document.getElementById('canvas');
  const bbox = computeBoundingBox(svg);
  const scale = 2;

  // Clone the SVG
  const cloned = svg.cloneNode(true);
  cloned.removeAttribute('id');

  // Set viewBox
  cloned.setAttribute('viewBox', `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`);
  cloned.setAttribute('width', bbox.width);
  cloned.setAttribute('height', bbox.height);

  const vpTransform = cloned.querySelector('#viewport-transform');
  if (vpTransform) vpTransform.removeAttribute('transform');

  const bgRect = cloned.querySelector('#canvas-bg');
  if (bgRect) bgRect.remove();

  for (const el of cloned.querySelectorAll('.connection-handle, .resize-handle, .connection-hit, .connection-preview')) {
    el.remove();
  }

  const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  styleEl.textContent = buildInlineCSS();
  cloned.insertBefore(styleEl, cloned.firstChild);

  // Convert images to data URLs
  const images = cloned.querySelectorAll('.card-photo img');
  for (const img of images) {
    const origImgs = [...svg.querySelectorAll('.card-photo img')];
    const origImg = origImgs.find(i => i.src === img.getAttribute('src'));
    if (origImg && origImg.complete && origImg.naturalWidth > 0) {
      try {
        img.setAttribute('src', imageToDataUrl(origImg));
      } catch {
        // Keep original src
      }
    }
  }

  // Serialize to SVG
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(cloned);
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  // Render to canvas
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(bbox.width * scale);
  canvas.height = Math.ceil(bbox.height * scale);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = LIGHT_COLORS['--canvas-bg'];
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);

      // Create PDF
      const orientation = bbox.width > bbox.height ? 'landscape' : 'portrait';
      const doc = new jsPDF({
        orientation,
        unit: 'mm',
        format: pageSize,
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 10; // mm

      const availW = pageWidth - margin * 2;
      const availH = pageHeight - margin * 2;

      const imgAspect = bbox.width / bbox.height;
      const pageAspect = availW / availH;

      let imgW, imgH;
      if (imgAspect > pageAspect) {
        imgW = availW;
        imgH = availW / imgAspect;
      } else {
        imgH = availH;
        imgW = availH * imgAspect;
      }

      const x = margin + (availW - imgW) / 2;
      const y = margin + (availH - imgH) / 2;

      const imgData = canvas.toDataURL('image/png');
      doc.addImage(imgData, 'PNG', x, y, imgW, imgH);

      const filename = sanitizeFilename(boardName) + '_' + sanitizeFilename(tabName) + '_' + formatDate() + '.pdf';
      doc.save(filename);
      resolve();
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to render SVG to image for PDF'));
    };
    image.src = url;
  });
}
