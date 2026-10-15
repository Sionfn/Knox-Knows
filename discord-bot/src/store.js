// Tiny JSON file storage, so restarts don't lose state.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function loadJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

export function saveJson(file, data) {
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file + '.tmp', JSON.stringify(data));
    renameSync(file + '.tmp', file); // atomic, so a crash can't leave half a file
  } catch (err) {
    console.error(`Could not save ${file}:`, err.message);
  }
}
