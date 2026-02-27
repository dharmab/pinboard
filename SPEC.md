# Pinboard — Technical Specification

**Version:** 1.3
**Date:** 2026-02-26
**Status:** Draft

---

## Table of Contents

1. [Overview & Goals](#1-overview--goals)
2. [Core Concepts & Data Model](#2-core-concepts--data-model)
3. [UI/UX Design](#3-uiux-design)
4. [Cards](#4-cards)
5. [Groups](#5-groups)
6. [Connections](#6-connections)
7. [Import / Export](#7-import--export)
8. [Technical Stack](#8-technical-stack)
9. [Persistence](#9-persistence)
10. [Accessibility](#10-accessibility)
11. [File Format Details](#11-file-format-details)
12. [Error Handling](#12-error-handling)
13. [Out of Scope](#13-out-of-scope)

---

## 1. Overview & Goals

### 1.1 What Is Pinboard?

Pinboard is a browser-based, single-page application for building visual relationship boards. Users place cards on a freeform canvas, optionally group related cards into labeled containers, and draw labeled lines between cards or groups to represent relationships.

A board can have multiple named tabs, each showing its own layout, groupings, and connections. The same card can appear on multiple tabs, making it easy to explore the same set of people or things from different angles.

The application runs entirely in the browser. All data is stored locally. Boards can be exported as ZIP archives or rendered as PNG or PDF images.

### 1.2 Target User

The application is designed for a single primary user: an intelligent, computer-literate adult comfortable with productivity software (particularly Excel) but not a software developer. The UI must be entirely mouse-driven and self-explanatory without requiring a manual.

### 1.3 Key Design Principles

**Mouse-driven.** All actions are accessible with the mouse alone. No workflow requires keyboard shortcuts. The interaction model uses context-sensitive affordances — the right actions appear when you hover over or select an item — rather than explicit tool switching.

**Clean, modern UI.** Neutral canvas background, white cards with drop shadows in light mode. Full dark mode support. Bold connection lines that are legible against both backgrounds.

**No persistent sidebar.** The canvas fills the window. Item editing is done through a compact floating properties panel that appears near the selected item.

**Zero friction.** No sign-up, login, or cloud sync. Open the page and start working.

**Offline-first.** Fully functional without an internet connection after initial load.

**Lossless portability.** A board exported as a ZIP can be fully reconstructed on any device.

---

## 2. Core Concepts & Data Model

### 2.1 Board

A Board is the top-level container with a name and a set of tabs. A board contains a global pool of cards that can be placed on any of its tabs.

**Board fields:**

| Field | Type | Description |
|---|---|---|
| `id` | string (UUID v4) | Unique identifier |
| `name` | string | Human-readable name, max 128 characters |

### 2.2 Card

A Card is a global entity at the board level. It carries content only; position is determined per-tab via Placements.

**Card fields:**

| Field | Type | Description |
|---|---|---|
| `id` | string (UUID v4) | Unique identifier within the board |
| `board_id` | string (UUID v4) | Parent board |
| `title` | string | Primary label, max 80 characters. Required. |
| `description` | string or null | Extended notes, max 2000 characters |
| `image_filename` | string or null | Filename of an associated image; null if no photo |

### 2.3 Tab

A Tab is a named view within a board with its own layout of cards, groups, and connections.

**Tab fields:**

| Field | Type | Description |
|---|---|---|
| `id` | string (UUID v4) | Unique identifier within the board |
| `board_id` | string (UUID v4) | Parent board |
| `name` | string | Tab label, max 60 characters |
| `order` | integer | Display order, zero-indexed |
| `viewport_x` | number | Last saved pan offset X |
| `viewport_y` | number | Last saved pan offset Y |
| `viewport_zoom` | number | Last saved zoom level, range 0.1 to 4.0, default 1.0 |

### 2.4 Placement

A Placement records the position of a Card on a specific Tab.

**Placement fields:**

| Field | Type | Description |
|---|---|---|
| `id` | string (UUID v4) | Unique identifier |
| `tab_id` | string (UUID v4) | Parent tab |
| `card_id` | string (UUID v4) | The card being placed |
| `x` | number | X coordinate of the card's top-left corner |
| `y` | number | Y coordinate of the card's top-left corner |
| `group_id` | string (UUID v4) or null | Group this placement belongs to on this tab, if any |

### 2.5 Group

A Group is a labeled rectangular container on a specific Tab. It clusters related cards and can be used as a connection endpoint.

**Group fields:**

| Field | Type | Description |
|---|---|---|
| `id` | string (UUID v4) | Unique identifier |
| `tab_id` | string (UUID v4) | Parent tab |
| `label` | string | Display name, max 60 characters |
| `x` | number | X coordinate of the group's top-left corner |
| `y` | number | Y coordinate of the group's top-left corner |
| `width` | number | Width in board pixels |
| `height` | number | Height in board pixels |

### 2.6 Connection

A Connection is a labeled line between two endpoints on a specific Tab. An endpoint is either a Card placement or a Group.

**Connection fields:**

| Field | Type | Description |
|---|---|---|
| `id` | string (UUID v4) | Unique identifier |
| `tab_id` | string (UUID v4) | Parent tab |
| `from_type` | enum | `card` or `group` |
| `from_id` | string (UUID v4) | Placement ID (if `card`) or Group ID (if `group`) |
| `to_type` | enum | `card` or `group` |
| `to_id` | string (UUID v4) | Placement ID (if `card`) or Group ID (if `group`) |
| `label` | string or null | Optional text at the midpoint, max 60 characters |
| `color` | string (enum) | One of the eight palette color keys (see Section 6.2) |

### 2.7 Board State Summary

- One Board record
- Zero or more Card records (global pool)
- Zero or more Tab records
- Zero or more Placement records (card position per tab)
- Zero or more Group records (per tab)
- Zero or more Connection records (per tab)
- Zero or more image blobs referenced by cards

---

## 3. UI/UX Design

### 3.1 Application Layout

```
+----------------------------------------------------------+
|  TOOLBAR (~48px)                                         |
+----------------------------------------------------------+
|  [Tab 1]  [Tab 2]  [Tab 3]  [+]                         |
+----------------------------------------------------------+
|                                                          |
|   CANVAS (fills all remaining space)                     |
|                                                          |
|   [Cards, groups, and connections on the active tab]     |
|                                                          |
+----------------------------------------------------------+
```

There is no persistent sidebar. The canvas fills the available space below the tab bar.

**Toolbar** contains: application name/logo, board name (editable inline), board switcher button, undo button, redo button, "Add Card" button, "New Group" button, zoom controls (zoom-out, zoom %, zoom-in, fit-all), dark mode toggle, and export menu.

**Tab bar** sits below the toolbar. Tab names are clickable to switch. A "+" button creates a new tab. Tabs can be reordered by dragging. Double-clicking a tab name makes it editable. Right-clicking a tab shows "Rename" and "Delete Tab."

**Canvas** shows the active tab's layout. Switching tabs swaps the content and restores the saved viewport for that tab.

### 3.2 Canvas Layers (SVG)

- **Background layer:** Solid fill (`#f1f5f9` light / `#1e1e2e` dark).
- **Group layer:** Group containers, rendered below connections and cards.
- **Connection layer:** SVG `<path>` elements.
- **Card layer:** Card elements.
- **Interaction layer:** Invisible pointer-event capture overlay.

### 3.3 Pan and Zoom

**Pan:** Click and drag on empty canvas space.

**Zoom:** Mouse scroll wheel zooms centered on the cursor. Pinch-to-zoom on touch. Range: 0.1 to 4.0.

**Zoom controls:** Zoom-out button, zoom % display (click to reset to 100%), zoom-in button, "Fit All" button in the toolbar.

### 3.4 Interaction Model

The application has no persistent tool modes. The cursor is always in "select/move" mode. All other actions are triggered contextually based on what the user hovers over or has selected.

| Gesture | Context | Action |
|---|---|---|
| Double-click on empty canvas | — | Create a new card at that position |
| Click on card, group, or connection | — | Select it; open floating properties panel |
| Click on empty canvas | — | Deselect all; close floating panel |
| Drag a selected card or group | — | Move it |
| Rubber-band drag on empty canvas | — | Select all cards and groups within the rectangle |
| Hover over a card or group | — | Show connection handles on the edges |
| Drag from a connection handle | On card or group | Begin drawing a connection; preview line follows cursor |
| Release drag on a card or group | While drawing connection | Create a connection between source and target |
| Release drag on empty canvas | While drawing connection | Cancel the connection |
| Right-click on card | — | Context menu (see Section 3.8) |
| Right-click on group | — | Context menu (see Section 3.8) |
| Right-click on connection | — | Context menu (see Section 3.8) |
| Drag corner handle of group | Group selected | Resize the group |
| Drag card into group bounding box | Card not already in a group | Add card to group |
| Drag card out of group bounding box | Card in a group | Remove card from group |
| Click "Add Card" in toolbar | — | Create a card at the center of the current viewport |
| Click "New Group" in toolbar | — | Create an empty group at the center of the viewport |

### 3.5 Connection Handles

When the cursor hovers over a card or group, four circular handles appear at the midpoints of the top, bottom, left, and right edges. Dragging from any handle begins a connection. While dragging, a curved preview line follows the cursor. When the cursor enters a valid target card or group, its edge handles highlight. Releasing over a target creates the connection. Releasing anywhere else cancels.

Handles are not shown on items that are already selected and being dragged (to prevent accidental connection creation during moves).

### 3.6 Floating Properties Panel

When an item is selected, a compact floating panel appears near it (offset so it does not cover the item, snapping inward if it would go off-screen). The panel stays open until the user clicks elsewhere on the canvas.

**Card panel:**
- Title — text input, editable directly. Changes apply on blur.
- Description — textarea, auto-expanding up to ~8 lines before scrolling. Changes apply on blur.
- Photo — thumbnail (if present), "Change Photo" button, "Remove Photo" button.
- Trash icon button — "Remove from this tab."

**Group panel:**
- Label — text input.
- Trash icon button — "Delete group."

**Connection panel:**
- Label — text input.
- Color swatches — eight swatches in a row; click to change.
- Trash icon button — "Delete connection."

The floating panel has no close button; clicking elsewhere on the canvas dismisses it.

### 3.7 Inline Title Editing

Double-clicking a card's title area on the canvas replaces the title text with an inline text input. Clicking outside or pressing Enter commits the edit. The floating panel does not need to be open for this.

### 3.8 Context Menus

Right-clicking an item shows a context menu with mouse-accessible actions.

**Card context menu:**
- Edit (opens floating panel if not already open)
- Remove from this tab
- Delete card everywhere (with confirmation dialog)

**Group context menu:**
- Rename (focuses label in floating panel)
- Delete group (members remain on tab, ungrouped)

**Connection context menu:**
- Edit (opens floating panel)
- Delete connection

### 3.9 Grouping Selected Cards

After selecting multiple cards by rubber-band or Shift-click, a small inline action badge appears near the selection with a "Group" button. Clicking it creates a new group sized to fit the selection and assigns all selected cards to it.

### 3.10 Card Library

"Board Switcher" area in the toolbar also gives access to a "Cards" panel (a separate screen, not a persistent sidebar) listing all cards in the board. This panel allows the user to:
- See all cards across all tabs.
- Drag a card from the panel onto the canvas of the current tab (creates a placement if one does not already exist).
- Delete a card globally (removes all placements and connections; confirmation required).

The Card Library panel is a full-screen overlay that closes when the user clicks outside it or uses the close button.

### 3.11 Dark Mode

The application supports both light and dark color schemes.

**Automatic:** The app defaults to the OS color scheme (`prefers-color-scheme` media query).

**Manual toggle:** A sun/moon icon button in the toolbar overrides the OS preference for the current session. The preference is persisted in `localStorage`.

**Color tokens (CSS custom properties):**

| Token | Light | Dark |
|---|---|---|
| `--canvas-bg` | `#f1f5f9` | `#1e1e2e` |
| `--card-bg` | `#ffffff` | `#2a2a3e` |
| `--card-border` | `#e2e8f0` | `#3a3a5c` |
| `--card-title-color` | `#0f172a` | `#e2e8f0` |
| `--card-description-color` | `#475569` | `#94a3b8` |
| `--group-fill` | `rgba(148,163,184,0.12)` | `rgba(100,116,139,0.18)` |
| `--group-border` | `#94a3b8` | `#4a5568` |
| `--panel-bg` | `#ffffff` | `#2a2a3e` |
| `--panel-border` | `#e2e8f0` | `#3a3a5c` |
| `--toolbar-bg` | `#ffffff` | `#16162a` |
| `--toolbar-border` | `#e2e8f0` | `#2a2a4a` |
| `--text-primary` | `#0f172a` | `#e2e8f0` |
| `--text-secondary` | `#64748b` | `#94a3b8` |

Connection palette colors (Section 6.2) are used as-is in both modes — they are bold enough to read against both backgrounds.

---

## 4. Cards

### 4.1 Visual Layout

White (light) or dark (dark mode) rounded rectangle, fixed width of 220 board pixels, height grows to fit content:

1. **Photo** (if present): fills full card width at ~140px height, cropped to fill. A small icon appears on hover in the photo area to allow replacing the image.
2. **Title:** bold, 14–16px.
3. **Description** (if present): smaller secondary-color text. On the card, the description is truncated to 3 lines with a "..." indicator if longer. The full description is readable in the floating panel.

### 4.2 Photo

Attached by dropping an image file onto an existing card, or via "Change Photo" in the floating panel. Supported formats: JPEG, PNG, GIF (first frame only), WebP. Stored in IndexedDB keyed by SHA-256 hash (deduplication). Replaceable or removable via the floating panel.

### 4.3 Title

Required. Max 80 characters. Always visible. Editable inline (double-click) or via the floating panel.

### 4.4 Description

Optional. Max 2000 characters. Plain text. Shown truncated on the card (3 lines max); full text visible and editable in the floating panel textarea.

---

## 5. Groups

### 5.1 Purpose

Groups visually cluster related cards on a tab. They also serve as single connection endpoints so a relationship can be drawn to an entire cluster.

### 5.2 Visual Design

A lightly filled rectangle with a 2px border (color from `--group-border` token) and a bold label inside the top-left corner. The fill is semi-transparent so the canvas background shows through.

### 5.3 Membership

A card's placement has an optional `group_id`. On any given tab, a card can belong to at most one group. The same card can be in different groups on different tabs. Groups do not nest.

### 5.4 Movement

Dragging a group moves the group container and all member cards together. Resizing a group (corner handles) does not move member cards. If a member card is dragged outside the group bounding box, it is automatically removed from the group.

### 5.5 Groups as Connection Endpoints

When the cursor hovers over a group (but not over a card inside the group), the group's edge handles are shown. A connection can be drawn to or from the group, anchoring to the nearest point on the group's bounding box border.

### 5.6 Deletion

Deleting a group removes the container and its connections. Member cards are not deleted; their `group_id` is cleared and they remain on the tab.

---

## 6. Connections

### 6.1 Path Calculation

All connections are quadratic bezier curves. For a connection from endpoint A (center `ax`, `ay`) to endpoint B (center `bx`, `by`):

```
midX = (ax + bx) / 2
midY = (ay + by) / 2
dx = bx - ax
dy = by - ay
cx = midX + (-dy * CURVE_FACTOR)
cy = midY + (dx * CURVE_FACTOR)
```

`CURVE_FACTOR` is a named constant, default `0.25`. Lines anchor to the nearest point on the source/target bounding box border.

### 6.2 Color Palette

Eight fixed bold colors. Chosen from swatches in the floating panel. No custom color picker.

| Key | Color | Hex |
|---|---|---|
| `red` | Red | `#e11d48` |
| `orange` | Orange | `#ea580c` |
| `yellow` | Yellow | `#ca8a04` |
| `green` | Green | `#16a34a` |
| `blue` | Blue | `#2563eb` |
| `purple` | Purple | `#7c3aed` |
| `pink` | Pink | `#db2777` |
| `gray` | Gray | `#4b5563` |

Default for new connections: `red`.

### 6.3 Labels

Optional. Max 60 characters. Set via floating panel. Displayed as a pill badge at the midpoint: white (or dark-mode) background at 90% opacity, 1.5px border in the connection color.

### 6.4 Rules

- Self-connections (same source and target) are not permitted.
- Multiple connections between the same pair of endpoints are permitted.

---

## 7. Import / Export

### 7.1 Export as ZIP

"Export > Download ZIP" from the toolbar:

1. Serialize Cards → `cards.csv`
2. Serialize Tabs → `tabs.csv`
3. Serialize Placements → `placements.csv`
4. Serialize Groups → `groups.csv`
5. Serialize Connections → `connections.csv`
6. Collect image blobs from IndexedDB
7. Assemble ZIP and download

Filename: `{board_name}_{YYYY-MM-DD}.zip`.

### 7.2 Import from ZIP

"Export > Import from ZIP" opens a file picker. On selection:

1. Read and validate all five CSV files.
2. Extract images into IndexedDB.
3. Create a new Board with a new UUID; assign all records to it.
4. Switch to the new board, opening its first tab.

**ID remapping:** CSV `id` values are local keys only; new UUIDs are assigned on import.

**Duplicate name handling:** Imported board named `{name} (imported {YYYY-MM-DD})` if a conflict exists.

Failure: descriptive error message; existing board unchanged.

### 7.3 Export as PNG

"Export > Download PNG":

1. Bounding box of all cards and groups on the active tab + 40px padding.
2. Render to offscreen canvas at 2x scale (configurable 1x–4x via Export Options dialog).
3. Download as `{board_name}_{tab_name}_{YYYY-MM-DD}.png`.

The render uses the **light mode** colors regardless of the user's current color scheme, for consistent output.

### 7.4 Export as PDF

"Export > Download PDF":

1. Same offscreen render as PNG.
2. jsPDF embeds it in A4 or US Letter (user's choice in Export Options).
3. Download as `{board_name}_{tab_name}_{YYYY-MM-DD}.pdf`.

---

## 8. Technical Stack

### 8.1 Recommended Stack

| Layer | Technology | Rationale |
|---|---|---|
| Framework | Vanilla JavaScript (ES2022+) or Preact | Simple, no large runtime dependency |
| Build tool | Vite | Fast bundler; required for Vercel deployment |
| Board rendering | Inline SVG | Scales perfectly; DOM events simpler than Canvas 2D hit testing |
| Styling | CSS custom properties + single CSS file | Dark mode via token overrides |
| ZIP | JSZip (v3.x) | Mature, browser-compatible |
| PDF | jsPDF (v2.x) | No native dependency |
| PNG | Native Canvas 2D API | No library needed |
| IDs | `crypto.randomUUID()` | Built into all modern browsers |
| CSV | Papa Parse (v5.x) | Handles edge cases correctly |
| Image hashing | `crypto.subtle.digest` (SHA-256) | Built-in |
| Persistence | IndexedDB via idb (v8.x) | Thin Promise wrapper |

### 8.2 Deployment

The application is deployed to Vercel's Hobby tier as a static site. Vercel provides:
- Automatic HTTPS on every deployment (required for `crypto.subtle.digest`, which does not work over plain HTTP).
- Automatic deploys on push to the main branch.
- A free custom domain (or the default `.vercel.app` subdomain).

Because Vercel runs a build step automatically, use **Vite** as the bundler. Vite bundles all JavaScript and vendored libraries into output files under `dist/`, which Vercel serves as the static root. This is simpler and more reliable than managing CDN import maps.

`vercel.json` configuration (if needed) is minimal — just set the output directory to `dist` and let Vite handle the rest. No server-side functions are used.

### 8.3 Browser Compatibility

Latest two major versions of Chrome, Firefox, Safari, and Edge.

### 8.4 Module Structure

```
/index.html
/app.js
/store/
  board.js
  cards.js
  tabs.js
  placements.js
  groups.js
  connections.js
  images.js
/ui/
  canvas.js          — SVG canvas, viewport, interaction layer
  toolbar.js
  tabbar.js
  floating-panel.js  — Floating properties panel
  context-menu.js    — Right-click context menus
  card-library.js    — Card library overlay
  card.js
  group.js
  connection.js
  theme.js           — Dark/light mode toggling
/io/
  export-zip.js
  import-zip.js
  export-png.js
  export-pdf.js
  csv.js
/utils/
  geometry.js
  history.js
  uuid.js
```

---

## 9. Persistence

### 9.1 Storage

**IndexedDB database name:** `pinboard_v1`

| Store | Key | Value |
|---|---|---|
| `boards` | `id` | Board record |
| `cards` | `id` | Card record |
| `tabs` | `id` | Tab record |
| `placements` | `id` | Placement record |
| `groups` | `id` | Group record |
| `connections` | `id` | Connection record |
| `images` | `hash` | `{ hash, data: Blob, content_type, original_filename }` |

**Indexes:** `cards` on `board_id`; `tabs` on `board_id`; `placements` on `tab_id` and `card_id`; `groups` on `tab_id`; `connections` on `tab_id`, `from_id`, `to_id`.

**Theme preference:** Stored in `localStorage` (`pinboard_theme`: `light`, `dark`, or `system`).

### 9.2 Autosave

Every write operation immediately persists to IndexedDB. No save button.

### 9.3 Undo / Redo

In-memory only; cleared on page reload. Max depth: 100 operations.

**Undoable:** Adding, moving, or deleting a card placement; editing a card's title, description, or photo; adding, resizing, moving, or deleting a group; adding or deleting a connection; editing a connection's label or color; adding or deleting a tab.

**Not undoable:** Renaming a board or tab; importing a board; deleting a card globally.

### 9.4 Board Management

Toolbar board switcher opens a board list. From there: create, rename, duplicate, delete, or switch boards.

### 9.5 Storage Limits

If a write fails due to quota, the operation is aborted and the user sees: "Storage full. Export your board and clear browser data to free space."

---

## 10. Accessibility

### 10.1 Mouse-First Design

All primary actions are accessible with the mouse. No action requires keyboard input. The Tab key and keyboard navigation are available as supplementary convenience but are not required.

### 10.2 ARIA Labels

All toolbar and tab bar buttons have `aria-label` attributes. The canvas SVG has `role="application"` and `aria-label="Pinboard canvas"`. The floating panel is implemented as an ARIA dialog (`role="dialog"`). Selection changes are announced via a visually-hidden ARIA live region.

### 10.3 Color Contrast

UI chrome text meets WCAG AA requirements (4.5:1 normal text, 3:1 large text) in both light and dark modes. The canvas is a creative surface and is not held to the same standard; however, the card title and description colors are chosen to maintain readable contrast against the card background in both modes.

### 10.4 Reduced Motion

`prefers-reduced-motion: reduce` disables all transitions and animations.

---

## 11. File Format Details

All CSV files use UTF-8 with BOM and CRLF line endings. Fields containing commas, newlines, or double-quotes are double-quoted; internal double-quotes are escaped as `""`.

### 11.1 Cards CSV (`cards.csv`)

| Column | Required | Notes |
|---|---|---|
| `id` | Yes | Local reference key; new UUIDs on import |
| `title` | Yes | |
| `description` | No | Empty string if absent |
| `image_filename` | No | Filename within `images/`; empty if no photo |

```csv
id,title,description,image_filename
card-001,Jane Smith,Lead detective on the case,jane_smith.jpg
card-002,Marcus Webb,Known associate; alibi unverified,marcus_webb.jpg
card-003,The Warehouse,,
card-004,Key Documents,,documents.jpg
```

### 11.2 Tabs CSV (`tabs.csv`)

| Column | Required | Notes |
|---|---|---|
| `id` | Yes | Local reference key |
| `name` | Yes | |
| `order` | Yes | Zero-indexed display order |

```csv
id,name,order
tab-001,Characters,0
tab-002,Locations,1
```

### 11.3 Placements CSV (`placements.csv`)

| Column | Required | Notes |
|---|---|---|
| `id` | Yes | Local reference key |
| `tab_id` | Yes | Matches `tabs.csv` id |
| `card_id` | Yes | Matches `cards.csv` id |
| `x` | Yes | |
| `y` | Yes | |
| `group_id` | No | Matches `groups.csv` id; empty if not grouped |

```csv
id,tab_id,card_id,x,y,group_id
pl-001,tab-001,card-001,320,240,
pl-002,tab-001,card-002,580,310,grp-001
pl-003,tab-001,card-003,200,480,grp-001
pl-004,tab-002,card-001,100,200,
```

### 11.4 Groups CSV (`groups.csv`)

| Column | Required | Notes |
|---|---|---|
| `id` | Yes | Local reference key |
| `tab_id` | Yes | Matches `tabs.csv` id |
| `label` | Yes | |
| `x` | Yes | |
| `y` | Yes | |
| `width` | Yes | |
| `height` | Yes | |

```csv
id,tab_id,label,x,y,width,height
grp-001,tab-001,Suspects,150,260,520,300
```

### 11.5 Connections CSV (`connections.csv`)

| Column | Required | Notes |
|---|---|---|
| `tab_id` | Yes | Matches `tabs.csv` id |
| `from_type` | Yes | `card` or `group` |
| `from_id` | Yes | Placement id (if `card`) or group id (if `group`) |
| `to_type` | Yes | `card` or `group` |
| `to_id` | Yes | Placement id (if `card`) or group id (if `group`) |
| `label` | No | Empty string if absent |
| `color` | Yes | One of the eight palette keys |

```csv
tab_id,from_type,from_id,to_type,to_id,label,color
tab-001,card,pl-001,card,pl-002,Interviewed,blue
tab-001,card,pl-001,group,grp-001,Investigating,red
tab-001,card,pl-002,card,pl-003,Seen together,red
tab-002,card,pl-004,card,pl-005,Visited,green
```

### 11.6 ZIP Structure

```
{board_name}_{YYYY-MM-DD}.zip
├── cards.csv
├── tabs.csv
├── placements.csv
├── groups.csv
├── connections.csv
└── images/
    ├── jane_smith.jpg
    └── documents.jpg
```

All five CSV files must be present (empty tables still require a header row). Every `image_filename` must exist in `images/`. Extra files are silently ignored.

### 11.7 Import Validation Rules

Rejected if:

1. Any of the five CSV files is missing.
2. A required column header is missing from any CSV.
3. A referenced `id` does not exist in the file that defines it (cross-file references).
4. A connection `from_id`/`to_id` does not match the declared `from_type`/`to_type`.
5. A connection has the same source and target.
6. A `from_type` or `to_type` is not `card` or `group`.
7. A `color` is not one of the eight palette keys.
8. An `image_filename` references a file not in `images/`.
9. A numeric field contains a non-numeric value.

On failure: modal dialog with offending file, row number, and plain-English description.

---

## 12. Error Handling

### 12.1 Import Errors

Non-destructive. Failed imports are rolled back; existing board unchanged.

### 12.2 Image Load Errors

If an image cannot be loaded, the card renders a broken-image placeholder. Card remains functional.

### 12.3 Storage Quota Errors

Write is aborted. User sees: "Storage full. Export your board and clear browser data to free space."

### 12.4 Export Errors

Download not triggered. User sees a plain-English error message.

---

## 13. Out of Scope

Excluded from version 1.0:

- **Real-time collaboration.**
- **Cloud sync or accounts.**
- **Persistent undo history** across sessions.
- **Rich text** in descriptions (plain text only).
- **Card colors or themes** (all cards are white/dark).
- **Card rotation.**
- **Custom connection colors** (palette only).
- **Nested groups.**
- **Mobile touch-first editing** (pan/zoom work; drawing connections on mobile is not a design target).
- **Direct browser printing** (use PDF export).
- **Import from other formats** (Miro, draw.io, etc.).
- **Shared board links.**

---

*End of Pinboard Technical Specification v1.3*
