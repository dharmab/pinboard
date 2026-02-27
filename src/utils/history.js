const MAX_HISTORY = 100;

let undoStack = [];
let redoStack = [];
let listeners = [];

function notify() {
  for (const fn of listeners) fn();
}

export async function executeCommand(cmd) {
  await cmd.execute();
  undoStack.push(cmd);
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack = [];
  notify();
}

export async function undo() {
  const cmd = undoStack.pop();
  if (!cmd) return;
  await cmd.undo();
  redoStack.push(cmd);
  notify();
}

export async function redo() {
  const cmd = redoStack.pop();
  if (!cmd) return;
  await cmd.execute();
  undoStack.push(cmd);
  notify();
}

export function canUndo() {
  return undoStack.length > 0;
}

export function canRedo() {
  return redoStack.length > 0;
}

export function onHistoryChange(fn) {
  listeners.push(fn);
}

export function clearHistory() {
  undoStack = [];
  redoStack = [];
  notify();
}
