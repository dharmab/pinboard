const MENU_CLASS = 'context-menu';

/**
 * Show a context menu at the given screen coordinates.
 * @param {number} x - clientX
 * @param {number} y - clientY
 * @param {Array<{label: string, onClick: Function, disabled?: boolean, danger?: boolean} | 'separator'>} items
 */
export function showContextMenu(x, y, items) {
  closeContextMenu();

  const menu = document.createElement('div');
  menu.className = MENU_CLASS;
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  for (const item of items) {
    if (item === 'separator') {
      const sep = document.createElement('div');
      sep.className = 'context-menu-separator';
      menu.appendChild(sep);
      continue;
    }

    const btn = document.createElement('button');
    btn.textContent = item.label;
    if (item.disabled) btn.disabled = true;
    if (item.danger) btn.classList.add('context-menu-danger');
    btn.addEventListener('click', () => {
      closeContextMenu();
      item.onClick();
    });
    menu.appendChild(btn);
  }

  document.body.appendChild(menu);

  // Snap menu inward if it would go off-screen
  const menuRect = menu.getBoundingClientRect();
  if (menuRect.right > window.innerWidth) {
    menu.style.left = (window.innerWidth - menuRect.width - 4) + 'px';
  }
  if (menuRect.bottom > window.innerHeight) {
    menu.style.top = (window.innerHeight - menuRect.height - 4) + 'px';
  }

  const closeOnClick = (ev) => {
    if (!menu.contains(ev.target)) {
      closeContextMenu();
    }
  };
  requestAnimationFrame(() => document.addEventListener('click', closeOnClick, { once: true }));
  menu._cleanup = () => document.removeEventListener('click', closeOnClick);
}

export function closeContextMenu() {
  const existing = document.querySelector('.' + MENU_CLASS);
  if (existing) {
    if (existing._cleanup) existing._cleanup();
    existing.remove();
  }
}

/**
 * Show a confirmation dialog with a message and confirm/cancel buttons.
 * @param {string} message
 * @param {Function} onConfirm
 */
export function showConfirmDialog(message, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'confirm-dialog';
  dialog.setAttribute('role', 'alertdialog');
  dialog.setAttribute('aria-label', 'Confirmation');

  const msg = document.createElement('p');
  msg.textContent = message;

  const buttons = document.createElement('div');
  buttons.className = 'confirm-buttons';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'confirm-cancel';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => overlay.remove());

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'confirm-ok';
  confirmBtn.textContent = 'Delete';
  confirmBtn.addEventListener('click', () => {
    overlay.remove();
    onConfirm();
  });

  buttons.append(cancelBtn, confirmBtn);
  dialog.append(msg, buttons);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  cancelBtn.focus();
}
