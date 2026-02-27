import { showContextMenu, closeContextMenu } from './context-menu.js';

let tabbarEl;
let activeTabId = null;
let callbacks = {};
let draggedTabId = null;

export function initTabBar(cbs) {
  callbacks = cbs;
  tabbarEl = document.getElementById('tabbar');
}

export function renderTabs(tabs, currentTabId) {
  activeTabId = currentTabId;
  tabbarEl.innerHTML = '';

  for (const tab of tabs) {
    const btn = document.createElement('button');
    btn.className = 'tab-button';
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', tab.id === activeTabId ? 'true' : 'false');
    btn.textContent = tab.name;
    btn.dataset.tabId = tab.id;

    btn.draggable = true;

    btn.addEventListener('click', () => {
      if (tab.id !== activeTabId) {
        callbacks.onSwitchTab(tab.id);
      }
    });

    btn.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      startRename(btn, tab);
    });

    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showTabContextMenu(e, tab, tabs.length);
    });

    btn.addEventListener('dragstart', (e) => {
      draggedTabId = tab.id;
      e.dataTransfer.effectAllowed = 'move';
      btn.style.opacity = '0.4';
    });

    btn.addEventListener('dragend', () => {
      btn.style.opacity = '';
      draggedTabId = null;
      // Remove all drop indicators
      for (const b of tabbarEl.querySelectorAll('.tab-button')) {
        b.classList.remove('tab-drop-before', 'tab-drop-after');
      }
    });

    btn.addEventListener('dragover', (e) => {
      if (!draggedTabId || draggedTabId === tab.id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      const rect = btn.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      // Remove indicators from all tabs
      for (const b of tabbarEl.querySelectorAll('.tab-button')) {
        b.classList.remove('tab-drop-before', 'tab-drop-after');
      }
      if (e.clientX < midX) {
        btn.classList.add('tab-drop-before');
      } else {
        btn.classList.add('tab-drop-after');
      }
    });

    btn.addEventListener('dragleave', () => {
      btn.classList.remove('tab-drop-before', 'tab-drop-after');
    });

    btn.addEventListener('drop', (e) => {
      e.preventDefault();
      if (!draggedTabId || draggedTabId === tab.id) return;

      btn.classList.remove('tab-drop-before', 'tab-drop-after');

      // Compute new order: gather current tab IDs in DOM order
      const tabButtons = tabbarEl.querySelectorAll('.tab-button');
      const orderedIds = Array.from(tabButtons).map(b => b.dataset.tabId);

      // Remove dragged tab from its current position
      const fromIndex = orderedIds.indexOf(draggedTabId);
      if (fromIndex === -1) return;
      orderedIds.splice(fromIndex, 1);

      // Find drop target position
      let toIndex = orderedIds.indexOf(tab.id);
      const rect = btn.getBoundingClientRect();
      if (e.clientX >= rect.left + rect.width / 2) {
        toIndex += 1;
      }
      orderedIds.splice(toIndex, 0, draggedTabId);

      callbacks.onReorderTabs(orderedIds);
      draggedTabId = null;
    });

    tabbarEl.appendChild(btn);
  }

  const addBtn = document.createElement('button');
  addBtn.className = 'tab-add';
  addBtn.setAttribute('aria-label', 'Add tab');
  addBtn.title = 'Add tab';
  addBtn.textContent = '+';
  addBtn.addEventListener('click', () => callbacks.onAddTab());
  tabbarEl.appendChild(addBtn);
}

function startRename(btn, tab) {
  const input = document.createElement('input');
  input.className = 'tab-rename-input';
  input.type = 'text';
  input.value = tab.name;
  input.maxLength = 60;

  function commit() {
    const newName = input.value.trim() || tab.name;
    callbacks.onRenameTab(tab.id, newName);
  }

  function cancel() {
    callbacks.onRenameTab(tab.id, tab.name);
  }

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      input.removeEventListener('blur', commit);
      cancel();
    }
  });

  btn.textContent = '';
  btn.appendChild(input);
  input.focus();
  input.select();
}

function showTabContextMenu(e, tab, tabCount) {
  showContextMenu(e.clientX, e.clientY, [
    {
      label: 'Rename',
      onClick: () => {
        const btn = tabbarEl.querySelector(`[data-tab-id="${tab.id}"]`);
        if (btn) startRename(btn, tab);
      },
    },
    {
      label: 'Delete Tab',
      disabled: tabCount <= 1,
      danger: true,
      onClick: () => callbacks.onDeleteTab(tab.id),
    },
  ]);
}

export function getActiveTabId() {
  return activeTabId;
}
