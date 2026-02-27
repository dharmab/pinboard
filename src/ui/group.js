const NS = 'http://www.w3.org/2000/svg';
const HANDLE_SIZE = 12;
const MIN_WIDTH = 100;
const MIN_HEIGHT = 80;
const LABEL_OFFSET_X = 12;
const LABEL_OFFSET_Y = 20;

export function createGroupElement(group, callbacks) {
  const g = document.createElementNS(NS, 'g');
  g.dataset.groupId = group.id;
  g.setAttribute('transform', `translate(${group.x}, ${group.y})`);

  // Main rectangle
  const rect = document.createElementNS(NS, 'rect');
  rect.classList.add('group-rect');
  rect.setAttribute('width', group.width);
  rect.setAttribute('height', group.height);
  rect.setAttribute('rx', '6');
  g.appendChild(rect);

  // Label
  const text = document.createElementNS(NS, 'text');
  text.classList.add('group-label');
  text.setAttribute('x', LABEL_OFFSET_X);
  text.setAttribute('y', LABEL_OFFSET_Y);
  text.textContent = group.label;
  g.appendChild(text);

  // Resize handles (one per corner)
  const corners = [
    { name: 'nw', cx: 0, cy: 0, cursor: 'nwse-resize' },
    { name: 'ne', cx: group.width, cy: 0, cursor: 'nesw-resize' },
    { name: 'sw', cx: 0, cy: group.height, cursor: 'nesw-resize' },
    { name: 'se', cx: group.width, cy: group.height, cursor: 'nwse-resize' },
  ];

  for (const corner of corners) {
    const handle = document.createElementNS(NS, 'rect');
    handle.classList.add('resize-handle');
    handle.dataset.corner = corner.name;
    handle.setAttribute('x', corner.cx - HANDLE_SIZE / 2);
    handle.setAttribute('y', corner.cy - HANDLE_SIZE / 2);
    handle.setAttribute('width', HANDLE_SIZE);
    handle.setAttribute('height', HANDLE_SIZE);
    handle.style.cursor = corner.cursor;
    g.appendChild(handle);
  }

  // --- Interaction state ---
  let isDragging = false;
  let isResizing = false;
  let resizeCorner = null;
  let dragStart = { x: 0, y: 0 };
  let elementStart = { x: group.x, y: group.y, width: group.width, height: group.height };
  let hasMoved = false;

  // --- Resize ---
  for (const handle of g.querySelectorAll('.resize-handle')) {
    handle.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      isResizing = true;
      resizeCorner = handle.dataset.corner;
      dragStart = { x: e.clientX, y: e.clientY };
      elementStart = { x: group.x, y: group.y, width: group.width, height: group.height };
      handle.setPointerCapture(e.pointerId);
    });

    handle.addEventListener('pointermove', (e) => {
      if (!isResizing) return;
      const zoom = callbacks.getZoom();
      const dx = (e.clientX - dragStart.x) / zoom;
      const dy = (e.clientY - dragStart.y) / zoom;

      let newX = elementStart.x;
      let newY = elementStart.y;
      let newW = elementStart.width;
      let newH = elementStart.height;

      if (resizeCorner.includes('e')) {
        newW = Math.max(MIN_WIDTH, elementStart.width + dx);
      }
      if (resizeCorner.includes('w')) {
        const proposedW = elementStart.width - dx;
        if (proposedW >= MIN_WIDTH) {
          newW = proposedW;
          newX = elementStart.x + dx;
        } else {
          newW = MIN_WIDTH;
          newX = elementStart.x + elementStart.width - MIN_WIDTH;
        }
      }
      if (resizeCorner.includes('s')) {
        newH = Math.max(MIN_HEIGHT, elementStart.height + dy);
      }
      if (resizeCorner.includes('n')) {
        const proposedH = elementStart.height - dy;
        if (proposedH >= MIN_HEIGHT) {
          newH = proposedH;
          newY = elementStart.y + dy;
        } else {
          newH = MIN_HEIGHT;
          newY = elementStart.y + elementStart.height - MIN_HEIGHT;
        }
      }

      group.x = newX;
      group.y = newY;
      group.width = newW;
      group.height = newH;
      applyGroupTransform(g, group);
      callbacks.onGroupResizing?.();
    });

    handle.addEventListener('pointerup', (e) => {
      if (!isResizing) return;
      handle.releasePointerCapture(e.pointerId);
      isResizing = false;

      const oldBounds = { x: elementStart.x, y: elementStart.y, width: elementStart.width, height: elementStart.height };
      const newBounds = { x: group.x, y: group.y, width: group.width, height: group.height };
      if (oldBounds.x !== newBounds.x || oldBounds.y !== newBounds.y ||
          oldBounds.width !== newBounds.width || oldBounds.height !== newBounds.height) {
        callbacks.onGroupResized(group.id, oldBounds, newBounds);
      }
      resizeCorner = null;
    });
  }

  // --- Drag (on main rect) ---
  rect.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    isDragging = true;
    hasMoved = false;
    dragStart = { x: e.clientX, y: e.clientY };
    elementStart = { x: group.x, y: group.y, width: group.width, height: group.height };
    rect.setPointerCapture(e.pointerId);
    rect.style.cursor = 'grabbing';
    callbacks.onGroupDragStart?.(group.id);
  });

  rect.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    const zoom = callbacks.getZoom();
    const dx = (e.clientX - dragStart.x) / zoom;
    const dy = (e.clientY - dragStart.y) / zoom;

    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      hasMoved = true;
    }

    group.x = elementStart.x + dx;
    group.y = elementStart.y + dy;
    g.setAttribute('transform', `translate(${group.x}, ${group.y})`);

    // Move member cards in real time
    callbacks.onGroupDragging?.(group.id, dx, dy, elementStart.x, elementStart.y);
  });

  rect.addEventListener('pointerup', (e) => {
    if (!isDragging) return;
    isDragging = false;
    rect.releasePointerCapture(e.pointerId);
    rect.style.cursor = '';

    if (hasMoved) {
      callbacks.onGroupMoved(group.id, elementStart.x, elementStart.y, group.x, group.y);
    } else {
      callbacks.onGroupSelected(group.id);
    }
  });

  // --- Double-click label for inline edit ---
  text.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    startLabelEdit(g, text, group, callbacks);
  });

  return g;
}

function startLabelEdit(g, textEl, group, callbacks) {
  const fo = document.createElementNS(NS, 'foreignObject');
  fo.setAttribute('x', LABEL_OFFSET_X - 2);
  fo.setAttribute('y', 4);
  fo.setAttribute('width', Math.max(group.width - LABEL_OFFSET_X * 2, 80));
  fo.setAttribute('height', 28);

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'group-label-input';
  input.value = group.label;
  input.maxLength = 60;

  const oldLabel = group.label;

  function commit() {
    const newLabel = input.value.trim() || oldLabel;
    textEl.textContent = newLabel;
    fo.remove();
    if (newLabel !== oldLabel) {
      callbacks.onLabelEdited?.(group.id, oldLabel, newLabel);
    }
  }

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      input.removeEventListener('blur', commit);
      textEl.textContent = oldLabel;
      fo.remove();
    }
  });
  input.addEventListener('pointerdown', (e) => e.stopPropagation());

  textEl.textContent = '';
  fo.appendChild(input);
  g.appendChild(fo);
  input.focus();
  input.select();
}

function applyGroupTransform(g, group) {
  g.setAttribute('transform', `translate(${group.x}, ${group.y})`);
  const rect = g.querySelector('.group-rect');
  rect.setAttribute('width', group.width);
  rect.setAttribute('height', group.height);

  // Update resize handle positions
  const handles = g.querySelectorAll('.resize-handle');
  for (const handle of handles) {
    const corner = handle.dataset.corner;
    let cx = 0, cy = 0;
    if (corner.includes('e')) cx = group.width;
    if (corner.includes('s')) cy = group.height;
    handle.setAttribute('x', cx - HANDLE_SIZE / 2);
    handle.setAttribute('y', cy - HANDLE_SIZE / 2);
  }
}

export function updateGroupElement(g, group) {
  g.setAttribute('transform', `translate(${group.x}, ${group.y})`);
  const rect = g.querySelector('.group-rect');
  rect.setAttribute('width', group.width);
  rect.setAttribute('height', group.height);

  const text = g.querySelector('.group-label');
  text.textContent = group.label;

  // Update handle positions
  const handles = g.querySelectorAll('.resize-handle');
  for (const handle of handles) {
    const corner = handle.dataset.corner;
    let cx = 0, cy = 0;
    if (corner.includes('e')) cx = group.width;
    if (corner.includes('s')) cy = group.height;
    handle.setAttribute('x', cx - HANDLE_SIZE / 2);
    handle.setAttribute('y', cy - HANDLE_SIZE / 2);
  }
}

export function getGroupRect(g) {
  const transform = g.getAttribute('transform');
  const match = transform?.match(/translate\(([^,]+),\s*([^)]+)\)/);
  const x = match ? parseFloat(match[1]) : 0;
  const y = match ? parseFloat(match[2]) : 0;
  const rect = g.querySelector('.group-rect');
  const width = parseFloat(rect?.getAttribute('width') || '300');
  const height = parseFloat(rect?.getAttribute('height') || '200');
  return { x, y, width, height };
}
