const NS = 'http://www.w3.org/2000/svg';
const GRAVITY_SAG = 0.35; // how much the curve droops downward relative to distance
const MIN_SAG = 20; // minimum sag in pixels so short connections still curve
const HANDLE_RADIUS = 10;

export const CONNECTION_COLORS = {
  red: '#e11d48',
  orange: '#ea580c',
  yellow: '#ca8a04',
  green: '#16a34a',
  blue: '#2563eb',
  purple: '#7c3aed',
  pink: '#db2777',
  gray: '#4b5563',
};

// Compute the nearest point on a rectangle's border to a target point
function nearestBorderPoint(rect, tx, ty) {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const dx = tx - cx;
  const dy = ty - cy;

  if (dx === 0 && dy === 0) {
    return { x: rect.x + rect.width / 2, y: rect.y };
  }

  const halfW = rect.width / 2;
  const halfH = rect.height / 2;

  // Scale factor to reach the border
  const sx = dx !== 0 ? halfW / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? halfH / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);

  return {
    x: cx + dx * s,
    y: cy + dy * s,
  };
}

// Compute the center of a bounding rect
function rectCenter(rect) {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

// Compute gravity-affected control point for a quadratic bezier.
// The curve always sags downward (positive Y in SVG), and the amount of sag
// scales with the horizontal distance between endpoints.
function controlPoint(ax, ay, bx, by) {
  const midX = (ax + bx) / 2;
  const midY = (ay + by) / 2;
  const dx = bx - ax;
  const dy = by - ay;
  const dist = Math.hypot(dx, dy);

  // Gravity sag: always pushes downward (positive Y in SVG coordinate space)
  const sag = Math.max(MIN_SAG, dist * GRAVITY_SAG);

  // For mostly-vertical connections, add a slight horizontal offset so the
  // curve doesn't collapse into a straight line. The offset direction is
  // consistent: rightward when going down, leftward when going up.
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  let horizOffset = 0;
  if (absDy > absDx * 2) {
    horizOffset = (dy >= 0 ? 1 : -1) * sag * 0.3;
  }

  return { x: midX + horizOffset, y: midY + sag };
}

// Build SVG path string for a quadratic bezier between two points
function buildPath(ax, ay, bx, by) {
  const cp = controlPoint(ax, ay, bx, by);
  return { d: `M ${ax} ${ay} Q ${cp.x} ${cp.y} ${bx} ${by}`, mx: cp.x, my: cp.y };
}

// Get the midpoint of the quadratic bezier (at t=0.5)
function bezierMidpoint(ax, ay, bx, by) {
  const cp = controlPoint(ax, ay, bx, by);
  const t = 0.5;
  const x = (1 - t) * (1 - t) * ax + 2 * (1 - t) * t * cp.x + t * t * bx;
  const y = (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * cp.y + t * t * by;
  return { x, y };
}

export function createConnectionElement(connection, fromRect, toRect, callbacks) {
  const g = document.createElementNS(NS, 'g');
  g.dataset.connectionId = connection.id;
  g.dataset.fromType = connection.from_type;
  g.dataset.fromId = connection.from_id;
  g.dataset.toType = connection.to_type;
  g.dataset.toId = connection.to_id;
  g.dataset.color = connection.color;
  g.dataset.label = connection.label || '';
  g.classList.add('connection-group');

  // Compute anchor points
  const fromCenter = rectCenter(fromRect);
  const toCenter = rectCenter(toRect);
  const fromPt = nearestBorderPoint(fromRect, toCenter.x, toCenter.y);
  const toPt = nearestBorderPoint(toRect, fromCenter.x, fromCenter.y);

  const { d } = buildPath(fromPt.x, fromPt.y, toPt.x, toPt.y);
  const mid = bezierMidpoint(fromPt.x, fromPt.y, toPt.x, toPt.y);

  // Invisible wide hit area for easier clicking
  const hitPath = document.createElementNS(NS, 'path');
  hitPath.setAttribute('d', d);
  hitPath.classList.add('connection-hit');
  g.appendChild(hitPath);

  // Visible path
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', d);
  path.classList.add('connection-path');
  path.setAttribute('stroke', CONNECTION_COLORS[connection.color] || CONNECTION_COLORS.red);
  g.appendChild(path);

  // Label pill
  if (connection.label) {
    const labelG = createLabelElement(connection.label, connection.color, mid.x, mid.y);
    g.appendChild(labelG);
  }

  // Click to select
  g.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    callbacks.onConnectionSelected?.(connection.id);
  });

  return g;
}

function createLabelElement(text, color, x, y) {
  const g = document.createElementNS(NS, 'g');
  g.classList.add('connection-label-group');

  // Use a foreignObject for text measurement and styling
  const fo = document.createElementNS(NS, 'foreignObject');
  // We'll position after measuring; set generous initial size
  fo.setAttribute('width', '200');
  fo.setAttribute('height', '24');

  const wrapper = document.createElement('div');
  wrapper.style.width = '200px';
  wrapper.style.textAlign = 'center';
  const span = document.createElement('span');
  span.className = 'connection-label';
  span.textContent = text;
  span.style.borderColor = CONNECTION_COLORS[color] || CONNECTION_COLORS.red;
  wrapper.appendChild(span);
  fo.appendChild(wrapper);
  g.appendChild(fo);

  // Position centered on midpoint (adjusted after DOM insertion via updateConnectionPath)
  fo.setAttribute('x', x - 100);
  fo.setAttribute('y', y - 12);

  return g;
}

export function updateConnectionPath(g, fromRect, toRect, connection) {
  const fromCenter = rectCenter(fromRect);
  const toCenter = rectCenter(toRect);
  const fromPt = nearestBorderPoint(fromRect, toCenter.x, toCenter.y);
  const toPt = nearestBorderPoint(toRect, fromCenter.x, fromCenter.y);

  const { d } = buildPath(fromPt.x, fromPt.y, toPt.x, toPt.y);
  const mid = bezierMidpoint(fromPt.x, fromPt.y, toPt.x, toPt.y);

  const hitPath = g.querySelector('.connection-hit');
  const path = g.querySelector('.connection-path');
  if (hitPath) hitPath.setAttribute('d', d);
  if (path) {
    path.setAttribute('d', d);
    path.setAttribute('stroke', CONNECTION_COLORS[connection.color] || CONNECTION_COLORS.red);
  }

  // Update label position
  const labelGroup = g.querySelector('.connection-label-group');
  if (labelGroup) {
    const fo = labelGroup.querySelector('foreignObject');
    if (fo) {
      fo.setAttribute('x', mid.x - 100);
      fo.setAttribute('y', mid.y - 12);
    }
  }
}

// --- Connection handles on cards/groups ---

export function showHandles(targetG, rect) {
  // Remove any existing handles first
  hideHandles(targetG);

  const positions = [
    { name: 'top', cx: rect.width / 2, cy: 0 },
    { name: 'bottom', cx: rect.width / 2, cy: rect.height },
    { name: 'left', cx: 0, cy: rect.height / 2 },
    { name: 'right', cx: rect.width, cy: rect.height / 2 },
  ];

  for (const pos of positions) {
    const circle = document.createElementNS(NS, 'circle');
    circle.classList.add('connection-handle', 'visible');
    circle.dataset.handleSide = pos.name;
    circle.setAttribute('cx', pos.cx);
    circle.setAttribute('cy', pos.cy);
    circle.setAttribute('r', HANDLE_RADIUS);
    targetG.appendChild(circle);
  }
}

export function hideHandles(targetG) {
  const handles = targetG.querySelectorAll('.connection-handle');
  for (const h of handles) h.remove();
}

// Build a preview path from a source point to the cursor position (canvas coords)
export function buildPreviewPath(fromX, fromY, toX, toY) {
  const { d } = buildPath(fromX, fromY, toX, toY);
  return d;
}

// Utility: get edge handle anchor point (canvas-space) given a rect and a side name
export function getHandleAnchor(rect, side) {
  switch (side) {
    case 'top': return { x: rect.x + rect.width / 2, y: rect.y };
    case 'bottom': return { x: rect.x + rect.width / 2, y: rect.y + rect.height };
    case 'left': return { x: rect.x, y: rect.y + rect.height / 2 };
    case 'right': return { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
    default: return rectCenter(rect);
  }
}
