import { CONNECTION_COLORS } from './connection.js';

let panelEl;
let currentPlacementId = null;
let currentGroupId = null;
let currentConnectionId = null;
let callbacks = {};

export function initFloatingPanel(cbs) {
  callbacks = cbs;

  panelEl = document.createElement('div');
  panelEl.className = 'floating-panel';
  panelEl.setAttribute('role', 'dialog');
  panelEl.setAttribute('aria-label', 'Card properties');

  // Prevent clicks inside the panel from propagating to canvas (which would deselect)
  panelEl.addEventListener('pointerdown', (e) => e.stopPropagation());

  document.getElementById('canvas-container').appendChild(panelEl);
}

export function showCardPanel(placementId, card, screenX, screenY) {
  currentPlacementId = placementId;
  currentGroupId = null;
  currentConnectionId = null;

  panelEl.innerHTML = '';
  panelEl.setAttribute('aria-label', 'Card properties');

  // Title field
  const titleField = document.createElement('div');
  titleField.className = 'panel-field';
  const titleLabel = document.createElement('label');
  titleLabel.textContent = 'Title';
  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.value = card.title;
  titleInput.maxLength = 80;
  titleInput.addEventListener('blur', () => {
    const newTitle = titleInput.value.trim() || card.title;
    if (newTitle !== card.title) {
      callbacks.onTitleChange(card.id, card.title, newTitle);
      card.title = newTitle;
    }
  });
  titleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') titleInput.blur();
  });
  titleField.append(titleLabel, titleInput);

  // Description field
  const descField = document.createElement('div');
  descField.className = 'panel-field';
  const descLabel = document.createElement('label');
  descLabel.textContent = 'Description';
  const descInput = document.createElement('textarea');
  descInput.value = card.description || '';
  descInput.maxLength = 2000;
  descInput.rows = 3;
  descInput.addEventListener('blur', () => {
    const newDesc = descInput.value || null;
    const oldDesc = card.description;
    if (newDesc !== oldDesc) {
      callbacks.onDescriptionChange(card.id, oldDesc, newDesc);
      card.description = newDesc;
    }
  });
  // Auto-expand textarea
  descInput.addEventListener('input', () => {
    descInput.style.height = 'auto';
    descInput.style.height = Math.min(descInput.scrollHeight, 160) + 'px';
  });
  descField.append(descLabel, descInput);

  // Remove from tab button
  const actions = document.createElement('div');
  actions.className = 'panel-actions';
  const removeBtn = document.createElement('button');
  removeBtn.className = 'panel-remove-btn';
  removeBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Remove from tab`;
  removeBtn.addEventListener('click', () => {
    callbacks.onRemoveFromTab(placementId);
    hidePanel();
  });
  actions.appendChild(removeBtn);

  panelEl.append(titleField, descField, actions);

  positionPanel(screenX, screenY);
  panelEl.classList.add('visible');
}

function positionPanel(screenX, screenY) {
  const container = document.getElementById('canvas-container');
  const containerRect = container.getBoundingClientRect();

  // Place to the right of the card, offset slightly
  let left = screenX - containerRect.left + 16;
  let top = screenY - containerRect.top;

  // Snap inward if it would go off-screen
  const panelWidth = 240;
  const panelHeight = 200;

  if (left + panelWidth > containerRect.width) {
    left = screenX - containerRect.left - panelWidth - 16;
  }
  if (top + panelHeight > containerRect.height) {
    top = containerRect.height - panelHeight - 8;
  }
  if (left < 8) left = 8;
  if (top < 8) top = 8;

  panelEl.style.left = left + 'px';
  panelEl.style.top = top + 'px';
}

export function showGroupPanel(groupId, group, screenX, screenY) {
  currentPlacementId = null;
  currentGroupId = groupId;
  currentConnectionId = null;

  panelEl.innerHTML = '';
  panelEl.setAttribute('aria-label', 'Group properties');

  // Label field
  const labelField = document.createElement('div');
  labelField.className = 'panel-field';
  const labelLabel = document.createElement('label');
  labelLabel.textContent = 'Label';
  const labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.value = group.label;
  labelInput.maxLength = 60;
  labelInput.addEventListener('blur', () => {
    const newLabel = labelInput.value.trim() || group.label;
    if (newLabel !== group.label) {
      callbacks.onGroupLabelChange(groupId, group.label, newLabel);
      group.label = newLabel;
    }
  });
  labelInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') labelInput.blur();
  });
  labelField.append(labelLabel, labelInput);

  // Delete button
  const actions = document.createElement('div');
  actions.className = 'panel-actions';
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'panel-remove-btn';
  deleteBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Delete group`;
  deleteBtn.addEventListener('click', () => {
    callbacks.onDeleteGroup(groupId);
    hidePanel();
  });
  actions.appendChild(deleteBtn);

  panelEl.append(labelField, actions);

  positionPanel(screenX, screenY);
  panelEl.classList.add('visible');
}

export function showConnectionPanel(connectionId, connection, screenX, screenY) {
  currentPlacementId = null;
  currentGroupId = null;
  currentConnectionId = connectionId;

  panelEl.innerHTML = '';
  panelEl.setAttribute('aria-label', 'Connection properties');

  // Label field
  const labelField = document.createElement('div');
  labelField.className = 'panel-field';
  const labelLabel = document.createElement('label');
  labelLabel.textContent = 'Label';
  const labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.value = connection.label || '';
  labelInput.maxLength = 60;
  labelInput.placeholder = 'Optional label';
  labelInput.addEventListener('blur', () => {
    const newLabel = labelInput.value.trim() || null;
    const oldLabel = connection.label;
    if (newLabel !== oldLabel) {
      callbacks.onConnectionLabelChange(connectionId, oldLabel, newLabel);
      connection.label = newLabel;
    }
  });
  labelInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') labelInput.blur();
  });
  labelField.append(labelLabel, labelInput);

  // Color swatches
  const colorField = document.createElement('div');
  colorField.className = 'panel-field';
  const colorLabel = document.createElement('label');
  colorLabel.textContent = 'Color';
  const swatches = document.createElement('div');
  swatches.className = 'color-swatches';

  for (const [key, hex] of Object.entries(CONNECTION_COLORS)) {
    const swatch = document.createElement('button');
    swatch.className = 'color-swatch';
    swatch.style.background = hex;
    swatch.setAttribute('aria-label', key);
    swatch.title = key;
    if (key === connection.color) {
      swatch.classList.add('active');
    }
    swatch.addEventListener('click', () => {
      const oldColor = connection.color;
      if (key !== oldColor) {
        callbacks.onConnectionColorChange(connectionId, oldColor, key);
        connection.color = key;
        // Update active state
        for (const s of swatches.children) {
          s.classList.toggle('active', s.getAttribute('aria-label') === key);
        }
      }
    });
    swatches.appendChild(swatch);
  }
  colorField.append(colorLabel, swatches);

  // Delete button
  const actions = document.createElement('div');
  actions.className = 'panel-actions';
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'panel-remove-btn';
  deleteBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Delete connection`;
  deleteBtn.addEventListener('click', () => {
    callbacks.onDeleteConnection(connectionId);
    hidePanel();
  });
  actions.appendChild(deleteBtn);

  panelEl.append(labelField, colorField, actions);

  positionPanel(screenX, screenY);
  panelEl.classList.add('visible');
}

export function hidePanel() {
  panelEl.classList.remove('visible');
  currentPlacementId = null;
  currentGroupId = null;
  currentConnectionId = null;
}

export function getCurrentPlacementId() {
  return currentPlacementId;
}

export function updatePanelTitle(title) {
  const input = panelEl.querySelector('input[type="text"]');
  if (input) input.value = title;
}
