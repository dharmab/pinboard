const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4.0;

export function clientToCanvas(svg, clientX, clientY, viewport) {
  const rect = svg.getBoundingClientRect();
  const x = (clientX - rect.left - viewport.x) / viewport.zoom;
  const y = (clientY - rect.top - viewport.y) / viewport.zoom;
  return { x, y };
}

export function boundingBox(rects, padding = 40) {
  if (rects.length === 0) return { x: 0, y: 0, width: 0, height: 0 };

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }

  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}

export function fitToView(bounds, containerWidth, containerHeight) {
  if (bounds.width === 0 || bounds.height === 0) {
    return { x: 0, y: 0, zoom: 1.0 };
  }

  const zoom = clampZoom(
    Math.min(containerWidth / bounds.width, containerHeight / bounds.height)
  );

  const x = (containerWidth - bounds.width * zoom) / 2 - bounds.x * zoom;
  const y = (containerHeight - bounds.height * zoom) / 2 - bounds.y * zoom;

  return { x, y, zoom };
}

export function clampZoom(zoom) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}
