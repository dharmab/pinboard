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

---

## What's Left

### Increment 5 — Context Menus & Card Library

- `src/ui/context-menu.js` — Right-click menus for cards, groups, connections per spec
- Card context menu: Edit, Remove from tab, Delete everywhere (with confirmation)
- Group context menu: Rename, Delete group
- Connection context menu: Edit, Delete connection
- `src/ui/card-library.js` — Full-screen overlay listing all cards in board
- Drag card from library onto canvas to create placement
- Delete card globally from library (confirmation required)
- Board switcher in toolbar (create, rename, duplicate, delete, switch boards)

### Increment 6 — Import/Export

- `src/io/export-zip.js` — Serialize all stores to CSV, collect images, assemble ZIP (JSZip)
- `src/io/import-zip.js` — Parse and validate CSV, remap IDs, import images, create new board (Papa Parse)
- `src/io/export-png.js` — Bounding box render to offscreen canvas at 2x (light-mode colors), download PNG
- `src/io/export-pdf.js` — Offscreen render embedded in PDF via jsPDF, A4/Letter choice
- `src/io/csv.js` — CSV serialization/deserialization helpers
- Export menu in toolbar
- Validation rules per spec section 11.7
- Error handling: modal dialogs with row-level error messages

### Cross-Cutting Concerns (Address Alongside Each Increment)

- Storage quota error handling: abort write, show "Storage full" message
- Tab reorder by dragging (spec mentions it, not yet implemented)
- Pinch-to-zoom on touch (spec section 3.3)
- Shift-click multi-select
- Card drop shadow (filter is defined in SVG defs but not yet applied to card rects; cards use CSS `border` instead of SVG rect + filter since they use `foreignObject`)
