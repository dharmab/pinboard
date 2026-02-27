const CARD_WIDTH = 220;
const NS = 'http://www.w3.org/2000/svg';

function createPhotoDiv(imageUrl, onOverlayClick) {
  const photoDiv = document.createElement('div');
  photoDiv.className = 'card-photo';

  const img = document.createElement('img');
  img.src = imageUrl;
  img.alt = '';
  img.draggable = false;
  img.addEventListener('error', () => {
    photoDiv.classList.add('card-photo-broken');
    img.style.display = 'none';
  });
  photoDiv.appendChild(img);

  if (onOverlayClick) {
    const overlay = document.createElement('button');
    overlay.className = 'card-photo-overlay';
    overlay.title = 'Change photo';
    overlay.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;
    overlay.addEventListener('click', (e) => {
      e.stopPropagation();
      onOverlayClick();
    });
    overlay.addEventListener('pointerdown', (e) => e.stopPropagation());
    photoDiv.appendChild(overlay);
  }

  return photoDiv;
}

export function createCardElement(placement, card, callbacks, imageUrl) {
  const g = document.createElementNS(NS, 'g');
  g.dataset.placementId = placement.id;
  g.dataset.cardId = card.id;
  g.setAttribute('transform', `translate(${placement.x}, ${placement.y})`);

  const fo = document.createElementNS(NS, 'foreignObject');
  fo.setAttribute('width', CARD_WIDTH);
  // Set a generous initial height; we'll measure and adjust after DOM insertion
  fo.setAttribute('height', '400');

  const div = document.createElement('div');
  div.className = 'card-content';

  // Photo (before title)
  if (imageUrl) {
    const photoDiv = createPhotoDiv(imageUrl, () => callbacks.onPhotoClick?.(card.id));
    div.appendChild(photoDiv);
  }

  const titleDiv = document.createElement('div');
  titleDiv.className = 'card-title';
  titleDiv.textContent = card.title;

  div.appendChild(titleDiv);

  if (card.description) {
    const descDiv = document.createElement('div');
    descDiv.className = 'card-description';
    descDiv.textContent = card.description;
    div.appendChild(descDiv);
  }

  fo.appendChild(div);
  g.appendChild(fo);

  // Interaction state
  let isDragging = false;
  let dragStart = { x: 0, y: 0 };
  let elementStart = { x: placement.x, y: placement.y };
  let hasMoved = false;

  g.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    // Don't start drag if we're in an input or clicking the photo overlay
    if (e.target.tagName === 'INPUT' || e.target.closest('.card-photo-overlay')) return;

    isDragging = true;
    hasMoved = false;
    dragStart = { x: e.clientX, y: e.clientY };
    elementStart = { x: placement.x, y: placement.y };
    g.setPointerCapture(e.pointerId);
    div.style.cursor = 'grabbing';
  });

  g.addEventListener('pointermove', (e) => {
    if (!isDragging) return;

    const zoom = callbacks.getZoom();
    const dx = (e.clientX - dragStart.x) / zoom;
    const dy = (e.clientY - dragStart.y) / zoom;

    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      hasMoved = true;
    }

    const newX = elementStart.x + dx;
    const newY = elementStart.y + dy;
    g.setAttribute('transform', `translate(${newX}, ${newY})`);
    placement.x = newX;
    placement.y = newY;
  });

  g.addEventListener('pointerup', (e) => {
    if (!isDragging) return;
    isDragging = false;
    g.releasePointerCapture(e.pointerId);
    div.style.cursor = '';

    if (hasMoved) {
      callbacks.onCardMoved(placement.id, elementStart.x, elementStart.y, placement.x, placement.y);
    } else {
      callbacks.onCardSelected(placement.id, card.id);
    }
  });

  titleDiv.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    startInlineEdit(titleDiv, card, callbacks);
  });

  return g;
}

function startInlineEdit(titleDiv, card, callbacks) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'card-title-input';
  input.value = card.title;
  input.maxLength = 80;

  const oldTitle = card.title;

  function commit() {
    const newTitle = input.value.trim() || oldTitle;
    titleDiv.textContent = newTitle;
    if (newTitle !== oldTitle) {
      callbacks.onTitleEdited(card.id, oldTitle, newTitle);
    }
  }

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      input.removeEventListener('blur', commit);
      titleDiv.textContent = oldTitle;
    }
  });
  // Stop pointer events from bubbling to the card drag handler
  input.addEventListener('pointerdown', (e) => e.stopPropagation());

  titleDiv.textContent = '';
  titleDiv.appendChild(input);
  input.focus();
  input.select();
}

export function updateCardElement(g, card, imageUrl, onPhotoClick) {
  const titleDiv = g.querySelector('.card-title');
  if (titleDiv && !titleDiv.querySelector('input')) {
    titleDiv.textContent = card.title;
  }

  let descDiv = g.querySelector('.card-description');
  if (card.description) {
    if (!descDiv) {
      descDiv = document.createElement('div');
      descDiv.className = 'card-description';
      g.querySelector('.card-content').appendChild(descDiv);
    }
    descDiv.textContent = card.description;
  } else if (descDiv) {
    descDiv.remove();
  }

  // Photo update
  const content = g.querySelector('.card-content');
  let photoDiv = content.querySelector('.card-photo');

  if (imageUrl) {
    if (!photoDiv) {
      photoDiv = createPhotoDiv(imageUrl, onPhotoClick ? () => onPhotoClick(card.id) : null);
      content.insertBefore(photoDiv, content.firstChild);
    } else {
      const img = photoDiv.querySelector('img');
      if (img) {
        img.src = imageUrl;
        img.style.display = '';
      }
      photoDiv.classList.remove('card-photo-broken');
    }
  } else if (photoDiv) {
    photoDiv.remove();
  }

  adjustCardHeight(g);
}

export function adjustCardHeight(g) {
  const fo = g.querySelector('foreignObject');
  const div = g.querySelector('.card-content');
  if (!fo || !div) return;

  // Temporarily set a large height to measure actual content
  fo.setAttribute('height', '1000');
  const actualHeight = div.getBoundingClientRect().height;
  if (actualHeight > 0) {
    fo.setAttribute('height', Math.ceil(actualHeight));
  }
}

export function getCardRect(g) {
  const fo = g.querySelector('foreignObject');
  const transform = g.getAttribute('transform');
  const match = transform?.match(/translate\(([^,]+),\s*([^)]+)\)/);
  const x = match ? parseFloat(match[1]) : 0;
  const y = match ? parseFloat(match[2]) : 0;
  const height = parseFloat(fo?.getAttribute('height') || '80');

  return { x, y, width: CARD_WIDTH, height };
}
