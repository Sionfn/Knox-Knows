// Chat rename saves can finish out of order: an older save failing late must
// not undo a newer name that saved, and the list must end on the saved name.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const html = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
const start = html.indexOf('          const before = row.title || qText;');
const end = html.indexOf("showStreakToast('Could not rename that chat. Please try again.');", start);
const body = html.slice(start, html.indexOf('}', end) + 1);
const AsyncFunction = (async () => {}).constructor;
const save = new AsyncFunction('ctx', `const { row, qText, convId, d, name, renameStates, document, updateDoc, doc, db, window, showStreakToast } = ctx;\n${body}`);

function setup() {
  const shown = { text: 'Original' }, toasts = [], pending = [];
  const tx = { set textContent(t) { shown.text = t; } };
  const listRow = { dataset: { conversationId: 'c1' }, querySelector: () => tx, setAttribute() {} };
  const row = { title: 'Original' };
  const ctx = name => ({
    row, qText: 'Original', convId: 'c1', d: { type: 'chat' }, name, renameStates: ctx.states,
    document: { querySelectorAll: () => [listRow] },
    updateDoc: () => new Promise((resolve, reject) => pending.push({ name, resolve, reject })),
    doc: () => ({}), db: {}, window: { currentUser: { uid: 'u1' } }, showStreakToast: m => toasts.push(m),
  });
  ctx.states = {};
  const rename = name => { const p = save(ctx(name)); row.title = name; return p; };
  return { shown, toasts, pending, rename };
}

test('an older rename failing after a newer one saved keeps the newer name', async () => {
  const s = setup();
  const first = s.rename('First'), second = s.rename('Second');
  s.pending[1].resolve(); await second;
  s.pending[0].reject(new Error('offline')); await first;
  assert.equal(s.shown.text, 'Second');
  assert.equal(s.toasts.length, 0);
});

test('the newest rename failing shows the last name that saved, even if it saves later', async () => {
  const s = setup();
  const first = s.rename('First'), second = s.rename('Second');
  s.pending[1].reject(new Error('offline')); await second;
  assert.equal(s.shown.text, 'Original', 'nothing has saved yet');
  assert.equal(s.toasts.length, 1);
  s.pending[0].resolve(); await first;
  assert.equal(s.shown.text, 'First', 'the older save landed, so the list shows it');
});
