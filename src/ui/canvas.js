import { clientToCanvas, clampZoom, boundingBox, fitToView } from '../utils/geometry.js';

const ZOOM_STEP = 1.1;

let svg, viewportG;
let viewport = { x: 0, y: 0, zoom: 1.0 };
let isPanning = false;
let panStart = { x: 0, y: 0 };
let panOrigin = { x: 0, y: 0 };
let selectedId = null;
let callbacks = {};

export function initCanvas(cbs) {
  callbacks = cbs;
  svg = document.getElementById('canvas');
  viewportG = document.getElementById('viewport-transform');

  svg.addEventListener('pointerdown', onPointerDown);
  svg.addEventListener('pointermove', onPointerMove);
  svg.addEventListener('pointerup', onPointerUp);
  svg.addEventListener('wheel', onWheel, { passive: false });
  svg.addEventListener('dblclick', onDblClick);

  applyTransform();
}

function applyTransform() {
  viewportG.setAttribute('transform', `translate(${viewport.x}, ${viewport.y}) scale(${viewport.zoom})`);
}

function onPointerDown(e) {
  // Only handle events directly on the SVG or the background rect
  if (e.target !== svg && e.target.id !== 'canvas-bg') return;

  isPanning = true;
  panStart = { x: e.clientX, y: e.clientY };
  panOrigin = { x: viewport.x, y: viewport.y };
  svg.setPointerCapture(e.pointerId);
  svg.style.cursor = 'grabbing';
}

function onPointerMove(e) {
  if (!isPanning) return;

  const dx = e.clientX - panStart.x;
  const dy = e.clientY - panStart.y;
  viewport.x = panOrigin.x + dx;
  viewport.y = panOrigin.y + dy;
  applyTransform();
}

function onPointerUp(e) {
  if (isPanning) {
    const dx = Math.abs(e.clientX - panStart.x);
    const dy = Math.abs(e.clientY - panStart.y);
    const moved = dx > 3 || dy > 3;

    isPanning = false;
    svg.releasePointerCapture(e.pointerId);
    svg.style.cursor = '';

    if (!moved && (e.target === svg || e.target.id === 'canvas-bg')) {
      // Click on empty canvas — deselect
      setSelection(null);
      callbacks.onDeselect?.();
    }
  }
}

function onWheel(e) {
  e.preventDefault();

  const rect = svg.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  // Canvas point under cursor before zoom
  const canvasX = (mouseX - viewport.x) / viewport.zoom;
  const canvasY = (mouseY - viewport.y) / viewport.zoom;

  const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
  const newZoom = clampZoom(viewport.zoom * factor);

  // Adjust pan so the canvas point under cursor stays fixed
  viewport.x = mouseX - canvasX * newZoom;
  viewport.y = mouseY - canvasY * newZoom;
  viewport.zoom = newZoom;

  applyTransform();
  callbacks.onZoomChange?.(viewport.zoom);
}

function onDblClick(e) {
  if (e.target !== svg && e.target.id !== 'canvas-bg') return;

  const pos = clientToCanvas(svg, e.clientX, e.clientY, viewport);
  callbacks.onCanvasDblClick?.(pos.x, pos.y);
}

export function getViewport() {
  return { ...viewport };
}

export function setViewport(vp) {
  viewport.x = vp.x;
  viewport.y = vp.y;
  viewport.zoom = vp.zoom;
  applyTransform();
  callbacks.onZoomChange?.(viewport.zoom);
}

export function zoomIn() {
  const rect = svg.getBoundingClientRect();
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  zoomToward(cx, cy, ZOOM_STEP);
}

export function zoomOut() {
  const rect = svg.getBoundingClientRect();
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  zoomToward(cx, cy, 1 / ZOOM_STEP);
}

export function zoomReset() {
  const rect = svg.getBoundingClientRect();
  const cx = rect.width / 2;
  const cy = rect.height / 2;

  const canvasX = (cx - viewport.x) / viewport.zoom;
  const canvasY = (cy - viewport.y) / viewport.zoom;

  viewport.zoom = 1.0;
  viewport.x = cx - canvasX;
  viewport.y = cy - canvasY;
  applyTransform();
  callbacks.onZoomChange?.(viewport.zoom);
}

export function fitAll(rects) {
  if (rects.length === 0) {
    setViewport({ x: 0, y: 0, zoom: 1.0 });
    return;
  }

  const bounds = boundingBox(rects);
  const rect = svg.getBoundingClientRect();
  const vp = fitToView(bounds, rect.width, rect.height);
  setViewport(vp);
}

function zoomToward(screenX, screenY, factor) {
  const canvasX = (screenX - viewport.x) / viewport.zoom;
  const canvasY = (screenY - viewport.y) / viewport.zoom;
  const newZoom = clampZoom(viewport.zoom * factor);
  viewport.x = screenX - canvasX * newZoom;
  viewport.y = screenY - canvasY * newZoom;
  viewport.zoom = newZoom;
  applyTransform();
  callbacks.onZoomChange?.(viewport.zoom);
}

export function setSelection(id) {
  selectedId = id;
  // Update visual selection state on all cards
  const cardLayer = document.getElementById('card-layer');
  if (!cardLayer) return;
  for (const g of cardLayer.children) {
    const content = g.querySelector('.card-content');
    if (content) {
      content.classList.toggle('selected', g.dataset.placementId === id);
    }
  }
}

export function getSelection() {
  return selectedId;
}

export function getSvg() {
  return svg;
}
