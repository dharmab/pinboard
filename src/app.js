import { initTheme, toggleTheme } from './ui/theme.js';
import { initToolbar, updateZoomDisplay } from './ui/toolbar.js';
import { initTabBar, renderTabs } from './ui/tabbar.js';
import { initCanvas, getViewport, setViewport, zoomIn, zoomOut, zoomReset, fitAll, setSelection, getSvg } from './ui/canvas.js';
import { initFloatingPanel, showCardPanel, showGroupPanel, hidePanel } from './ui/floating-panel.js';
import { createCardElement, updateCardElement, adjustCardHeight, getCardRect } from './ui/card.js';
import { createGroupElement, updateGroupElement, getGroupRect } from './ui/group.js';
import { createBoard, getBoard, getAllBoards, updateBoardName } from './store/board.js';
import { createCard, getCard, updateCard } from './store/cards.js';
import { createTab, getTabsByBoard, updateTab, deleteTab as deleteTabStore } from './store/tabs.js';
import { createPlacement, getPlacement, getPlacementsByTab, updatePlacement, deletePlacement } from './store/placements.js';
import { createGroup, getGroup, getGroupsByTab, updateGroup, deleteGroup } from './store/groups.js';
import { dbPut } from './store/db.js';
import { executeCommand, undo, redo } from './utils/history.js';

let currentBoard = null;
let currentTabId = null;

// Track drag offsets for member cards during group drag
let groupDragMemberOffsets = new Map();

async function init() {
  initTheme();

  // Load or create default board
  const boards = await getAllBoards();
  if (boards.length > 0) {
    currentBoard = boards[0];
  } else {
    currentBoard = await createBoard('My Board');
    await createTab(currentBoard.id, 'Tab 1', 0);
  }

  const tabs = await getTabsByBoard(currentBoard.id);
  currentTabId = tabs[0].id;

  // Init toolbar
  initToolbar({
    getBoardName: () => currentBoard.name,
    onBoardNameChange: async (name) => {
      currentBoard = await updateBoardName(currentBoard.id, name);
    },
    onUndo: () => undo(),
    onRedo: () => redo(),
    onAddCard: () => addCardAtCenter(),
    onAddGroup: () => addGroupAtCenter(),
    onZoomIn: () => zoomIn(),
    onZoomOut: () => zoomOut(),
    onZoomReset: () => zoomReset(),
    onFitAll: () => fitAllElements(),
    onToggleTheme: () => toggleTheme(),
  });

  // Init tab bar
  initTabBar({
    onSwitchTab: (tabId) => switchTab(tabId),
    onAddTab: () => addTab(),
    onRenameTab: (tabId, name) => renameTab(tabId, name),
    onDeleteTab: (tabId) => removeTab(tabId),
  });

  // Init canvas
  initCanvas({
    onCanvasDblClick: (x, y) => addCardAt(x, y),
    onDeselect: () => {
      setSelection(null);
      hidePanel();
      announce('');
    },
    onZoomChange: (zoom) => updateZoomDisplay(zoom),
  });

  // Init floating panel
  initFloatingPanel({
    onTitleChange: (cardId, oldTitle, newTitle) => {
      executeCommand({
        execute: async () => {
          await updateCard(cardId, { title: newTitle });
          refreshCardInDom(cardId);
        },
        undo: async () => {
          await updateCard(cardId, { title: oldTitle });
          refreshCardInDom(cardId);
        },
      });
    },
    onDescriptionChange: (cardId, oldDesc, newDesc) => {
      executeCommand({
        execute: async () => {
          await updateCard(cardId, { description: newDesc });
          refreshCardInDom(cardId);
        },
        undo: async () => {
          await updateCard(cardId, { description: oldDesc });
          refreshCardInDom(cardId);
        },
      });
    },
    onRemoveFromTab: (placementId) => removePlacement(placementId),
    onGroupLabelChange: (groupId, oldLabel, newLabel) => {
      executeCommand({
        execute: async () => {
          await updateGroup(groupId, { label: newLabel });
          refreshGroupInDom(groupId);
        },
        undo: async () => {
          await updateGroup(groupId, { label: oldLabel });
          refreshGroupInDom(groupId);
        },
      });
    },
    onDeleteGroup: (groupId) => deleteGroupAction(groupId),
  });

  // Render initial state
  renderTabs(tabs, currentTabId);
  await renderPlacements();
  await renderGroups();
  updateZoomDisplay(1.0);
}

async function switchTab(tabId) {
  // Save current viewport to current tab
  const vp = getViewport();
  await updateTab(currentTabId, {
    viewport_x: vp.x,
    viewport_y: vp.y,
    viewport_zoom: vp.zoom,
  });

  currentTabId = tabId;

  // Load new tab's viewport
  const tabs = await getTabsByBoard(currentBoard.id);
  const tab = tabs.find((t) => t.id === tabId);
  if (tab) {
    setViewport({ x: tab.viewport_x, y: tab.viewport_y, zoom: tab.viewport_zoom });
    updateZoomDisplay(tab.viewport_zoom);
  }

  renderTabs(tabs, currentTabId);
  await renderPlacements();
  await renderGroups();
  setSelection(null);
  hidePanel();
}

async function addTab() {
  const tabs = await getTabsByBoard(currentBoard.id);
  const order = tabs.length;
  const tab = await createTab(currentBoard.id, `Tab ${order + 1}`, order);
  await switchTab(tab.id);
}

async function renameTab(tabId, name) {
  await updateTab(tabId, { name });
  const tabs = await getTabsByBoard(currentBoard.id);
  renderTabs(tabs, currentTabId);
}

async function removeTab(tabId) {
  const tabs = await getTabsByBoard(currentBoard.id);
  if (tabs.length <= 1) return;

  await executeCommand({
    execute: async () => {
      // Delete all placements on this tab
      const placements = await getPlacementsByTab(tabId);
      for (const p of placements) {
        await deletePlacement(p.id);
      }
      // Delete all groups on this tab
      const groups = await getGroupsByTab(tabId);
      for (const g of groups) {
        await deleteGroup(g.id);
      }
      await deleteTabStore(tabId);

      const remainingTabs = await getTabsByBoard(currentBoard.id);
      if (currentTabId === tabId) {
        await switchTab(remainingTabs[0].id);
      } else {
        renderTabs(remainingTabs, currentTabId);
      }
    },
    undo: async () => {
      const deletedTab = tabs.find(t => t.id === tabId);
      const tab = { id: tabId, board_id: currentBoard.id, name: deletedTab.name, order: deletedTab.order, viewport_x: 0, viewport_y: 0, viewport_zoom: 1.0 };
      await dbPut('tabs', tab);

      const allTabs = await getTabsByBoard(currentBoard.id);
      renderTabs(allTabs, currentTabId);
    },
  });
}

async function addCardAt(x, y) {
  const card = await createCard(currentBoard.id, 'New Card');
  const placement = await createPlacement(currentTabId, card.id, x, y);

  const g = appendCardToLayer(placement, card);
  adjustCardHeight(g);
  setSelection(placement.id);
  announce(`Card created: ${card.title}`);

  // Show the floating panel for immediate editing
  const svg = getSvg();
  const rect = svg.getBoundingClientRect();
  const screenX = x * getViewport().zoom + getViewport().x + rect.left + 230;
  const screenY = y * getViewport().zoom + getViewport().y + rect.top;
  showCardPanel(placement.id, card, screenX, screenY);

  // Wrap in undo command (the creation already happened, undo deletes)
  const placementId = placement.id;
  executeCommand({
    execute: async () => {
      // Check if already exists (first execution already did the work)
      const existing = await getPlacement(placementId);
      if (existing) return;
      await dbPut('cards', card);
      await dbPut('placements', placement);
      await renderPlacements();
    },
    undo: async () => {
      await deletePlacement(placementId);
      // Don't delete the card globally — just remove the placement
      await renderPlacements();
      setSelection(null);
      hidePanel();
    },
  });
}

async function addCardAtCenter() {
  const vp = getViewport();
  const svg = getSvg();
  const rect = svg.getBoundingClientRect();
  const centerX = (rect.width / 2 - vp.x) / vp.zoom;
  const centerY = (rect.height / 2 - vp.y) / vp.zoom;
  await addCardAt(centerX, centerY);
}

async function removePlacement(placementId) {
  const placement = await getPlacement(placementId);
  if (!placement) return;

  const card = await getCard(placement.card_id);

  await executeCommand({
    execute: async () => {
      await deletePlacement(placementId);
      await renderPlacements();
      setSelection(null);
      hidePanel();
    },
    undo: async () => {
      await dbPut('placements', placement);
      await renderPlacements();
    },
  });

  announce(`Card "${card?.title}" removed from tab`);
}

function appendCardToLayer(placement, card) {
  const cardLayer = document.getElementById('card-layer');
  const g = createCardElement(placement, card, {
    getZoom: () => getViewport().zoom,
    onCardMoved: async (placementId, oldX, oldY, newX, newY) => {
      // Check group membership changes
      const p = await getPlacement(placementId);
      const oldGroupId = p ? p.group_id : null;
      const newGroupId = findOverlappingGroup(newX, newY, placementId);

      const membershipChanged = oldGroupId !== newGroupId;

      executeCommand({
        execute: async () => {
          const updates = { x: newX, y: newY };
          if (membershipChanged) updates.group_id = newGroupId;
          await updatePlacement(placementId, updates);
          const el = cardLayer.querySelector(`[data-placement-id="${placementId}"]`);
          if (el) el.setAttribute('transform', `translate(${newX}, ${newY})`);
        },
        undo: async () => {
          const updates = { x: oldX, y: oldY };
          if (membershipChanged) updates.group_id = oldGroupId;
          await updatePlacement(placementId, updates);
          const el = cardLayer.querySelector(`[data-placement-id="${placementId}"]`);
          if (el) el.setAttribute('transform', `translate(${oldX}, ${oldY})`);
        },
      });
    },
    onCardSelected: async (placementId, cardId) => {
      setSelection(placementId, 'card');
      announce(`Selected: ${card.title}`);

      // Position floating panel near the card
      const cardData = await getCard(cardId);
      const g = cardLayer.querySelector(`[data-placement-id="${placementId}"]`);
      if (g && cardData) {
        const gRect = g.getBoundingClientRect();
        showCardPanel(placementId, cardData, gRect.right + 8, gRect.top);
      }
    },
    onTitleEdited: (cardId, oldTitle, newTitle) => {
      executeCommand({
        execute: async () => {
          await updateCard(cardId, { title: newTitle });
          refreshCardInDom(cardId);
        },
        undo: async () => {
          await updateCard(cardId, { title: oldTitle });
          refreshCardInDom(cardId);
        },
      });
    },
  });
  cardLayer.appendChild(g);
  return g;
}

function findOverlappingGroup(cardX, cardY, placementId) {
  const groupLayer = document.getElementById('group-layer');
  const cardWidth = 220;
  // Get approximate card height from DOM
  const cardLayer = document.getElementById('card-layer');
  const cardEl = cardLayer?.querySelector(`[data-placement-id="${placementId}"]`);
  const cardHeight = cardEl ? parseFloat(cardEl.querySelector('foreignObject')?.getAttribute('height') || '80') : 80;

  const cardCenterX = cardX + cardWidth / 2;
  const cardCenterY = cardY + cardHeight / 2;

  for (const gEl of groupLayer.children) {
    const gr = getGroupRect(gEl);
    // Check if card center is inside group bounds
    if (cardCenterX >= gr.x && cardCenterX <= gr.x + gr.width &&
        cardCenterY >= gr.y && cardCenterY <= gr.y + gr.height) {
      return gEl.dataset.groupId;
    }
  }
  return null;
}

async function renderPlacements() {
  const cardLayer = document.getElementById('card-layer');
  cardLayer.innerHTML = '';

  const placements = await getPlacementsByTab(currentTabId);
  for (const placement of placements) {
    const card = await getCard(placement.card_id);
    if (!card) continue;
    const g = appendCardToLayer(placement, card);
    // Defer height adjustment to next frame so DOM is settled
    requestAnimationFrame(() => adjustCardHeight(g));
  }
}

async function refreshCardInDom(cardId) {
  const card = await getCard(cardId);
  if (!card) return;

  const cardLayer = document.getElementById('card-layer');
  const elements = cardLayer.querySelectorAll(`[data-card-id="${cardId}"]`);
  for (const g of elements) {
    updateCardElement(g, card);
  }
}

// ── Group logic ──

async function addGroupAtCenter() {
  const vp = getViewport();
  const svg = getSvg();
  const rect = svg.getBoundingClientRect();
  const centerX = (rect.width / 2 - vp.x) / vp.zoom - 150; // offset by half default width
  const centerY = (rect.height / 2 - vp.y) / vp.zoom - 100; // offset by half default height

  const group = await createGroup(currentTabId, 'New Group', centerX, centerY);
  appendGroupToLayer(group);
  setSelection(group.id, 'group');
  announce('Group created: New Group');

  const groupId = group.id;
  executeCommand({
    execute: async () => {
      const existing = await getGroup(groupId);
      if (existing) return;
      await dbPut('groups', group);
      await renderGroups();
    },
    undo: async () => {
      await deleteGroup(groupId);
      await renderGroups();
      setSelection(null);
      hidePanel();
    },
  });
}

function appendGroupToLayer(group) {
  const groupLayer = document.getElementById('group-layer');
  const g = createGroupElement(group, {
    getZoom: () => getViewport().zoom,
    onGroupMoved: async (groupId, oldX, oldY, newX, newY) => {
      const dx = newX - oldX;
      const dy = newY - oldY;

      // Use cached offsets from drag start to compute old/new positions
      const offsets = groupDragMemberOffsets.get(groupId) || [];
      const memberOldPositions = offsets.map(o => ({ id: o.id, x: o.origX, y: o.origY }));
      const memberNewPositions = offsets.map(o => ({ id: o.id, x: o.origX + dx, y: o.origY + dy }));

      // Persist member positions
      for (const mp of memberNewPositions) {
        await updatePlacement(mp.id, { x: mp.x, y: mp.y });
      }

      // Clear drag cache
      groupDragMemberOffsets.delete(groupId);

      executeCommand({
        execute: async () => {
          await updateGroup(groupId, { x: newX, y: newY });
          const el = groupLayer.querySelector(`[data-group-id="${groupId}"]`);
          if (el) el.setAttribute('transform', `translate(${newX}, ${newY})`);

          const cardLayer = document.getElementById('card-layer');
          for (const mp of memberNewPositions) {
            await updatePlacement(mp.id, { x: mp.x, y: mp.y });
            const cel = cardLayer.querySelector(`[data-placement-id="${mp.id}"]`);
            if (cel) cel.setAttribute('transform', `translate(${mp.x}, ${mp.y})`);
          }
        },
        undo: async () => {
          await updateGroup(groupId, { x: oldX, y: oldY });
          const el = groupLayer.querySelector(`[data-group-id="${groupId}"]`);
          if (el) el.setAttribute('transform', `translate(${oldX}, ${oldY})`);

          const cardLayer = document.getElementById('card-layer');
          for (const mp of memberOldPositions) {
            await updatePlacement(mp.id, { x: mp.x, y: mp.y });
            const cel = cardLayer.querySelector(`[data-placement-id="${mp.id}"]`);
            if (cel) cel.setAttribute('transform', `translate(${mp.x}, ${mp.y})`);
          }
        },
      });
    },
    onGroupDragStart: async (groupId) => {
      // Pre-cache member card offsets before any pointermove fires
      const cardLayer = document.getElementById('card-layer');
      const placements = await getPlacementsByTab(currentTabId);
      const members = placements.filter(p => p.group_id === groupId);
      const offsets = [];
      for (const m of members) {
        const el = cardLayer.querySelector(`[data-placement-id="${m.id}"]`);
        if (el) {
          offsets.push({ id: m.id, origX: m.x, origY: m.y, el });
        }
      }
      groupDragMemberOffsets.set(groupId, offsets);
    },
    onGroupDragging: (groupId, dx, dy) => {
      // Move member cards visually during drag (synchronous DOM-only)
      const offsets = groupDragMemberOffsets.get(groupId);
      if (!offsets) return;
      for (const m of offsets) {
        const newX = m.origX + dx;
        const newY = m.origY + dy;
        m.el.setAttribute('transform', `translate(${newX}, ${newY})`);
      }
    },
    onGroupResized: (groupId, oldBounds, newBounds) => {
      executeCommand({
        execute: async () => {
          await updateGroup(groupId, { x: newBounds.x, y: newBounds.y, width: newBounds.width, height: newBounds.height });
          const el = groupLayer.querySelector(`[data-group-id="${groupId}"]`);
          if (el) {
            const grp = await getGroup(groupId);
            if (grp) updateGroupElement(el, grp);
          }
        },
        undo: async () => {
          await updateGroup(groupId, { x: oldBounds.x, y: oldBounds.y, width: oldBounds.width, height: oldBounds.height });
          const el = groupLayer.querySelector(`[data-group-id="${groupId}"]`);
          if (el) {
            const grp = await getGroup(groupId);
            if (grp) updateGroupElement(el, grp);
          }
        },
      });
    },
    onGroupSelected: async (groupId) => {
      setSelection(groupId, 'group');
      // Clear drag offsets
      groupDragMemberOffsets.delete(groupId);

      const grp = await getGroup(groupId);
      if (!grp) return;
      announce(`Selected group: ${grp.label}`);

      // Position floating panel near the group
      const el = groupLayer.querySelector(`[data-group-id="${groupId}"]`);
      if (el) {
        const elRect = el.getBoundingClientRect();
        showGroupPanel(groupId, grp, elRect.right + 8, elRect.top);
      }
    },
    onLabelEdited: (groupId, oldLabel, newLabel) => {
      executeCommand({
        execute: async () => {
          await updateGroup(groupId, { label: newLabel });
          refreshGroupInDom(groupId);
        },
        undo: async () => {
          await updateGroup(groupId, { label: oldLabel });
          refreshGroupInDom(groupId);
        },
      });
    },
  });
  groupLayer.appendChild(g);

  // Also reset drag offsets when group is done being built
  groupDragMemberOffsets.delete(group.id);

  return g;
}

async function renderGroups() {
  const groupLayer = document.getElementById('group-layer');
  groupLayer.innerHTML = '';

  const groups = await getGroupsByTab(currentTabId);
  for (const group of groups) {
    appendGroupToLayer(group);
  }
}

async function refreshGroupInDom(groupId) {
  const grp = await getGroup(groupId);
  if (!grp) return;

  const groupLayer = document.getElementById('group-layer');
  const el = groupLayer.querySelector(`[data-group-id="${groupId}"]`);
  if (el) updateGroupElement(el, grp);
}

async function deleteGroupAction(groupId) {
  const grp = await getGroup(groupId);
  if (!grp) return;

  // Gather member placements to clear their group_id
  const placements = await getPlacementsByTab(currentTabId);
  const members = placements.filter(p => p.group_id === groupId);
  const memberIds = members.map(m => m.id);

  await executeCommand({
    execute: async () => {
      // Clear group_id on all members
      for (const mId of memberIds) {
        await updatePlacement(mId, { group_id: null });
      }
      await deleteGroup(groupId);
      await renderGroups();
      setSelection(null);
      hidePanel();
    },
    undo: async () => {
      // Restore the group
      await dbPut('groups', grp);
      // Restore memberships
      for (const mId of memberIds) {
        await updatePlacement(mId, { group_id: groupId });
      }
      await renderGroups();
    },
  });

  announce(`Group "${grp.label}" deleted`);
}

// ── Shared utilities ──

function announce(message) {
  const el = document.getElementById('aria-live');
  if (el) el.textContent = message;
}

async function fitAllElements() {
  const cardLayer = document.getElementById('card-layer');
  const groupLayer = document.getElementById('group-layer');
  const rects = [];
  for (const g of cardLayer.children) {
    rects.push(getCardRect(g));
  }
  for (const g of groupLayer.children) {
    rects.push(getGroupRect(g));
  }
  fitAll(rects);
}

init().catch(console.error);
