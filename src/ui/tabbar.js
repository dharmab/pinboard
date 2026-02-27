import { showContextMenu, closeContextMenu } from './context-menu.js';

let tabbarEl;
let activeTabId = null;
let callbacks = {};

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
