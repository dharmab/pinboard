import { canUndo, canRedo, onHistoryChange } from '../utils/history.js';
import { getCurrentTheme } from './theme.js';

let undoBtn, redoBtn, zoomDisplay;

function icon(pathD) {
  return `<svg viewBox="0 0 24 24"><path d="${pathD}"/></svg>`;
}

const ICONS = {
  undo: 'M3 10h10a5 5 0 0 1 0 10H13',
  redo: 'M21 10H11a5 5 0 0 0 0 10h0',
  plus: 'M12 5v14M5 12h14',
  zoomIn: 'M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM21 21l-4.35-4.35M11 8v6M8 11h6',
  zoomOut: 'M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM21 21l-4.35-4.35M8 11h6',
  fitAll: 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7',
  sun: 'M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42',
  moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  group: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5z',
  boards: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  cards: 'M21 3H3a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1zM9 7h6M9 11h6M9 15h4',
  export: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
};

export function initToolbar(callbacks) {
  const toolbar = document.getElementById('toolbar');

  // Board switcher button
  const boardSwitcherBtn = makeBtn('Boards', icon(ICONS.boards), () => callbacks.onBoardSwitcher());

  const boardName = document.createElement('input');
  boardName.type = 'text';
  boardName.className = 'board-name';
  boardName.value = callbacks.getBoardName();
  boardName.setAttribute('aria-label', 'Board name');
  boardName.addEventListener('blur', () => callbacks.onBoardNameChange(boardName.value));
  boardName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') boardName.blur();
  });

  const sep1 = separator();

  undoBtn = makeBtn('Undo', icon(ICONS.undo), () => callbacks.onUndo());
  redoBtn = makeBtn('Redo', icon(ICONS.redo), () => callbacks.onRedo());

  const sep2 = separator();

  const addCardBtn = makeBtn('Add Card', icon(ICONS.plus) + ' Card', () => callbacks.onAddCard());
  const addGroupBtn = makeBtn('New Group', icon(ICONS.group) + ' Group', () => callbacks.onAddGroup());
  const cardsBtn = makeBtn('Card Library', icon(ICONS.cards), () => callbacks.onCardLibrary());

  // Export dropdown
  const exportContainer = document.createElement('div');
  exportContainer.className = 'export-dropdown-container';
  exportContainer.style.position = 'relative';

  const exportBtn = makeBtn('Export', icon(ICONS.export) + ' Export', () => {
    toggleExportMenu(exportContainer, callbacks);
  });
  exportContainer.appendChild(exportBtn);

  const sep3 = separator();

  const spacer = document.createElement('div');
  spacer.className = 'toolbar-spacer';

  const zoomOutBtn = makeBtn('Zoom out', icon(ICONS.zoomOut), () => callbacks.onZoomOut());
  zoomDisplay = document.createElement('span');
  zoomDisplay.className = 'zoom-display';
  zoomDisplay.textContent = '100%';
  zoomDisplay.title = 'Reset zoom';
  zoomDisplay.addEventListener('click', () => callbacks.onZoomReset());
  const zoomInBtn = makeBtn('Zoom in', icon(ICONS.zoomIn), () => callbacks.onZoomIn());
  const fitAllBtn = makeBtn('Fit all', icon(ICONS.fitAll), () => callbacks.onFitAll());

  const sep4 = separator();

  const themeBtn = makeBtn('Toggle dark mode', '', () => {
    const newTheme = callbacks.onToggleTheme();
    themeBtn.innerHTML = newTheme === 'dark' ? icon(ICONS.sun) : icon(ICONS.moon);
  });
  themeBtn.innerHTML = getCurrentTheme() === 'dark' ? icon(ICONS.sun) : icon(ICONS.moon);

  toolbar.append(
    boardSwitcherBtn, boardName, sep1,
    undoBtn, redoBtn, sep2,
    addCardBtn, addGroupBtn, cardsBtn, exportContainer, sep3,
    spacer,
    zoomOutBtn, zoomDisplay, zoomInBtn, fitAllBtn, sep4,
    themeBtn
  );

  updateUndoRedoState();
  onHistoryChange(updateUndoRedoState);
}

function separator() {
  const el = document.createElement('div');
  el.className = 'toolbar-separator';
  return el;
}

function makeBtn(label, innerHTML, onClick) {
  const btn = document.createElement('button');
  btn.className = 'toolbar-btn';
  btn.innerHTML = innerHTML;
  btn.setAttribute('aria-label', label);
  btn.title = label;
  btn.addEventListener('click', onClick);
  return btn;
}

let activeExportMenu = null;

function toggleExportMenu(container, callbacks) {
  if (activeExportMenu) {
    closeExportMenu();
    return;
  }

  const menu = document.createElement('div');
  menu.className = 'export-menu';

  const items = [
    { label: 'Download ZIP', action: () => { closeExportMenu(); callbacks.onExportZip?.(); } },
    { label: 'Import from ZIP', action: () => { closeExportMenu(); callbacks.onImportZip?.(); } },
    'separator',
    { label: 'Download Image', action: () => { closeExportMenu(); callbacks.onExportPng?.(); } },
    { label: 'Download PDF', action: () => { closeExportMenu(); callbacks.onExportPdf?.(); } },
  ];

  for (const item of items) {
    if (item === 'separator') {
      const sep = document.createElement('div');
      sep.className = 'context-menu-separator';
      menu.appendChild(sep);
      continue;
    }
    const btn = document.createElement('button');
    btn.textContent = item.label;
    btn.addEventListener('click', item.action);
    menu.appendChild(btn);
  }

  container.appendChild(menu);
  activeExportMenu = menu;

  // Close on click outside
  function onClickOutside(e) {
    if (!container.contains(e.target)) {
      closeExportMenu();
      document.removeEventListener('pointerdown', onClickOutside, true);
    }
  }
  // Delay to avoid the current click from immediately closing
  requestAnimationFrame(() => {
    document.addEventListener('pointerdown', onClickOutside, true);
  });
}

function closeExportMenu() {
  if (activeExportMenu) {
    activeExportMenu.remove();
    activeExportMenu = null;
  }
}

function updateUndoRedoState() {
  if (undoBtn) undoBtn.disabled = !canUndo();
  if (redoBtn) redoBtn.disabled = !canRedo();
}

export function updateZoomDisplay(zoom) {
  if (zoomDisplay) zoomDisplay.textContent = Math.round(zoom * 100) + '%';
}

export function updateBoardNameDisplay(name) {
  const input = document.querySelector('#toolbar .board-name');
  if (input) input.value = name;
}
