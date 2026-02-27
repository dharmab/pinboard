import { showConfirmDialog } from './context-menu.js';

let overlayEl = null;

/**
 * Show the board switcher dropdown.
 * @param {Array<{id, name}>} boards
 * @param {string} currentBoardId
 * @param {{onSwitch, onCreateBoard, onDuplicateBoard, onDeleteBoard}} callbacks
 */
export function showBoardSwitcher(boards, currentBoardId, callbacks) {
  closeBoardSwitcher();

  overlayEl = document.createElement('div');
  overlayEl.className = 'board-switcher-overlay';
  overlayEl.addEventListener('pointerdown', (e) => {
    if (e.target === overlayEl) closeBoardSwitcher();
  });

  const panel = document.createElement('div');
  panel.className = 'board-switcher';

  // Header
  const header = document.createElement('div');
  header.className = 'board-switcher-header';
  const title = document.createElement('span');
  title.textContent = 'Boards';

  const actions = document.createElement('div');
  actions.className = 'board-switcher-actions';
  const newBtn = document.createElement('button');
  newBtn.textContent = '+ New';
  newBtn.addEventListener('click', () => {
    closeBoardSwitcher();
    callbacks.onCreateBoard();
  });
  actions.appendChild(newBtn);
  header.append(title, actions);

  // List
  const list = document.createElement('div');
  list.className = 'board-switcher-list';

  for (const board of boards) {
    const item = document.createElement('div');
    item.className = 'board-switcher-item';
    if (board.id === currentBoardId) item.classList.add('active');

    const name = document.createElement('span');
    name.className = 'board-switcher-item-name';
    name.textContent = board.name;

    const itemActions = document.createElement('div');
    itemActions.className = 'board-switcher-item-actions';

    // Duplicate button
    const dupBtn = document.createElement('button');
    dupBtn.title = 'Duplicate';
    dupBtn.textContent = '\u2398';
    dupBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeBoardSwitcher();
      callbacks.onDuplicateBoard(board.id);
    });

    // Delete button
    const delBtn = document.createElement('button');
    delBtn.className = 'danger';
    delBtn.title = 'Delete';
    delBtn.textContent = '\u00d7';
    delBtn.disabled = boards.length <= 1;
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showConfirmDialog(
        `Delete board "${board.name}"? This cannot be undone.`,
        () => {
          closeBoardSwitcher();
          callbacks.onDeleteBoard(board.id);
        }
      );
    });

    itemActions.append(dupBtn, delBtn);
    item.append(name, itemActions);

    item.addEventListener('click', () => {
      if (board.id !== currentBoardId) {
        closeBoardSwitcher();
        callbacks.onSwitch(board.id);
      }
    });

    list.appendChild(item);
  }

  panel.append(header, list);
  overlayEl.appendChild(panel);
  document.body.appendChild(overlayEl);
}

export function closeBoardSwitcher() {
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }
}
