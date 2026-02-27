import JSZip from 'jszip';
import { parseCsv } from './csv.js';
import { createBoard, getAllBoards } from '../store/board.js';
import { dbPut } from '../store/db.js';
import { saveImage } from '../store/images.js';
import { createId } from '../utils/uuid.js';

const VALID_COLORS = new Set(['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'gray']);
const VALID_ENDPOINT_TYPES = new Set(['card', 'group']);

function formatDate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

class ImportError extends Error {
  constructor(file, row, message) {
    super(message);
    this.file = file;
    this.row = row;
  }
}

function requireHeaders(parsed, requiredHeaders, filename) {
  for (const h of requiredHeaders) {
    if (!parsed.headers.includes(h)) {
      throw new ImportError(filename, 0, `Missing required column "${h}"`);
    }
  }
}

function requireField(row, field, filename, rowIndex) {
  if (row[field] == null || row[field] === '') {
    throw new ImportError(filename, rowIndex + 2, `Missing required field "${field}"`);
  }
}

function requireNumeric(row, field, filename, rowIndex) {
  const val = row[field];
  if (val == null || val === '' || isNaN(Number(val))) {
    throw new ImportError(filename, rowIndex + 2, `Field "${field}" must be numeric, got "${val}"`);
  }
}

export async function importBoardFromZip(file) {
  const zip = await JSZip.loadAsync(file);

  // Read and parse all five CSVs
  const csvFiles = ['cards.csv', 'tabs.csv', 'placements.csv', 'groups.csv', 'connections.csv'];
  const csvData = {};

  for (const name of csvFiles) {
    const entry = zip.file(name);
    if (!entry) {
      throw new ImportError(name, 0, `Required file "${name}" is missing from the ZIP`);
    }
    const text = await entry.async('string');
    csvData[name] = parseCsv(text);
  }

  // Validate headers
  requireHeaders(csvData['cards.csv'], ['id', 'title'], 'cards.csv');
  requireHeaders(csvData['tabs.csv'], ['id', 'name', 'order'], 'tabs.csv');
  requireHeaders(csvData['placements.csv'], ['id', 'tab_id', 'card_id', 'x', 'y'], 'placements.csv');
  requireHeaders(csvData['groups.csv'], ['id', 'tab_id', 'label', 'x', 'y', 'width', 'height'], 'groups.csv');
  requireHeaders(csvData['connections.csv'], ['tab_id', 'from_type', 'from_id', 'to_type', 'to_id', 'color'], 'connections.csv');

  // Build ID sets for cross-reference validation
  const cardIds = new Set();
  const tabIds = new Set();
  const groupIds = new Set();
  const placementIds = new Set();

  // Validate cards
  for (let i = 0; i < csvData['cards.csv'].rows.length; i++) {
    const row = csvData['cards.csv'].rows[i];
    requireField(row, 'id', 'cards.csv', i);
    requireField(row, 'title', 'cards.csv', i);
    cardIds.add(row.id);
  }

  // Validate tabs
  for (let i = 0; i < csvData['tabs.csv'].rows.length; i++) {
    const row = csvData['tabs.csv'].rows[i];
    requireField(row, 'id', 'tabs.csv', i);
    requireField(row, 'name', 'tabs.csv', i);
    requireField(row, 'order', 'tabs.csv', i);
    requireNumeric(row, 'order', 'tabs.csv', i);
    tabIds.add(row.id);
  }

  // Validate groups
  for (let i = 0; i < csvData['groups.csv'].rows.length; i++) {
    const row = csvData['groups.csv'].rows[i];
    requireField(row, 'id', 'groups.csv', i);
    requireField(row, 'tab_id', 'groups.csv', i);
    requireField(row, 'label', 'groups.csv', i);
    requireNumeric(row, 'x', 'groups.csv', i);
    requireNumeric(row, 'y', 'groups.csv', i);
    requireNumeric(row, 'width', 'groups.csv', i);
    requireNumeric(row, 'height', 'groups.csv', i);

    if (!tabIds.has(row.tab_id)) {
      throw new ImportError('groups.csv', i + 2, `tab_id "${row.tab_id}" does not exist in tabs.csv`);
    }
    groupIds.add(row.id);
  }

  // Validate placements
  for (let i = 0; i < csvData['placements.csv'].rows.length; i++) {
    const row = csvData['placements.csv'].rows[i];
    requireField(row, 'id', 'placements.csv', i);
    requireField(row, 'tab_id', 'placements.csv', i);
    requireField(row, 'card_id', 'placements.csv', i);
    requireNumeric(row, 'x', 'placements.csv', i);
    requireNumeric(row, 'y', 'placements.csv', i);

    if (!tabIds.has(row.tab_id)) {
      throw new ImportError('placements.csv', i + 2, `tab_id "${row.tab_id}" does not exist in tabs.csv`);
    }
    if (!cardIds.has(row.card_id)) {
      throw new ImportError('placements.csv', i + 2, `card_id "${row.card_id}" does not exist in cards.csv`);
    }
    if (row.group_id && !groupIds.has(row.group_id)) {
      throw new ImportError('placements.csv', i + 2, `group_id "${row.group_id}" does not exist in groups.csv`);
    }
    placementIds.add(row.id);
  }

  // Validate connections
  for (let i = 0; i < csvData['connections.csv'].rows.length; i++) {
    const row = csvData['connections.csv'].rows[i];
    requireField(row, 'tab_id', 'connections.csv', i);
    requireField(row, 'from_type', 'connections.csv', i);
    requireField(row, 'from_id', 'connections.csv', i);
    requireField(row, 'to_type', 'connections.csv', i);
    requireField(row, 'to_id', 'connections.csv', i);
    requireField(row, 'color', 'connections.csv', i);

    if (!tabIds.has(row.tab_id)) {
      throw new ImportError('connections.csv', i + 2, `tab_id "${row.tab_id}" does not exist in tabs.csv`);
    }

    if (!VALID_ENDPOINT_TYPES.has(row.from_type)) {
      throw new ImportError('connections.csv', i + 2, `from_type must be "card" or "group", got "${row.from_type}"`);
    }
    if (!VALID_ENDPOINT_TYPES.has(row.to_type)) {
      throw new ImportError('connections.csv', i + 2, `to_type must be "card" or "group", got "${row.to_type}"`);
    }

    // Validate from_id matches from_type
    if (row.from_type === 'card' && !placementIds.has(row.from_id)) {
      throw new ImportError('connections.csv', i + 2, `from_id "${row.from_id}" does not exist in placements.csv (from_type is "card")`);
    }
    if (row.from_type === 'group' && !groupIds.has(row.from_id)) {
      throw new ImportError('connections.csv', i + 2, `from_id "${row.from_id}" does not exist in groups.csv (from_type is "group")`);
    }
    if (row.to_type === 'card' && !placementIds.has(row.to_id)) {
      throw new ImportError('connections.csv', i + 2, `to_id "${row.to_id}" does not exist in placements.csv (to_type is "card")`);
    }
    if (row.to_type === 'group' && !groupIds.has(row.to_id)) {
      throw new ImportError('connections.csv', i + 2, `to_id "${row.to_id}" does not exist in groups.csv (to_type is "group")`);
    }

    // Self-connection check
    if (row.from_type === row.to_type && row.from_id === row.to_id) {
      throw new ImportError('connections.csv', i + 2, 'Connection cannot have the same source and target');
    }

    if (!VALID_COLORS.has(row.color)) {
      throw new ImportError('connections.csv', i + 2, `Invalid color "${row.color}". Must be one of: ${[...VALID_COLORS].join(', ')}`);
    }
  }

  // Validate image references
  for (let i = 0; i < csvData['cards.csv'].rows.length; i++) {
    const row = csvData['cards.csv'].rows[i];
    if (row.image_filename && row.image_filename !== '') {
      const imagePath = 'images/' + row.image_filename;
      if (!zip.file(imagePath)) {
        throw new ImportError('cards.csv', i + 2, `image_filename "${row.image_filename}" not found in images/ folder`);
      }
    }
  }

  // All validation passed — now import

  // Determine board name (handle duplicates)
  const existingBoards = await getAllBoards();
  const existingNames = new Set(existingBoards.map(b => b.name));
  let boardName = file.name.replace(/\.zip$/i, '').replace(/_\d{4}-\d{2}-\d{2}$/, '') || 'Imported Board';
  if (existingNames.has(boardName)) {
    boardName = `${boardName} (imported ${formatDate()})`;
  }

  // Create new board
  const board = await createBoard(boardName);

  // Build ID remap tables
  const cardIdMap = new Map();
  const tabIdMap = new Map();
  const groupIdMap = new Map();
  const placementIdMap = new Map();

  // Import cards
  const imageFilenameToHash = new Map();
  for (const row of csvData['cards.csv'].rows) {
    const newId = createId();
    cardIdMap.set(row.id, newId);

    // Import image if present
    let imageHash = null;
    if (row.image_filename && row.image_filename !== '') {
      if (!imageFilenameToHash.has(row.image_filename)) {
        const imageEntry = zip.file('images/' + row.image_filename);
        const blob = await imageEntry.async('blob');
        // Set the correct content type based on extension
        const ext = row.image_filename.split('.').pop().toLowerCase();
        const typeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
        const contentType = typeMap[ext] || 'application/octet-stream';
        const typedBlob = new Blob([blob], { type: contentType });
        const hash = await saveImage(typedBlob, row.image_filename);
        imageFilenameToHash.set(row.image_filename, hash);
      }
      imageHash = imageFilenameToHash.get(row.image_filename);
    }

    await dbPut('cards', {
      id: newId,
      board_id: board.id,
      title: row.title,
      description: row.description || null,
      image_filename: imageHash,
    });
  }

  // Import tabs
  for (const row of csvData['tabs.csv'].rows) {
    const newId = createId();
    tabIdMap.set(row.id, newId);
    await dbPut('tabs', {
      id: newId,
      board_id: board.id,
      name: row.name,
      order: Number(row.order),
      viewport_x: 0,
      viewport_y: 0,
      viewport_zoom: 1.0,
    });
  }

  // Import groups
  for (const row of csvData['groups.csv'].rows) {
    const newId = createId();
    groupIdMap.set(row.id, newId);
    await dbPut('groups', {
      id: newId,
      tab_id: tabIdMap.get(row.tab_id),
      label: row.label,
      x: Number(row.x),
      y: Number(row.y),
      width: Number(row.width),
      height: Number(row.height),
    });
  }

  // Import placements
  for (const row of csvData['placements.csv'].rows) {
    const newId = createId();
    placementIdMap.set(row.id, newId);
    await dbPut('placements', {
      id: newId,
      tab_id: tabIdMap.get(row.tab_id),
      card_id: cardIdMap.get(row.card_id),
      x: Number(row.x),
      y: Number(row.y),
      group_id: row.group_id ? groupIdMap.get(row.group_id) : null,
    });
  }

  // Import connections
  for (const row of csvData['connections.csv'].rows) {
    const newId = createId();
    const fromId = row.from_type === 'card' ? placementIdMap.get(row.from_id) : groupIdMap.get(row.from_id);
    const toId = row.to_type === 'card' ? placementIdMap.get(row.to_id) : groupIdMap.get(row.to_id);
    await dbPut('connections', {
      id: newId,
      tab_id: tabIdMap.get(row.tab_id),
      from_type: row.from_type,
      from_id: fromId,
      to_type: row.to_type,
      to_id: toId,
      label: row.label || null,
      color: row.color,
    });
  }

  return board;
}
