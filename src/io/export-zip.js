import JSZip from 'jszip';
import { toCsv } from './csv.js';
import { getCardsByBoard } from '../store/cards.js';
import { getTabsByBoard } from '../store/tabs.js';
import { getPlacementsByTab } from '../store/placements.js';
import { getGroupsByTab } from '../store/groups.js';
import { getConnectionsByTab } from '../store/connections.js';
import { getImage } from '../store/images.js';
import { formatDate, sanitizeFilename, downloadBlob } from '../utils/export-helpers.js';

export async function exportBoardAsZip(board) {
  const zip = new JSZip();

  // Cards
  const cards = await getCardsByBoard(board.id);
  const cardsCsv = toCsv(
    ['id', 'title', 'description', 'image_filename'],
    cards.map(c => ({
      id: c.id,
      title: c.title,
      description: c.description || '',
      image_filename: c.image_filename || '',
    }))
  );
  zip.file('cards.csv', cardsCsv);

  // Tabs
  const tabs = await getTabsByBoard(board.id);
  const tabsCsv = toCsv(
    ['id', 'name', 'order'],
    tabs.map(t => ({ id: t.id, name: t.name, order: t.order }))
  );
  zip.file('tabs.csv', tabsCsv);

  // Collect all placements, groups, connections across tabs
  const allPlacements = [];
  const allGroups = [];
  const allConnections = [];

  for (const tab of tabs) {
    const placements = await getPlacementsByTab(tab.id);
    allPlacements.push(...placements);

    const groups = await getGroupsByTab(tab.id);
    allGroups.push(...groups);

    const connections = await getConnectionsByTab(tab.id);
    allConnections.push(...connections);
  }

  // Placements CSV
  const placementsCsv = toCsv(
    ['id', 'tab_id', 'card_id', 'x', 'y', 'group_id'],
    allPlacements.map(p => ({
      id: p.id,
      tab_id: p.tab_id,
      card_id: p.card_id,
      x: p.x,
      y: p.y,
      group_id: p.group_id || '',
    }))
  );
  zip.file('placements.csv', placementsCsv);

  // Groups CSV
  const groupsCsv = toCsv(
    ['id', 'tab_id', 'label', 'x', 'y', 'width', 'height'],
    allGroups.map(g => ({
      id: g.id,
      tab_id: g.tab_id,
      label: g.label,
      x: g.x,
      y: g.y,
      width: g.width,
      height: g.height,
    }))
  );
  zip.file('groups.csv', groupsCsv);

  // Connections CSV
  const connectionsCsv = toCsv(
    ['tab_id', 'from_type', 'from_id', 'to_type', 'to_id', 'label', 'color'],
    allConnections.map(c => ({
      tab_id: c.tab_id,
      from_type: c.from_type,
      from_id: c.from_id,
      to_type: c.to_type,
      to_id: c.to_id,
      label: c.label || '',
      color: c.color,
    }))
  );
  zip.file('connections.csv', connectionsCsv);

  // Images
  const imageHashes = new Set();
  for (const card of cards) {
    if (card.image_filename) imageHashes.add(card.image_filename);
  }
  for (const hash of imageHashes) {
    const image = await getImage(hash);
    if (image && image.data) {
      const ext = extensionFromType(image.content_type);
      const filename = image.original_filename || (hash.slice(0, 12) + ext);
      zip.file('images/' + filename, image.data);
    }
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const filename = sanitizeFilename(board.name) + '_' + formatDate() + '.zip';
  downloadBlob(blob, filename);
}

function extensionFromType(contentType) {
  const map = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
  };
  return map[contentType] || '.bin';
}

