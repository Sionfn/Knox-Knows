import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const app = read('app.html');

test('Knox Calculator math: school rules, percent, functions, degrees, friendly errors (no eval)', () => {
  const context = {};
  runInNewContext(read('calc-core.js'), context);
  const M = context.KnoxMath;
  const val = (text, opts = { deg: true, ans: 21 }) => { const r = M.evaluate(text, opts); return r.error ? 'ERR ' + r.error : M.format(r.value); };
  for (const [text, want] of [
    ['12×(3+4)', '84'], ['2π', '6.28318530718'], ['3(4)', '12'], ['(2)(3)', '6'], ['2sin(30)', '1'], ['6÷2(1+2)', '9'],
    ['-3^2', '-9'], ['−3^2', '-9'], ['2^3^2', '512'], ['3²', '9'], ['4³+1', '65'], ['5!', '120'], ['0.1+0.2', '0.3'],
    // percent is postfix ÷100 and keeps grouping (same as the old calculator)
    ['2/50%', '4'], ['(20+30)%', '0.5'], ['2/(20+30)%', '4'], ['√(25)%', '0.05'], ['50%%', '0.005'], ['2(30)%', '0.6'],
    ['√16', '4'], ['∛-27', '-3'], ['(-8)^(1/3)', '-2'], ['sin(30)', '0.5'], ['cos(90)', '0'], ['sin(180)', '0'], ['tan(45)', '1'],
    ['sin⁻¹(0.5)', '30'], ['log(1000)', '3'], ['ln(e)', '1'], ['abs(-7)', '7'], ['10^3', '1000'], ['Ans×2', '42'], ['(3+4', '7'],
    ['7÷0', "ERR Can't divide by 0"], ['tan(90)', 'ERR tan is undefined there'], ['√-4', 'ERR No real answer'],
    ['cos⁻¹(2)', 'ERR Use a number from −1 to 1'], ['2.5!', 'ERR ! needs a whole number'], ['3+4)', 'ERR Check your brackets'],
    ['2+', 'ERR Finish the problem'], ['(+', 'ERR Finish the problem'], ['alert(1)', "ERR Knox can't read that"],
  ]) assert.equal(val(text), want, text);
  assert.equal(val('sin(π/2)', { deg: false }), '1', 'radians');
  assert.equal(val('Ans+1', { deg: true }), 'ERR No answer yet');
  assert.equal(M.format(1e22), '1 × 10²²');
  assert.equal(M.fraction(0.75), '3/4'); assert.equal(M.fraction(1 / 3), '1/3'); assert.equal(M.fraction(-0.5), '−1/2');
  assert.equal(M.fraction(Math.PI), ''); assert.equal(M.fraction(4), '');
  assert.doesNotMatch(read('calc-core.js'), /\bFunction\(|\beval\(/, 'never runs typed text as code');
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
  assert.match(resume, /await handlePurchase\(pending.plan === 'max' \? 'Mega' : 'Plus', pending.billing\)/);
  assert.doesNotMatch(resume, /setTimeout/);
  assert.match(html, /if \(window\._checkoutBusy \|\| window\._pendingCheckout\) return false/);
});
