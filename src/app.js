import { initTheme, toggleTheme } from './ui/theme.js';
import { initToolbar, updateZoomDisplay } from './ui/toolbar.js';
import { initTabBar, renderTabs } from './ui/tabbar.js';
import { initCanvas, getViewport, setViewport, zoomIn, zoomOut, zoomReset, fitAll, setSelection, getSvg } from './ui/canvas.js';
import { initFloatingPanel, showCardPanel, hidePanel } from './ui/floating-panel.js';
import { createCardElement, updateCardElement, adjustCardHeight, getCardRect } from './ui/card.js';
import { createBoard, getBoard, getAllBoards, updateBoardName } from './store/board.js';
import { createCard, getCard, updateCard } from './store/cards.js';
import { createTab, getTabsByBoard, updateTab, deleteTab as deleteTabStore } from './store/tabs.js';
import { createPlacement, getPlacement, getPlacementsByTab, updatePlacement, deletePlacement } from './store/placements.js';
import { dbPut } from './store/db.js';
import { executeCommand, undo, redo } from './utils/history.js';

let currentBoard = null;
let currentTabId = null;

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
    onZoomIn: () => zoomIn(),
    onZoomOut: () => zoomOut(),
    onZoomReset: () => zoomReset(),
    onFitAll: () => fitAllCards(),
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
  });

  // Render initial state
  renderTabs(tabs, currentTabId);
  await renderPlacements();
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
  const cardId = card.id;
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
    onCardMoved: (placementId, oldX, oldY, newX, newY) => {
      // Position already persisted during first execute; undo/redo toggle between old/new
      executeCommand({
        execute: async () => {
          await updatePlacement(placementId, { x: newX, y: newY });
          const el = cardLayer.querySelector(`[data-placement-id="${placementId}"]`);
          if (el) el.setAttribute('transform', `translate(${newX}, ${newY})`);
        },
        undo: async () => {
          await updatePlacement(placementId, { x: oldX, y: oldY });
          const el = cardLayer.querySelector(`[data-placement-id="${placementId}"]`);
          if (el) el.setAttribute('transform', `translate(${oldX}, ${oldY})`);
        },
      });
    },
    onCardSelected: async (placementId, cardId) => {
      setSelection(placementId);
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

function announce(message) {
  const el = document.getElementById('aria-live');
  if (el) el.textContent = message;
}

async function fitAllCards() {
  const cardLayer = document.getElementById('card-layer');
  const rects = [];
  for (const g of cardLayer.children) {
    rects.push(getCardRect(g));
  }
  fitAll(rects);
}

init().catch(console.error);
