import { initTheme, toggleTheme } from './ui/theme.js';
import { initToolbar, updateZoomDisplay, updateBoardNameDisplay } from './ui/toolbar.js';
import { initTabBar, renderTabs } from './ui/tabbar.js';
import { initCanvas, getViewport, setViewport, zoomIn, zoomOut, zoomReset, fitAll, setSelection, getSelection, getSelectionType, getSelectedIds, getSvg } from './ui/canvas.js';
import { initFloatingPanel, showCardPanel, showGroupPanel, showConnectionPanel, hidePanel, getCurrentPlacementId } from './ui/floating-panel.js';
import { showContextMenu, closeContextMenu, showConfirmDialog } from './ui/context-menu.js';
import { showCardLibrary, closeCardLibrary } from './ui/card-library.js';
import { showBoardSwitcher, closeBoardSwitcher } from './ui/board-switcher.js';
import { createCardElement, updateCardElement, adjustCardHeight, getCardRect } from './ui/card.js';
import { createGroupElement, updateGroupElement, getGroupRect } from './ui/group.js';
import { createConnectionElement, updateConnectionPath, showHandles, hideHandles, buildPreviewPath, getHandleAnchor } from './ui/connection.js';
import { createBoard, getBoard, getAllBoards, updateBoardName } from './store/board.js';
import { createCard, getCard, getCardsByBoard, updateCard, deleteCard } from './store/cards.js';
import { createTab, getTabsByBoard, updateTab, deleteTab as deleteTabStore, reorderTabs } from './store/tabs.js';
import { createPlacement, getPlacement, getPlacementsByTab, getPlacementsByCard, updatePlacement, deletePlacement } from './store/placements.js';
import { createGroup, getGroup, getGroupsByTab, updateGroup, deleteGroup } from './store/groups.js';
import { createConnection, getConnection, getConnectionsByTab, updateConnection, deleteConnection, deleteConnectionsByTab } from './store/connections.js';
import { saveImage, getImage, deleteImage } from './store/images.js';
import { dbPut, dbDelete } from './store/db.js';
import { executeCommand, undo, redo } from './utils/history.js';
import { clientToCanvas } from './utils/geometry.js';
import { exportBoardAsZip } from './io/export-zip.js';
import { importBoardFromZip } from './io/import-zip.js';
import { exportTabAsImage } from './io/export-png.js';
import { exportTabAsPdf } from './io/export-pdf.js';

const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const imageUrlCache = new Map(); // hash -> objectURL

let currentBoard = null;
let currentTabId = null;

// Track drag offsets for member cards during group drag
let groupDragMemberOffsets = new Map();

// Connection drawing state
let isDrawingConnection = false;
let connectionSource = null; // { type: 'card'|'group', id: string, side: string }
let previewLine = null;
let hoveredElement = null; // track which element has handles shown

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
    onCardLibrary: () => openCardLibrary(),
    onBoardSwitcher: () => openBoardSwitcher(),
    onExportZip: () => handleExportZip(),
    onImportZip: () => handleImportZip(),
    onExportPng: () => handleExportPng(),
    onExportPdf: () => handleExportPdf(),
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
    onReorderTabs: async (orderedIds) => {
      await reorderTabs(currentBoard.id, orderedIds);
      const tabs = await getTabsByBoard(currentBoard.id);
      renderTabs(tabs, currentTabId);
    },
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
    onPhotoChange: (cardId, file) => attachPhotoToCard(cardId, file),
    onPhotoRemove: (cardId) => removePhotoFromCard(cardId),
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
    onConnectionLabelChange: (connectionId, oldLabel, newLabel) => {
      executeCommand({
        execute: async () => {
          await updateConnection(connectionId, { label: newLabel });
          await renderConnections();
        },
        undo: async () => {
          await updateConnection(connectionId, { label: oldLabel });
          await renderConnections();
        },
      });
    },
    onConnectionColorChange: (connectionId, oldColor, newColor) => {
      executeCommand({
        execute: async () => {
          await updateConnection(connectionId, { color: newColor });
          await renderConnections();
        },
        undo: async () => {
          await updateConnection(connectionId, { color: oldColor });
          await renderConnections();
        },
      });
    },
    onDeleteConnection: (connectionId) => deleteConnectionAction(connectionId),
  });

  // Set up connection handle hover + drag on the SVG
  setupConnectionInteraction();

  // Keyboard shortcuts
  document.addEventListener('keydown', onKeyDown);

  // Handle drag-and-drop on canvas (card library + prevent default file drops)
  const canvasContainer = document.getElementById('canvas-container');
  canvasContainer.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('application/x-pinboard-card')) {
      e.dataTransfer.dropEffect = 'copy';
    }
  });
  canvasContainer.addEventListener('drop', async (e) => {
    e.preventDefault();
    const cardId = e.dataTransfer.getData('application/x-pinboard-card');
    if (cardId) {
      closeCardLibrary();
      const svg = getSvg();
      const vp = getViewport();
      const pos = clientToCanvas(svg, e.clientX, e.clientY, vp);
      await placeCardFromLibrary(cardId, pos.x, pos.y);
    }
  });

  // Paste image from clipboard onto selected card
  document.addEventListener('paste', async (e) => {
    // Don't intercept paste in text inputs
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;

    if (getSelectionType() !== 'card' || getSelectedIds().size !== 1) return;

    const file = [...(e.clipboardData?.files || [])].find(f => ACCEPTED_IMAGE_TYPES.has(f.type));
    if (!file) return;

    e.preventDefault();
    const placementId = getSelection();
    const placement = await getPlacement(placementId);
    if (placement) {
      attachPhotoToCard(placement.card_id, file);
    }
  });

  // Render initial state
  renderTabs(tabs, currentTabId);
  await renderPlacements();
  await renderGroups();
  await renderConnections();
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
  await renderConnections();
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
      // Delete all connections on this tab
      await deleteConnectionsByTab(tabId);
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

  const g = appendCardToLayer(placement, card, null);
  adjustCardHeight(g);
  setSelection(placement.id);
  announce(`Card created: ${card.title}`);

  // Show the floating panel for immediate editing
  const svg = getSvg();
  const rect = svg.getBoundingClientRect();
  const screenX = x * getViewport().zoom + getViewport().x + rect.left + 230;
  const screenY = y * getViewport().zoom + getViewport().y + rect.top;
  showCardPanel(placement.id, card, screenX, screenY, null);

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

  // Gather connections attached to this placement
  const allConns = await getConnectionsByTab(currentTabId);
  const affectedConns = allConns.filter(c =>
    (c.from_type === 'card' && c.from_id === placementId) ||
    (c.to_type === 'card' && c.to_id === placementId)
  );

  await executeCommand({
    execute: async () => {
      for (const conn of affectedConns) {
        await deleteConnection(conn.id);
      }
      await deletePlacement(placementId);
      await renderPlacements();
      await renderConnections();
      setSelection(null);
      hidePanel();
    },
    undo: async () => {
      await dbPut('placements', placement);
      for (const conn of affectedConns) {
        await dbPut('connections', conn);
      }
      await renderPlacements();
      await renderConnections();
    },
  });

  announce(`Card "${card?.title}" removed from tab`);
}

async function placeCardFromLibrary(cardId, x, y) {
  // Check if card already has a placement on this tab
  const existingPlacements = await getPlacementsByTab(currentTabId);
  if (existingPlacements.some(p => p.card_id === cardId)) {
    announce('Card already exists on this tab');
    return;
  }

  const card = await getCard(cardId);
  if (!card) return;

  const placement = await createPlacement(currentTabId, cardId, x, y);
  const imgUrl = await getImageUrl(card.image_filename);
  const g = appendCardToLayer(placement, card, imgUrl);
  adjustCardHeight(g);
  setSelection(placement.id);
  announce(`Card "${card.title}" added to tab`);

  const placementId = placement.id;
  executeCommand({
    execute: async () => {
      const existing = await getPlacement(placementId);
      if (existing) return;
      await dbPut('placements', placement);
      await renderPlacements();
    },
    undo: async () => {
      await deletePlacement(placementId);
      await renderPlacements();
      setSelection(null);
      hidePanel();
    },
  });
}

async function deleteCardEverywhere(cardId) {
  const card = await getCard(cardId);
  if (!card) return;

  // Delete all placements for this card (across all tabs)
  const allPlacements = await getPlacementsByCard(cardId);
  for (const p of allPlacements) {
    // Delete connections attached to each placement
    const tabConns = await getConnectionsByTab(p.tab_id);
    for (const conn of tabConns) {
      if ((conn.from_type === 'card' && conn.from_id === p.id) ||
          (conn.to_type === 'card' && conn.to_id === p.id)) {
        await deleteConnection(conn.id);
      }
    }
    await deletePlacement(p.id);
  }
  await deleteCard(cardId);

  // Re-render current tab
  await renderPlacements();
  await renderConnections();
  setSelection(null);
  hidePanel();
  announce(`Card "${card.title}" deleted`);
}

function appendCardToLayer(placement, card, imageUrl) {
  const cardLayer = document.getElementById('card-layer');
  const g = createCardElement(placement, card, {
    getZoom: () => getViewport().zoom,
    onPhotoClick: (cardId) => openPhotoPicker(cardId),
    onCardDragging: refreshConnectionPaths,
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
          refreshConnectionPaths();
        },
        undo: async () => {
          const updates = { x: oldX, y: oldY };
          if (membershipChanged) updates.group_id = oldGroupId;
          await updatePlacement(placementId, updates);
          const el = cardLayer.querySelector(`[data-placement-id="${placementId}"]`);
          if (el) el.setAttribute('transform', `translate(${oldX}, ${oldY})`);
          refreshConnectionPaths();
        },
      });
    },
    onCardSelected: async (placementId, cardId, shiftKey) => {
      setSelection(placementId, 'card', shiftKey);

      const selected = getSelectedIds();
      if (selected.size === 0) {
        hidePanel();
        announce('');
        return;
      }

      announce(`Selected: ${card.title}`);

      // Only show floating panel for single selection or the primary (last-clicked) card
      if (!shiftKey || selected.size === 1) {
        const cardData = await getCard(cardId);
        const g = cardLayer.querySelector(`[data-placement-id="${placementId}"]`);
        if (g && cardData) {
          const cardImageUrl = await getImageUrl(cardData.image_filename);
          const gRect = g.getBoundingClientRect();
          showCardPanel(placementId, cardData, gRect.right + 8, gRect.top, cardImageUrl);
        }
      } else {
        hidePanel();
        announce(`${selected.size} cards selected`);
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
  }, imageUrl);

  // Right-click context menu
  g.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showContextMenu(e.clientX, e.clientY, [
      {
        label: 'Edit',
        onClick: async () => {
          const cardData = await getCard(card.id);
          if (!cardData) return;
          setSelection(placement.id, 'card');
          const cardImageUrl = await getImageUrl(cardData.image_filename);
          const gRect = g.getBoundingClientRect();
          showCardPanel(placement.id, cardData, gRect.right + 8, gRect.top, cardImageUrl);
        },
      },
      {
        label: 'Remove from this tab',
        onClick: () => removePlacement(placement.id),
      },
      'separator',
      {
        label: 'Delete card everywhere',
        danger: true,
        onClick: () => {
          showConfirmDialog(
            `Delete "${card.title}" from all tabs? This cannot be undone.`,
            () => deleteCardEverywhere(card.id)
          );
        },
      },
    ]);
  });

  // Set up drop-to-attach-photo
  const contentDiv = g.querySelector('.card-content');
  contentDiv.addEventListener('dragover', (e) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    contentDiv.classList.add('card-drop-target');
  });
  contentDiv.addEventListener('dragleave', () => {
    contentDiv.classList.remove('card-drop-target');
  });
  contentDiv.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    contentDiv.classList.remove('card-drop-target');
    const file = e.dataTransfer.files[0];
    if (file && ACCEPTED_IMAGE_TYPES.has(file.type)) {
      attachPhotoToCard(card.id, file);
    }
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
    const imgUrl = await getImageUrl(card.image_filename);
    const g = appendCardToLayer(placement, card, imgUrl);
    adjustCardHeight(g);
  }
}

async function refreshCardInDom(cardId) {
  const card = await getCard(cardId);
  if (!card) return;

  const imgUrl = await getImageUrl(card.image_filename);
  const cardLayer = document.getElementById('card-layer');
  const elements = cardLayer.querySelectorAll(`[data-card-id="${cardId}"]`);
  for (const g of elements) {
    updateCardElement(g, card, imgUrl, (cId) => openPhotoPicker(cId));
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
    onGroupResizing: () => refreshConnectionPaths(),
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
          refreshConnectionPaths();
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
          refreshConnectionPaths();
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
      refreshConnectionPaths();
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
          refreshConnectionPaths();
        },
        undo: async () => {
          await updateGroup(groupId, { x: oldBounds.x, y: oldBounds.y, width: oldBounds.width, height: oldBounds.height });
          const el = groupLayer.querySelector(`[data-group-id="${groupId}"]`);
          if (el) {
            const grp = await getGroup(groupId);
            if (grp) updateGroupElement(el, grp);
          }
          refreshConnectionPaths();
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
  // Right-click context menu
  g.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showContextMenu(e.clientX, e.clientY, [
      {
        label: 'Rename',
        onClick: async () => {
          const grp = await getGroup(group.id);
          if (!grp) return;
          setSelection(group.id, 'group');
          const el = groupLayer.querySelector(`[data-group-id="${group.id}"]`);
          if (el) {
            const elRect = el.getBoundingClientRect();
            showGroupPanel(group.id, grp, elRect.right + 8, elRect.top);
            // Focus the label input in the panel
            setTimeout(() => {
              const input = document.querySelector('.floating-panel input[type="text"]');
              if (input) input.focus();
            }, 0);
          }
        },
      },
      {
        label: 'Delete group',
        danger: true,
        onClick: () => deleteGroupAction(group.id),
      },
    ]);
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

  // Gather connections attached to this group
  const allConns = await getConnectionsByTab(currentTabId);
  const affectedConns = allConns.filter(c =>
    (c.from_type === 'group' && c.from_id === groupId) ||
    (c.to_type === 'group' && c.to_id === groupId)
  );

  await executeCommand({
    execute: async () => {
      // Clear group_id on all members
      for (const mId of memberIds) {
        await updatePlacement(mId, { group_id: null });
      }
      // Delete associated connections
      for (const conn of affectedConns) {
        await deleteConnection(conn.id);
      }
      await deleteGroup(groupId);
      await renderGroups();
      await renderConnections();
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
      // Restore connections
      for (const conn of affectedConns) {
        await dbPut('connections', conn);
      }
      await renderGroups();
      await renderConnections();
    },
  });

  announce(`Group "${grp.label}" deleted`);
}

// ── Photo logic ──

async function getImageUrl(hash) {
  if (!hash) return null;
  if (imageUrlCache.has(hash)) return imageUrlCache.get(hash);
  const image = await getImage(hash);
  if (!image || !image.data) return null;
  const url = URL.createObjectURL(image.data);
  imageUrlCache.set(hash, url);
  return url;
}

function openPhotoPicker(cardId) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/jpeg,image/png,image/gif,image/webp';
  input.addEventListener('change', () => {
    if (input.files[0]) {
      attachPhotoToCard(cardId, input.files[0]);
    }
  });
  input.click();
}

async function attachPhotoToCard(cardId, file) {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) return;

  const card = await getCard(cardId);
  if (!card) return;

  const oldHash = card.image_filename;
  const hash = await saveImage(file, file.name);

  executeCommand({
    execute: async () => {
      await updateCard(cardId, { image_filename: hash });
      imageUrlCache.delete(hash); // force re-fetch for fresh URL
      await refreshCardInDom(cardId);
      refreshConnectionPaths();
      await refreshPanelForCard(cardId);
    },
    undo: async () => {
      await updateCard(cardId, { image_filename: oldHash });
      await refreshCardInDom(cardId);
      refreshConnectionPaths();
      await refreshPanelForCard(cardId);
    },
  });
}

async function removePhotoFromCard(cardId) {
  const card = await getCard(cardId);
  if (!card || !card.image_filename) return;

  const oldHash = card.image_filename;

  executeCommand({
    execute: async () => {
      await updateCard(cardId, { image_filename: null });
      await refreshCardInDom(cardId);
      refreshConnectionPaths();
      await refreshPanelForCard(cardId);
    },
    undo: async () => {
      await updateCard(cardId, { image_filename: oldHash });
      await refreshCardInDom(cardId);
      refreshConnectionPaths();
      await refreshPanelForCard(cardId);
    },
  });
}

async function refreshPanelForCard(cardId) {
  const placementId = getCurrentPlacementId();
  if (!placementId) return;

  const placement = await getPlacement(placementId);
  if (!placement || placement.card_id !== cardId) return;

  const card = await getCard(cardId);
  if (!card) return;

  const imgUrl = await getImageUrl(card.image_filename);
  const g = document.getElementById('card-layer').querySelector(`[data-placement-id="${placementId}"]`);
  if (g) {
    const gRect = g.getBoundingClientRect();
    showCardPanel(placementId, card, gRect.right + 8, gRect.top, imgUrl);
  }
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

// ── Connection logic ──

async function renderConnections() {
  const connectionLayer = document.getElementById('connection-layer');
  connectionLayer.innerHTML = '';

  const connections = await getConnectionsByTab(currentTabId);
  for (const conn of connections) {
    const fromRect = getEndpointRect(conn.from_type, conn.from_id);
    const toRect = getEndpointRect(conn.to_type, conn.to_id);
    if (!fromRect || !toRect) continue;

    const g = createConnectionElement(conn, fromRect, toRect, {
      onConnectionSelected: (connId) => selectConnection(connId),
    });

    // Right-click context menu
    g.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showContextMenu(e.clientX, e.clientY, [
        {
          label: 'Edit',
          onClick: () => selectConnection(conn.id),
        },
        {
          label: 'Delete connection',
          danger: true,
          onClick: () => deleteConnectionAction(conn.id),
        },
      ]);
    });

    connectionLayer.appendChild(g);
  }
}

function getEndpointRect(type, id) {
  if (type === 'card') {
    const cardLayer = document.getElementById('card-layer');
    const el = cardLayer.querySelector(`[data-placement-id="${id}"]`);
    return el ? getCardRect(el) : null;
  } else if (type === 'group') {
    const groupLayer = document.getElementById('group-layer');
    const el = groupLayer.querySelector(`[data-group-id="${id}"]`);
    return el ? getGroupRect(el) : null;
  }
  return null;
}

function refreshConnectionPaths() {
  const connectionLayer = document.getElementById('connection-layer');
  for (const g of connectionLayer.children) {
    if (!g.classList.contains('connection-group')) continue;
    const connId = g.dataset.connectionId;
    // We need the connection data to know endpoints — read from a data attribute cache
    const fromType = g.dataset.fromType;
    const fromId = g.dataset.fromId;
    const toType = g.dataset.toType;
    const toId = g.dataset.toId;
    const color = g.dataset.color;
    const label = g.dataset.label;

    if (fromType && fromId && toType && toId) {
      const fromRect = getEndpointRect(fromType, fromId);
      const toRect = getEndpointRect(toType, toId);
      if (fromRect && toRect) {
        updateConnectionPath(g, fromRect, toRect, { color: color || 'red', label: label || null });
      }
    }
  }
}

async function selectConnection(connectionId) {
  setSelection(connectionId, 'connection');
  const conn = await getConnection(connectionId);
  if (!conn) return;
  announce('Selected connection');

  // Position floating panel near the connection path midpoint on screen
  const connG = document.getElementById('connection-layer')
    .querySelector(`[data-connection-id="${connectionId}"]`);
  if (connG) {
    const pathEl = connG.querySelector('.connection-path');
    if (pathEl) {
      const pathRect = pathEl.getBoundingClientRect();
      showConnectionPanel(connectionId, conn, pathRect.left + pathRect.width / 2, pathRect.top);
    }
  }
}

async function deleteConnectionAction(connectionId) {
  const conn = await getConnection(connectionId);
  if (!conn) return;

  await executeCommand({
    execute: async () => {
      await deleteConnection(connectionId);
      await renderConnections();
      setSelection(null);
      hidePanel();
    },
    undo: async () => {
      await dbPut('connections', conn);
      await renderConnections();
    },
  });

  announce('Connection deleted');
}

// ── Keyboard shortcuts ──

function onKeyDown(e) {
  // Don't intercept when typing in an input/textarea
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    undo();
    return;
  }

  if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
    e.preventDefault();
    redo();
    return;
  }

  if (e.key === 'Delete' || e.key === 'Backspace') {
    const selType = getSelectionType();
    const ids = getSelectedIds();
    if (!selType || ids.size === 0) return;

    e.preventDefault();
    if (selType === 'card') {
      for (const id of ids) removePlacement(id);
    } else if (selType === 'connection') {
      for (const id of ids) deleteConnectionAction(id);
    } else if (selType === 'group') {
      for (const id of ids) deleteGroupAction(id);
    }
  }
}

// ── Connection handle hover + drag-to-create ──

// Snap radius in canvas-space pixels for connection target detection
const CONNECTION_SNAP_RADIUS = 40;

// Find the nearest card or group element within the snap radius of a canvas point.
// Returns the <g> element or null.
function findNearestTarget(canvasX, canvasY) {
  const cardLayer = document.getElementById('card-layer');
  const groupLayer = document.getElementById('group-layer');
  let best = null;
  let bestDist = CONNECTION_SNAP_RADIUS;

  for (const g of cardLayer.children) {
    if (connectionSource && connectionSource.type === 'card' && g.dataset.placementId === connectionSource.id) continue;
    const r = getCardRect(g);
    const dist = distToRect(canvasX, canvasY, r);
    if (dist < bestDist) { bestDist = dist; best = g; }
  }
  for (const g of groupLayer.children) {
    if (connectionSource && connectionSource.type === 'group' && g.dataset.groupId === connectionSource.id) continue;
    const r = getGroupRect(g);
    const dist = distToRect(canvasX, canvasY, r);
    if (dist < bestDist) { bestDist = dist; best = g; }
  }
  return best;
}

function distToRect(px, py, rect) {
  const cx = Math.max(rect.x, Math.min(px, rect.x + rect.width));
  const cy = Math.max(rect.y, Math.min(py, rect.y + rect.height));
  const dx = px - cx;
  const dy = py - cy;
  return Math.sqrt(dx * dx + dy * dy);
}

function setupConnectionInteraction() {
  const svg = getSvg();
  const NS = 'http://www.w3.org/2000/svg';

  // Create a persistent preview line element
  previewLine = document.createElementNS(NS, 'path');
  previewLine.classList.add('connection-preview');
  previewLine.style.display = 'none';

  svg.addEventListener('pointermove', onHandleHover);
  svg.addEventListener('pointerdown', onHandleDragStart, true);
  svg.addEventListener('pointermove', onHandleDragMove);
  svg.addEventListener('pointerup', onHandleDragEnd);

}

function onHandleHover(e) {
  // Don't show handles while drawing a connection or dragging
  if (isDrawingConnection) return;

  const target = e.target;

  // Check if hovering a connection handle — keep handles visible
  if (target.classList.contains('connection-handle')) return;

  // Find which card or group element we're inside
  const cardG = target.closest('[data-placement-id]');
  const groupG = target.closest('[data-group-id]');

  // If hovering a card inside a group, show card handles (not group)
  const element = cardG || groupG;

  if (element === hoveredElement) return;

  // Remove handles from previous element
  if (hoveredElement) {
    hideHandles(hoveredElement);
    hoveredElement = null;
  }

  if (!element) return;

  // Don't show handles if the element is being dragged (selected and pointer is down)
  if (cardG) {
    const rect = getCardRect(cardG);
    showHandles(cardG, rect);
    hoveredElement = cardG;
  } else if (groupG) {
    const rect = getGroupRect(groupG);
    showHandles(groupG, rect);
    hoveredElement = groupG;
  }
}

function onHandleDragStart(e) {
  const target = e.target;
  if (!target.classList.contains('connection-handle')) return;

  e.stopPropagation();
  e.preventDefault();

  const parentG = target.closest('[data-placement-id]') || target.closest('[data-group-id]');
  if (!parentG) return;

  const side = target.dataset.handleSide;
  const isCard = !!parentG.dataset.placementId;
  const type = isCard ? 'card' : 'group';
  const id = isCard ? parentG.dataset.placementId : parentG.dataset.groupId;

  connectionSource = { type, id, side };
  isDrawingConnection = true;

  // Add preview line to connection layer
  const connectionLayer = document.getElementById('connection-layer');
  previewLine.style.display = '';
  connectionLayer.appendChild(previewLine);

  // Capture pointer on SVG for drag tracking
  const svg = getSvg();
  svg.setPointerCapture(e.pointerId);
}

function onHandleDragMove(e) {
  if (!isDrawingConnection || !connectionSource) return;

  const svg = getSvg();
  const vp = getViewport();
  const canvasPos = clientToCanvas(svg, e.clientX, e.clientY, vp);

  // Get source anchor point
  const sourceRect = getEndpointRect(connectionSource.type, connectionSource.id);
  if (!sourceRect) return;
  const anchor = getHandleAnchor(sourceRect, connectionSource.side);

  const d = buildPreviewPath(anchor.x, anchor.y, canvasPos.x, canvasPos.y);
  previewLine.setAttribute('d', d);

  // Highlight target handles if cursor is over a valid target
  highlightTargetHandles(e);
}

function highlightTargetHandles(e) {
  // Remove previous highlights
  const allHandles = document.querySelectorAll('.connection-handle.target-highlight');
  for (const h of allHandles) h.classList.remove('target-highlight');

  // Try direct hit first, then snap to nearest target within radius
  const target = document.elementFromPoint(e.clientX, e.clientY);
  let parentG = target ? target.closest('[data-placement-id]') || target.closest('[data-group-id]') : null;
  if (!parentG) {
    const svg = getSvg();
    const vp = getViewport();
    const canvasPos = clientToCanvas(svg, e.clientX, e.clientY, vp);
    parentG = findNearestTarget(canvasPos.x, canvasPos.y);
  }
  if (!parentG) {
    // Cursor left the snap zone — clean up any lingering target highlight
    if (hoveredElement) { hideHandles(hoveredElement); hoveredElement = null; }
    return;
  }

  const isCard = !!parentG.dataset.placementId;
  const targetType = isCard ? 'card' : 'group';
  const targetId = isCard ? parentG.dataset.placementId : parentG.dataset.groupId;

  // Don't highlight self
  if (targetType === connectionSource.type && targetId === connectionSource.id) return;

  // Show and highlight handles on the target
  if (parentG !== hoveredElement) {
    if (hoveredElement) hideHandles(hoveredElement);
    const rect = isCard ? getCardRect(parentG) : getGroupRect(parentG);
    showHandles(parentG, rect);
    hoveredElement = parentG;
  }

  const handles = parentG.querySelectorAll('.connection-handle');
  for (const h of handles) {
    h.classList.add('visible');
    h.classList.add('target-highlight');
  }
}

async function onHandleDragEnd(e) {
  if (!isDrawingConnection || !connectionSource) return;

  isDrawingConnection = false;
  previewLine.style.display = 'none';
  previewLine.remove();

  const svg = getSvg();
  svg.releasePointerCapture(e.pointerId);

  // Clear highlights
  const allHandles = document.querySelectorAll('.connection-handle.target-highlight');
  for (const h of allHandles) h.classList.remove('target-highlight');

  // Clean up hovered handles
  if (hoveredElement) {
    hideHandles(hoveredElement);
    hoveredElement = null;
  }

  // Find target under cursor, with snap fallback for near-misses
  const target = document.elementFromPoint(e.clientX, e.clientY);
  let parentG = target ? target.closest('[data-placement-id]') || target.closest('[data-group-id]') : null;
  if (!parentG) {
    const vp = getViewport();
    const canvasPos = clientToCanvas(svg, e.clientX, e.clientY, vp);
    parentG = findNearestTarget(canvasPos.x, canvasPos.y);
  }

  if (!parentG) {
    // Released on empty canvas — cancel
    connectionSource = null;
    return;
  }

  const isCard = !!parentG.dataset.placementId;
  const targetType = isCard ? 'card' : 'group';
  const targetId = isCard ? parentG.dataset.placementId : parentG.dataset.groupId;

  // No self-connections
  if (targetType === connectionSource.type && targetId === connectionSource.id) {
    connectionSource = null;
    return;
  }

  // Create the connection
  const conn = await createConnection(
    currentTabId,
    connectionSource.type,
    connectionSource.id,
    targetType,
    targetId
  );

  await renderConnections();
  setSelection(conn.id, 'connection');
  announce('Connection created');

  const connId = conn.id;
  executeCommand({
    execute: async () => {
      const existing = await getConnection(connId);
      if (existing) return;
      await dbPut('connections', conn);
      await renderConnections();
    },
    undo: async () => {
      await deleteConnection(connId);
      await renderConnections();
      setSelection(null);
      hidePanel();
    },
  });

  connectionSource = null;
}

// ── Card Library ──

async function openCardLibrary() {
  const cards = await getCardsByBoard(currentBoard.id);
  await showCardLibrary(cards, getImageUrl, {
    onPlaceCard: async (cardId) => {
      const svg = getSvg();
      const vp = getViewport();
      const rect = svg.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const pos = clientToCanvas(svg, rect.left + centerX, rect.top + centerY, vp);
      await placeCardFromLibrary(cardId, pos.x, pos.y);
    },
    onDeleteCard: (cardId) => deleteCardEverywhere(cardId),
    onClose: () => {},
  });
}

// ── Board Switcher ──

async function openBoardSwitcher() {
  const boards = await getAllBoards();
  showBoardSwitcher(boards, currentBoard.id, {
    onSwitch: (boardId) => switchBoard(boardId),
    onCreateBoard: () => createNewBoard(),
    onDuplicateBoard: (boardId) => duplicateBoard(boardId),
    onDeleteBoard: (boardId) => deleteBoardAction(boardId),
  });
}

async function switchBoard(boardId) {
  const board = await getBoard(boardId);
  if (!board) return;

  currentBoard = board;
  updateBoardNameDisplay(board.name);

  const tabs = await getTabsByBoard(board.id);
  if (tabs.length === 0) {
    await createTab(board.id, 'Tab 1', 0);
    const newTabs = await getTabsByBoard(board.id);
    currentTabId = newTabs[0].id;
    renderTabs(newTabs, currentTabId);
  } else {
    currentTabId = tabs[0].id;
    renderTabs(tabs, currentTabId);
  }

  await renderPlacements();
  await renderGroups();
  await renderConnections();
  setSelection(null);
  hidePanel();
  setViewport({ x: 0, y: 0, zoom: 1.0 });
  updateZoomDisplay(1.0);
}

async function createNewBoard() {
  const board = await createBoard('New Board');
  await createTab(board.id, 'Tab 1', 0);
  await switchBoard(board.id);
}

async function duplicateBoard(boardId) {
  const sourceBoard = await getBoard(boardId);
  if (!sourceBoard) return;

  const newBoard = await createBoard(sourceBoard.name + ' (copy)');

  // Duplicate all cards
  const sourceCards = await getCardsByBoard(boardId);
  const cardIdMap = new Map(); // old card id -> new card id
  for (const card of sourceCards) {
    const newCard = await createCard(newBoard.id, card.title, card.description);
    if (card.image_filename) {
      await updateCard(newCard.id, { image_filename: card.image_filename });
    }
    cardIdMap.set(card.id, newCard.id);
  }

  // Duplicate all tabs, placements, groups, connections
  const sourceTabs = await getTabsByBoard(boardId);
  for (const tab of sourceTabs) {
    const newTab = await createTab(newBoard.id, tab.name, tab.order);

    // Duplicate groups
    const sourceGroups = await getGroupsByTab(tab.id);
    const groupIdMap = new Map();
    for (const group of sourceGroups) {
      const newGroup = await createGroup(newTab.id, group.label, group.x, group.y);
      await updateGroup(newGroup.id, { width: group.width, height: group.height });
      groupIdMap.set(group.id, newGroup.id);
    }

    // Duplicate placements
    const sourcePlacements = await getPlacementsByTab(tab.id);
    const placementIdMap = new Map();
    for (const p of sourcePlacements) {
      const newCardId = cardIdMap.get(p.card_id);
      if (!newCardId) continue;
      const newPlacement = await createPlacement(newTab.id, newCardId, p.x, p.y);
      if (p.group_id) {
        const newGroupId = groupIdMap.get(p.group_id);
        if (newGroupId) await updatePlacement(newPlacement.id, { group_id: newGroupId });
      }
      placementIdMap.set(p.id, newPlacement.id);
    }

    // Duplicate connections
    const sourceConns = await getConnectionsByTab(tab.id);
    for (const conn of sourceConns) {
      let fromId = conn.from_id;
      let toId = conn.to_id;
      if (conn.from_type === 'card') fromId = placementIdMap.get(conn.from_id) || conn.from_id;
      if (conn.from_type === 'group') fromId = groupIdMap.get(conn.from_id) || conn.from_id;
      if (conn.to_type === 'card') toId = placementIdMap.get(conn.to_id) || conn.to_id;
      if (conn.to_type === 'group') toId = groupIdMap.get(conn.to_id) || conn.to_id;

      const newConn = await createConnection(newTab.id, conn.from_type, fromId, conn.to_type, toId);
      if (conn.label || conn.color !== 'red') {
        await updateConnection(newConn.id, { label: conn.label, color: conn.color });
      }
    }
  }

  await switchBoard(newBoard.id);
}

async function deleteBoardAction(boardId) {
  const boards = await getAllBoards();
  if (boards.length <= 1) return;

  // Delete all data for this board
  const tabs = await getTabsByBoard(boardId);
  for (const tab of tabs) {
    const placements = await getPlacementsByTab(tab.id);
    for (const p of placements) await deletePlacement(p.id);
    const groups = await getGroupsByTab(tab.id);
    for (const g of groups) await deleteGroup(g.id);
    await deleteConnectionsByTab(tab.id);
    await deleteTabStore(tab.id);
  }
  const cards = await getCardsByBoard(boardId);
  for (const card of cards) await deleteCard(card.id);
  await dbDelete('boards', boardId);

  // Switch to another board
  const remainingBoards = await getAllBoards();
  if (currentBoard.id === boardId) {
    await switchBoard(remainingBoards[0].id);
  }
}

// ── Import/Export ──

async function handleExportZip() {
  try {
    await exportBoardAsZip(currentBoard);
  } catch (err) {
    showImportError('Export failed', err.message);
  }
}

function handleImportZip() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.zip';
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const board = await importBoardFromZip(file);
      await switchBoard(board.id);
      announce(`Board "${board.name}" imported`);
    } catch (err) {
      const detail = err.file
        ? `File: ${err.file}, Row: ${err.row}\n${err.message}`
        : err.message;
      showImportError('Import failed', detail);
    }
  });
  input.click();
}

async function handleExportPng() {
  try {
    const tabs = await getTabsByBoard(currentBoard.id);
    const tab = tabs.find(t => t.id === currentTabId);
    await exportTabAsImage(currentBoard.name, tab?.name || 'tab');
  } catch (err) {
    showImportError('Image export failed', err.message);
  }
}

async function handleExportPdf() {
  try {
    const tabs = await getTabsByBoard(currentBoard.id);
    const tab = tabs.find(t => t.id === currentTabId);
    await exportTabAsPdf(currentBoard.name, tab?.name || 'tab');
  } catch (err) {
    showImportError('PDF export failed', err.message);
  }
}

function showImportError(title, detail) {
  const overlay = document.createElement('div');
  overlay.className = 'import-error-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'import-error-dialog';

  const h3 = document.createElement('h3');
  h3.textContent = title;
  dialog.appendChild(h3);

  if (detail) {
    const detailDiv = document.createElement('div');
    detailDiv.className = 'error-detail';
    detailDiv.textContent = detail;
    dialog.appendChild(detailDiv);
  }

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'OK';
  closeBtn.addEventListener('click', () => overlay.remove());
  dialog.appendChild(closeBtn);

  overlay.appendChild(dialog);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.body.appendChild(overlay);
}

window.addEventListener('pinboard:storage-full', () => {
  showImportError('Storage full', 'Your browser storage is full. Try deleting unused boards or images to free up space.');
});

init().catch(console.error);
