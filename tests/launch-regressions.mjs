import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const app = read('app.html');

test('calculator postfix percentages preserve precedence and grouping', () => {
  const context = { window: { _calcUseDeg: true }, $: () => null };
  runInNewContext(read('calc-percent.js'), context);
  runInNewContext(app.slice(app.indexOf('function normalizeCalcExpr('), app.indexOf('window.calcMemStore')), context);
  for (const [expression, expected] of [['2/50%', '4'], ['(20+30)%', '0.5'], ['2/(20+30)%', '4'], ['Math.sqrt(25)%', '0.05'], ['50%%', '0.005'], ['2(30)%', '0.6']]) {
    context.window._calcExpr = expression; context.window._calcOpenParens = 0;
    context.window.calcEquals(); assert.equal(context.window._calcExpr, expected, expression);
  }
  context.window._calcExpr = '(+'; context.window._calcOpenParens = 1;
  context.window.calcEquals(); assert.equal(context.window._calcExpr, 'Error'); assert.equal(context.window._calcOpenParens, 0);
});

test('history saves full content atomically and refuses deleted parents', async () => {
  const code = app.slice(app.indexOf('  async function saveHistory('), app.indexOf('  window.saveHistory ='));
  let saved, exists = false, reset = 0;
  const context = {
    window: { currentUser: { uid: 'u1' }, _appViewVersion: 1 }, db: {}, crypto: { randomUUID: () => 'message1' },
    console, deletedHistory: new Set(), loadSidebarHistory() { reset++; },
    collection: (...args) => args, doc: () => ({ id: 'c1' }),
    runTransaction: async (_, fn) => fn({ get: async () => ({ exists: () => exists, data: () => ({}) }), set: (_, data) => { if (data.question) saved = data; }, update() {} }),
  };
  runInNewContext(code, context);
  assert.equal(await context.saveHistory('q'.repeat(8000), 'a'.repeat(25000), { uid: 'u1', viewVersion: 1 }), true);
  assert.equal(saved.question.length, 8000); assert.equal(saved.answer.length, 25000); assert.equal(reset, 1);
  context.deletedHistory.add('u1/c1'); saved = null;
  assert.equal(await context.saveHistory('q', 'a', { uid: 'u1', conversationId: 'c1' }), false);
  assert.equal(saved, null);
});

test('auth-boundary reset preserves permanent modals and clears private state', () => {
  const reset = app.slice(app.indexOf('if (resolvedAuthUid !=='), app.indexOf('window.currentUser = user || null;', app.indexOf('if (resolvedAuthUid !==')));
  assert.match(reset, /_askController\?\.abort/);
  assert.match(reset, /appStartNewChat\?\./);
  assert.match(reset, /draft\.value = ''/);
  assert.match(reset, /_fbPayloads = \{\}/);
  assert.match(reset, /:not\(#authModal\):not\(#appSettingsModal\)/);
});

test('payment UI never treats return query as proof of payment', () => {
  for (const path of ['app.html', 'index.html']) {
    const html = read(path);
    assert.match(html, /src="\/payment-status.js"/);
    assert.doesNotMatch(html, /Payment received — welcome|Your upgraded plan is now active/);
  }
  const status = read('payment-status.js');
  assert.match(status, /fetch\('\/api\/me'/);
  assert.match(status, /response.ok && \['super', 'plus', 'max'\].includes\(data.plan\)/);
  assert.match(status, /upgrade is not confirmed yet/);
});

test('billing intent survives auth until a checkout link is obtained', () => {
  const html = read('index.html');
  const start = html.indexOf('async function resumePendingCheckoutIfAny');
  const resume = html.slice(start, html.indexOf('window.resumePendingCheckoutIfAny =', start));
  assert.match(resume, /await handlePurchase\('Plus', pending.billing\)/);
  assert.doesNotMatch(resume, /setTimeout/);
  assert.match(html, /if \(window\._checkoutBusy \|\| window\._pendingCheckout\) return false/);
});
