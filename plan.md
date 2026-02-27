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
- `groups.js`, `connections.js`, `images.js` — Stubs returning empty arrays; stores exist in the DB but no UI consumes them yet

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

---

## What's Left

### Increment 2 — Groups

- `src/store/groups.js` — Full CRUD (create, get, getByTab, update, delete)
- `src/ui/group.js` — SVG rendering (semi-transparent rect with label), resize handles
- Group interaction: drag to move (moves all member cards), corner resize
- Card-into-group: dragging a card into a group's bounding box sets `placement.group_id`; dragging out clears it
- Floating panel for groups: label input, delete button
- Toolbar "New Group" button
- Rubber-band selection → "Group" action badge
- Undo/redo for group create, move, resize, delete, membership changes

### Increment 3 — Connections

- `src/store/connections.js` — Full CRUD (create, get, getByTab, update, delete)
- `src/ui/connection.js` — SVG `<path>` rendering with quadratic bezier curves per spec formula
- Connection handles: four circular handles on card/group edges on hover
- Draw connection: drag from handle → preview line → release on target creates connection
- Label rendering: pill badge at path midpoint
- Floating panel for connections: label input, 8-color swatch selector, delete button
- Connection palette colors per spec (red, orange, yellow, green, blue, purple, pink, gray)
- Undo/redo for connection create, edit label/color, delete

### Increment 4 — Card Photos

- `src/store/images.js` — Full CRUD with SHA-256 deduplication via `crypto.subtle.digest`
- Photo display on cards: fills card width at ~140px height, cropped to fill
- Drop image onto card to attach
- Floating panel: thumbnail, "Change Photo" button, "Remove Photo" button
- Broken-image placeholder on load failure

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
