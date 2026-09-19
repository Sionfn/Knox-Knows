import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const ask = readFileSync(new URL('api/ask.js', root), 'utf8');
const me = readFileSync(new URL('api/me.js', root), 'utf8');
const app = readFileSync(new URL('app.html', root), 'utf8');
const landing = readFileSync(new URL('index.html', root), 'utf8');
// Production uses the original interface with secure API integration.
assert.ok(!landing.includes('/knox-landing.css'));
assert.ok(!app.includes('sidebarProfileDock'));
assert.ok(app.includes("fetch('/api/activity'"));
assert.ok(app.includes('learnSessionId:'));
assert.ok(app.includes("fetch('/api/feedback'"));
const landingRenderer = vm.createContext({ formatInline: String });
vm.runInContext(landing.slice(landing.indexOf('  function renderFreeformText('), landing.indexOf('  // ── RENDER RESPONSE')), landingRenderer);
assert.ok(vm.runInContext('renderFreeformText("Key Points: example", "free")', landingRenderer, { timeout: 1000 }));
const renderer = vm.createContext({ escHtml: String, formatInline: String });
vm.runInContext(app.slice(app.indexOf('function renderAnswerHtml(text)'), app.indexOf('// ── Keyboard shortcuts')), renderer);
renderer.input = 'Photosynthesis uses light.\nVIDEO_SUGGEST: photosynthesis stages\n//';
assert.ok(!vm.runInContext('renderAnswerHtml(input)', renderer).includes('VIDEO_SUGGEST'));
assert.ok(!ask.includes('findHelpfulVideo'));
// Original UI retains its optional video renderer; the API no longer emits it.
for (const input of ['Verdict:\n1', 'Verdict:\n1\nConfirm:\nCorrect', 'The fix:\n1. First\n- Detail\n2. Second']) {
  renderer.input = input;
  assert.ok(vm.runInContext('renderAnswerHtml(input)', renderer, { timeout: 1000 }));
}
const context = vm.createContext({ console });
vm.runInContext(ask.slice(ask.indexOf('function findMatchingBrace'), ask.indexOf('export default async function handler')), context);
const clean = value => context.cleanLatexAnswer(value);
const code = 'Example:\n\x60\x60\x60js\nconst my_value = { price: "$10" };\n\x60\x60\x60';
assert.equal(clean(code), code);
assert.equal(clean('The total is $10. Use my_value.'), 'The total is $10. Use my_value.');
assert.equal(clean('Use \x60my_value = {x: 1}\x60'), 'Use \x60my_value = {x: 1}\x60');
assert.equal(clean(String.fromCharCode(92) + 'frac{1}{2}'), '(1)/(2)');

// Execute the actual quota functions against a serialized transactional store.
const records = new Map(); let tail = Promise.resolve();
const ref = path => ({ path, collection: name => ref(path + '/' + name), doc: id => ref(path + '/' + id) });
const db = {
  collection: name => ref(name),
  runTransaction(callback) {
    const task = tail.then(async () => {
      const tx = {
        get: async ref => ({ exists: records.has(ref.path), data: () => structuredClone(records.get(ref.path)) }),
        set: (ref, data, options) => records.set(ref.path, { ...(options?.merge ? records.get(ref.path) : {}), ...data }),
        update: (ref, data) => records.set(ref.path, { ...records.get(ref.path), ...data })
        ,delete: ref => records.delete(ref.path)
      };
      return callback(tx);
    });
    tail = task.catch(() => {}); return task;
  }
};
const quotaContext = vm.createContext({ db, Date, console });
vm.runInContext(ask.slice(ask.indexOf('const FREE_DAILY_REGEN'), ask.indexOf('// A provider failure')), quotaContext);
vm.runInContext(ask.slice(ask.indexOf('function validLearnSession'), ask.indexOf('async function getLearnSession')), quotaContext);
const meStart = me.indexOf('      const { balance, lastRegenAt } = await db.runTransaction');
const meEnd = me.indexOf('      remaining = balance;', meStart);
vm.runInContext('async function readBank(uid) { const bankRef = db.collection("users").doc(uid).collection("usage").doc("bank"); const now = Date.now();' + me.slice(meStart, meEnd) + 'return { balance, lastRegenAt }; }', quotaContext);
const quota = quotaContext.checkAndIncrementUsage;
const bank = 'users/test/usage/bank';
await Promise.all([quotaContext.readBank('test'), quota('test', 'free', 2), quotaContext.readBank('test'), quota('test', 'free', 1)]);
assert.equal(records.get(bank).balance, 7, 'Refresh must not overwrite deductions');
records.set(bank, { balance: 0, lastRegenAt: Date.now() - 86400001 });
await Promise.all([quotaContext.readBank('test'), quota('test', 'free', 2)]);
assert.equal(records.get(bank).balance, 3, 'Regeneration and spending must be atomic');
records.set(bank, { balance: 10, lastRegenAt: Date.now() });
await Promise.all(Array.from({ length: 16 }, () => quota('test', 'free', 1, 'learn-session-123456')));
assert.equal(records.get(bank).balance, 8, '16 Learn turns must start two charged sessions');
assert.equal((await quota('test', 'pro')).allowed, true);
vm.runInContext(ask.slice(ask.indexOf('async function refundUsage'), ask.indexOf('function validLearnSession')), quotaContext);
const paidTurn = await quota('refund-user', 'pro', 1, 'refund-session-12345');
await quotaContext.refundUsage('refund-user', 'pro', 1, paidTurn.usageId, 'refund-session-12345', paidTurn.sessionCreatedAt);
assert.equal(records.has('users/refund-user/learnSessions/refund-session-12345'), false);
assert.equal(records.get('users/refund-user/usage/rolling').log.length, 0);
const freeTurn = await quota('refund-free', 'free', 1, 'refund-session-12345');
await quotaContext.refundUsage('refund-free', 'free', 1, null, 'refund-session-12345', freeTurn.sessionCreatedAt);
assert.equal(records.get('users/refund-free/usage/bank').balance, 10);
assert.equal(records.has('users/refund-free/learnSessions/refund-session-12345'), false);
console.log('Behavior checks passed: code preservation, atomic credits, Learn turn limits, legacy Plus.');
