// Every KK_* icon the landing page uses must be defined: a missing one throws
// in setBilling, which runs while a signed-in account loads, and the page then
// shows "We could not load this page".
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

test('landing page defines every KK_ icon it uses', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const used = new Set(html.match(/\bKK_[A-Z]+\b/g) || []);
  const defined = new Set([...html.matchAll(/\b(?:const|let|var)\s+(KK_[A-Z]+)\s*=/g)].map(m => m[1]));
  for (const name of used) assert.ok(defined.has(name), `${name} is used but never defined`);
});
