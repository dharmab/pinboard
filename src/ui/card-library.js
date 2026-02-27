import { showConfirmDialog } from './context-menu.js';

const TRASH_ICON = `<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;

let overlayEl = null;
let callbacks = {};

/**
 * Show the card library overlay.
 * @param {Array<{id, title, description, image_filename}>} cards
 * @param {Function} getImageUrl - async (hash) => url|null
 * @param {{onPlaceCard: Function, onDeleteCard: Function, onClose: Function}} cbs
 */
export async function showCardLibrary(cards, getImageUrl, cbs) {
  callbacks = cbs;
  closeCardLibrary();

  overlayEl = document.createElement('div');
  overlayEl.className = 'card-library-overlay';

  const panel = document.createElement('div');
  panel.className = 'card-library';

  // Header
  const header = document.createElement('div');
  header.className = 'card-library-header';
  const title = document.createElement('h2');
  title.textContent = 'All Cards';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'card-library-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '\u00d7';
  closeBtn.addEventListener('click', () => closeCardLibrary());
  header.append(title, closeBtn);

  // Body
  const body = document.createElement('div');
  body.className = 'card-library-body';

  if (cards.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'card-library-empty';
    empty.textContent = 'No cards yet. Click "Add Card" in the toolbar to create one.';
    body.appendChild(empty);
  } else {
    const list = document.createElement('div');
    list.className = 'card-library-list';

    for (const card of cards) {
      const item = document.createElement('div');
      item.className = 'card-library-item';
      item.draggable = true;
      item.dataset.cardId = card.id;

      // Thumbnail
      const imgUrl = await getImageUrl(card.image_filename);
      if (imgUrl) {
        const thumb = document.createElement('img');
        thumb.className = 'card-library-item-thumb';
        thumb.src = imgUrl;
        thumb.alt = '';
        thumb.draggable = false;
        item.appendChild(thumb);
      } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'card-library-item-thumb-placeholder';
        item.appendChild(placeholder);
      }

      // Info
      const info = document.createElement('div');
      info.className = 'card-library-item-info';
      const titleEl = document.createElement('div');
      titleEl.className = 'card-library-item-title';
      titleEl.textContent = card.title;
      info.appendChild(titleEl);
      if (card.description) {
        const desc = document.createElement('div');
        desc.className = 'card-library-item-desc';
        desc.textContent = card.description;
        info.appendChild(desc);
      }
      item.appendChild(info);

      // Delete button
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'card-library-item-delete';
      deleteBtn.setAttribute('aria-label', 'Delete card everywhere');
      deleteBtn.title = 'Delete card everywhere';
      deleteBtn.innerHTML = TRASH_ICON;
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showConfirmDialog(
          `Delete "${card.title}" from all tabs? This cannot be undone.`,
          () => {
            callbacks.onDeleteCard(card.id);
            item.remove();
            // Check if list is now empty
            if (list.children.length === 0) {
              body.innerHTML = '';
              const empty = document.createElement('div');
              empty.className = 'card-library-empty';
              empty.textContent = 'No cards yet.';
              body.appendChild(empty);
            }
          }
        );
      });
      item.appendChild(deleteBtn);

      // Drag to place on canvas
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('application/x-pinboard-card', card.id);
        e.dataTransfer.effectAllowed = 'copy';
      });

      list.appendChild(item);
    }

    body.appendChild(list);
  }

  panel.append(header, body);
  overlayEl.appendChild(panel);

  // Click outside panel to close
  overlayEl.addEventListener('pointerdown', (e) => {
    if (e.target === overlayEl) {
      closeCardLibrary();
    }
  });

  document.body.appendChild(overlayEl);
}

export function closeCardLibrary() {
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
    callbacks.onClose?.();
  }
}
