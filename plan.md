# Pinboard — Implementation Progress

## What's Done (Increment 1)

### Project Scaffolding

- `package.json` — Zero-dependency project using Bun as bundler and dev server (no Vite)
- `index.html` — Application shell with SVG canvas structure, ARIA live region
- `vercel.json` — Deploys via `bun run build` with `dist/` output
- `.gitignore` — Standard excludes for node_modules, dist, bun.lock

### Data Layer (`src/store/`)

- `db.js` — Raw IndexedDB (no libraries) with promise helpers. Opens `pinboard_v1` database with all 7 object stores and indexes defined in the spec: boards, cards, tabs, placements, groups, connections, images
- `board.js` — Board CRUD (create, get, getAll, updateName)
- `cards.js` — Card CRUD (create, get, getByBoard, update, delete)
- `tabs.js` — Tab CRUD (create, get, getByBoard sorted by order, update, delete, reorder)
- `placements.js` — Placement CRUD (create, get, getByTab, getByCard, update, delete, deleteByTab)
- `connections.js` — Full CRUD (create, get, getByTab, update, delete, deleteByTab)
- `groups.js`, `images.js` — Stubs returning empty arrays; stores exist in the DB but no UI consumes them yet

### Utilities (`src/utils/`)

- `uuid.js` — `createId()` wrapping `crypto.randomUUID()`
- `geometry.js` — `clientToCanvas`, `boundingBox`, `fitToView`, `clampZoom` (range 0.1–4.0)
- `history.js` — Command-pattern undo/redo stack, max 100 entries, `executeCommand`, `undo`, `redo`, `onHistoryChange` listener

### Theming

- `theme.js` — Reads `localStorage('pinboard_theme')`, falls back to `prefers-color-scheme`, sets `data-theme` on `<html>`, `toggleTheme()` persists choice
- `style.css` — All spec color tokens for light and dark modes, toolbar, tab bar, card, floating panel styles, reduced-motion support

### Canvas (`src/ui/canvas.js`)

- SVG viewport with `translate(x, y) scale(zoom)` on `#viewport-transform`
- Pan via pointer capture on empty canvas
- Zoom via scroll wheel, zooms toward cursor position
- Toolbar zoom controls: in, out, reset (100%), fit-all
- Double-click empty canvas → callback for card creation
- Click empty canvas → deselect all, hide floating panel

### Cards (`src/ui/card.js`)

- SVG `<g>` with `<foreignObject>` containing HTML div (enables CSS word-wrap and line-clamp)
- 220px fixed width, auto-height based on content measurement
- Drag to move (respects zoom level)
- Click to select (visual highlight, floating panel opens)
- Double-click title for inline editing (input replaces title, commit on blur/Enter, cancel on Escape)
- Drop shadow filter defined in SVG `<defs>`

### Floating Panel (`src/ui/floating-panel.js`)

- HTML `<div role="dialog">` absolutely positioned over canvas
- Card mode: title input, description textarea (auto-expanding), "Remove from tab" button
- Positioned near selected card, snapped inward if off-screen
- Hidden on empty-canvas click

### Tab Bar (`src/ui/tabbar.js`)

- Tab buttons with active state (`aria-selected`, bottom border highlight)
- "+" button to create new tab
- Double-click tab to rename inline
- Right-click context menu: Rename, Delete Tab (disabled if last tab)
- Viewport state saved/restored per tab on switch

### Toolbar (`src/ui/toolbar.js`)

- Board name input (editable, persists on blur)
- Undo/redo buttons (disable/enable reactively via `onHistoryChange`)
- "Add Card" button (creates card at viewport center)
- Zoom controls: −, percentage display (click to reset), +, fit-all
- Dark mode toggle (sun/moon icon)
- Inline SVG icons, no icon library

### App Wiring (`src/app.js`)

- On load: init theme → open DB → load or create default board/tab → init all UI components → render
- Tab switching saves current viewport, loads new tab's placements and viewport
- Card creation: store card → store placement → append SVG element → push undo command
- Undo/redo commands for: card create, card move, card title edit, card description edit, remove from tab, delete tab

### Groups (Increment 2)

- `src/store/groups.js` — Full CRUD (create, get, getByTab, update, delete), following `placements.js` pattern
- `src/ui/group.js` — SVG `<g>` rendering with `<rect>` (semi-transparent fill, rounded corners), `<text>` label, four corner resize handles
- Group drag: moves group and all member cards in real time (member offsets pre-cached on `pointerdown` for synchronous DOM updates during `pointermove`)
- Corner resize: min size 100×80, handles for all four corners with appropriate cursors
- Double-click label for inline edit via temporary `<foreignObject>` input
- Card-into-group membership: after card move, checks if card center overlaps any group's bounding box; sets or clears `placement.group_id` accordingly
- Floating panel for groups: label text input (max 60 chars), "Delete group" button with trash icon
- Toolbar "New Group" button (rectangle icon, placed next to "Add Card")
- Canvas selection system extended with type parameter (`'card'` or `'group'`); groups highlight with focus-ring stroke when selected
- Group deletion clears `group_id` on all member placements before removing the group record
- Undo/redo commands for: group create, group move (compound with member card positions), group resize, group label edit, group delete (restores memberships), card membership changes
- `fitAllElements()` includes group rects in bounding box calculation
- Tab switching and deletion handle groups alongside placements

### Connections (Increment 3)

- `src/store/connections.js` — Full CRUD (create, get, getByTab, update, delete, deleteByTab), following `placements.js` pattern
- `src/ui/connection.js` — SVG `<path>` rendering with quadratic bezier curves per spec formula (`CURVE_FACTOR = 0.25`)
  - `createConnectionElement`: renders `<g>` with invisible hit area path (16px stroke for easy clicking) and visible styled path
  - `updateConnectionPath`: recalculates bezier curve when endpoints move (card drag, group drag/resize)
  - `nearestBorderPoint`: anchors connection lines to the nearest point on source/target bounding box border
  - `bezierMidpoint`: computes B(0.5) for label pill placement
  - `showHandles`/`hideHandles`: four circular SVG handles at edge midpoints of cards/groups on hover
  - `buildPreviewPath`: generates dashed preview curve during drag-to-create
  - `getHandleAnchor`: returns canvas-space coordinates for a given edge handle
  - `CONNECTION_COLORS`: eight fixed palette colors per spec (red, orange, yellow, green, blue, purple, pink, gray)
- Connection handles: four circular handles appear at edge midpoints when hovering a card or group; hidden during drag
- Draw connection: drag from any handle → dashed curved preview line follows cursor → target highlights on hover → release on valid target creates connection; release on canvas cancels
- Self-connections rejected (same source and target)
- Label rendering: optional pill badge (`<foreignObject>` with `<span>`) at bezier midpoint, white/dark-mode background at 90% opacity, 1.5px border in connection color
- Floating panel for connections: label text input (max 60 chars, placeholder "Optional label"), 8-color swatch selector (circular buttons with active ring), "Delete connection" button with trash icon
- Canvas selection system extended with `'connection'` type; selected connections get thicker stroke (3.5px)
- Connection paths refresh automatically after card move, group move, group resize (synchronous DOM update via `refreshConnectionPaths`)
- Deleting a card placement or group also deletes all attached connections (with undo restore)
- Tab deletion deletes all connections on the tab
- Undo/redo commands for: connection create, connection label edit, connection color change, connection delete
- CSS styles: connection path stroke, hit area, handles (opacity transition, crosshair cursor, green highlight for valid target), preview line (dashed), label pill badge, color swatches in floating panel

### Card Photos (Increment 4)

- `src/store/images.js` — Full CRUD with SHA-256 deduplication via `crypto.subtle.digest`; `saveImage` computes hash, deduplicates, stores `{ hash, data: Blob, content_type, original_filename }`; `getImage` and `deleteImage` for retrieval and removal
- `src/ui/card.js` — `createPhotoDiv` helper renders photo div with `<img>` (object-fit: cover, 140px height, full card width via negative margins), overlay camera button on hover for quick replace, broken-image placeholder via CSS `::after` pseudo-element on load error
- `createCardElement` extended with `imageUrl` parameter; photo div inserted before title; pointerdown handler excludes `.card-photo-overlay` clicks from drag
- `updateCardElement` extended with `imageUrl` and `onPhotoClick` parameters; handles add/remove/update of photo div in place
- `src/ui/floating-panel.js` — `showCardPanel` extended with `imageUrl` parameter; photo section between description and actions: thumbnail (if present), "Change Photo" button (opens file picker, accepts JPEG/PNG/GIF/WebP), "Remove Photo" button (shown only when photo exists)
- `src/app.js` — `imageUrlCache` (Map of hash → objectURL) with `getImageUrl` helper for lazy-loading; `openPhotoPicker` creates ephemeral file input; `attachPhotoToCard` saves image then wraps card update in undo command; `removePhotoFromCard` similar undo wrapper; `refreshPanelForCard` re-renders floating panel if currently showing the modified card; drop-to-attach via `dragover`/`drop` listeners on `.card-content` with file type validation; `dragover`/`drop` prevention on canvas container to block browser file navigation
- Undo/redo commands for: photo attach (captures old hash, toggles `image_filename`), photo remove (same pattern)
- CSS: `.card-photo` (negative margins, 140px height, overflow hidden, rounded top), `.card-photo-overlay` (absolute positioned, opacity transition on hover), `.card-photo-broken` (background fill + SVG placeholder icon via data URL), `.card-drop-target` (focus ring highlight), `.panel-thumbnail`, `.panel-photo-buttons`, `.panel-btn` / `.panel-btn-danger` button styles

### Context Menus & Card Library (Increment 5)

- `src/ui/context-menu.js` — Generic reusable context menu module with `showContextMenu(x, y, items)` and `closeContextMenu()`; supports separator items, disabled items, and danger-styled items; `showConfirmDialog(message, onConfirm)` for destructive action confirmation with modal overlay
- Tab bar refactored to use shared context-menu module instead of its own inline implementation
- Card context menu (right-click): Edit (selects card and opens floating panel), Remove from this tab (same as floating panel action), Delete card everywhere (with confirmation dialog — permanently removes card, all placements, and all attached connections across all tabs; not undoable)
- Group context menu (right-click): Rename (selects group, opens floating panel, auto-focuses label input), Delete group (same as floating panel action, with danger styling)
- Connection context menu (right-click): Edit (selects connection and opens floating panel), Delete connection (same as floating panel action, with danger styling)
- `src/ui/card-library.js` — Full-screen overlay (`z-index: 150`) listing all cards in the current board; each row shows 40×40 thumbnail (or placeholder), title, truncated description, and a trash button for global deletion; cards are `draggable` with `application/x-pinboard-card` data transfer type; closes on click-outside or close button
- Canvas drop handler for card library: on receiving `application/x-pinboard-card` data, closes the library overlay, converts drop coordinates to canvas space, and creates a placement (with undo); skips if the card already exists on the current tab
- `deleteCardEverywhere` function: deletes all placements across all tabs (and their attached connections), then deletes the card record; re-renders current tab; not wrapped in undo (spec says global card deletion is not undoable)
- `src/ui/board-switcher.js` — Dropdown panel anchored below the toolbar listing all boards; active board highlighted; each board row has duplicate and delete action buttons (visible on hover); "+ New" button in header creates a board and switches to it; clicking a board switches to it; delete requires confirmation and is blocked if only one board exists
- Toolbar updated with "Boards" button (grid icon, opens board switcher), "Card Library" button (document icon, opens card library), placed alongside existing Add Card and New Group buttons
- `switchBoard` function: loads a different board, resets viewport, re-renders tabs/placements/groups/connections, updates the board name input display
- `duplicateBoard` function: deep copies all cards (with image hash references preserved), tabs, placements (with group membership), groups (with dimensions), and connections (with remapped IDs, labels, and colors) into a new board named "{name} (copy)"
- `deleteBoardAction` function: cascading delete of all tabs, placements, groups, connections, and cards for the board; switches to the first remaining board
- CSS: `.context-menu` shared styles (same visual treatment as tab context menu), `.context-menu-danger` (red text, red background on hover), `.context-menu-separator` (1px border line), `.confirm-overlay` + `.confirm-dialog` (centered modal with Cancel/Delete buttons), `.card-library-overlay` + `.card-library` (centered panel, max 720px wide, scrollable body), `.board-switcher` (fixed dropdown, 260px wide, item hover actions with opacity transition)

### Import/Export (Increment 6)

- `src/io/csv.js` — RFC 4180–compliant CSV serializer (`toCsv`) and parser (`parseCsv`); UTF-8 with BOM, CRLF line endings, double-quote escaping; no external libraries
- `src/io/export-zip.js` — `exportBoardAsZip(board)` serializes cards, tabs, placements, groups, and connections to five CSV files, collects image blobs from IndexedDB, assembles ZIP via JSZip, and triggers download as `{board_name}_{YYYY-MM-DD}.zip`
- `src/io/import-zip.js` — `importBoardFromZip(file)` reads and validates all five CSV files per spec section 11.7 (missing files, missing headers, cross-file reference integrity, type/color validation, self-connection rejection, image filename verification); remaps all IDs to new UUIDs; imports images via `saveImage` (preserves SHA-256 deduplication); creates a new board named `{name} (imported {date})` on conflict; returns the new board object; throws `ImportError` with file, row, and message on validation failure
- `src/io/export-png.js` — `exportTabAsImage(boardName, tabName, scale)` clones the SVG canvas, inlines light-mode CSS styles, converts card photo `<img>` elements to data URLs, serializes to SVG XML, renders to offscreen canvas at 2x scale, and downloads as WebP (when browser supports it and dimensions fit within 16384px limit) or PNG fallback; filename `{board}_{tab}_{date}.webp`
- `src/io/export-pdf.js` — `exportTabAsPdf(boardName, tabName, pageSize)` uses the same SVG-to-canvas pipeline as PNG export, then embeds the raster image into a jsPDF document with auto-orientation (landscape/portrait) and centered margin placement; downloads as `{board}_{tab}_{date}.pdf`
- Toolbar "Export" dropdown button (download icon) with menu items: Download ZIP, Import from ZIP, Download Image, Download PDF
- Error handling: modal dialog (`import-error-overlay` + `import-error-dialog`) with title, monospace detail area showing file/row/message, and OK dismiss button; used for both import validation failures and export errors
- JSZip (v3.x) and jsPDF (v4.x) added as npm dependencies

### Cross-Cutting Concerns (Increment 7)

- `src/store/db.js` — `dbPut` catches `QuotaExceededError` and dispatches `pinboard:storage-full` custom event; `app.js` listens and shows an error dialog explaining the storage limit and suggesting cleanup
- `src/ui/tabbar.js` — Tab buttons are `draggable="true"` with HTML5 drag-and-drop handlers; `dragover` shows a blue inset box-shadow drop indicator (before/after); `drop` computes new tab order and calls `reorderTabs()` from `tabs.js` to persist; visual feedback includes opacity fade on the dragged tab
- `src/ui/canvas.js` — Pinch-to-zoom via `touchstart`/`touchmove`/`touchend` listeners; tracks two-finger distance and midpoint; zooms toward the pinch center using the same viewport math as scroll zoom; cancels any in-progress pan when pinch is detected
- `src/ui/canvas.js` — Selection model extended with `selectedIds` Set for multi-select; `setSelection(id, type, additive)` toggles items in the set when `additive` is true (shift-click); `getSelectedIds()` exported for consumers; cards pass `e.shiftKey` through `onCardSelected` callback; floating panel shows for single selection, hides for multi-selection with an announcement of count
- `src/ui/card.js` — `filter="url(#card-shadow)"` applied to each card `<g>` element, using the `feDropShadow` filter defined in `index.html` `<defs>` (dx=0, dy=2, stdDeviation=4, flood-opacity=0.12)
- `src/style.css` — `.tab-drop-before` and `.tab-drop-after` classes with inset box-shadow indicators for tab drag-and-drop positioning

---

## What's Left

All spec features and cross-cutting concerns have been implemented.
