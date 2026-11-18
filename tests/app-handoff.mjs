import test from 'node:test';
import assert from 'node:assert/strict';
import handoff, { HANDOFF_TTL_MS } from '../api/_handoff.js';

const NOW = 1_800_000_000_000;
function setup() {
  const data = new Map();
  const db = {
    collection: c => ({ doc: k => ({ path: c + '/' + k, async set(v) { data.set(c + '/' + k, v); } }) }),
    async runTransaction(fn) {
      return fn({
        async get(r) { return { exists: data.has(r.path), data: () => data.get(r.path) }; },
        delete(r) { data.delete(r.path); },
      });
    },
  };
  const auth = {
    async verifyIdToken(t) { if (t !== 'good') throw Error('bad'); return { uid: 'amy' }; },
    async createCustomToken(uid) { return 'custom-' + uid; },
  };
  return { db, auth, data };
}
function call(fn, req) {
  return new Promise(resolve => {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { resolve({ code: this.code, body: b }); } };
    fn(req, res);
  });
}
const code = 'A'.repeat(32);

test('the app gets a one-time code; the website trades it once for the same account', async () => {
  const s = setup();
  const a = await call((req, res) => handoff(req, res, { ...s, now: NOW, newCode: () => code }), { method: 'POST', query: { route: 'handoff' }, headers: { authorization: 'Bearer good' } });
  assert.equal(a.code, 200); assert.equal(a.body.code, code);
  assert.ok(![...s.data.keys()].some(k => k.includes(code)), 'only a hash is stored');
  const b = await call((req, res) => handoff(req, res, { ...s, now: NOW + 1000 }), { method: 'POST', query: { route: 'handoff-redeem' }, body: { code } });
  assert.deepEqual([b.code, b.body.uid, b.body.customToken], [200, 'amy', 'custom-amy']);
  const again = await call((req, res) => handoff(req, res, { ...s, now: NOW + 2000 }), { method: 'POST', query: { route: 'handoff-redeem' }, body: { code } });
  assert.equal(again.code, 400);
});

test('expired codes, bad codes and missing sign-in are refused', async () => {
  const s = setup();
  const noAuth = await call((req, res) => handoff(req, res, { ...s, now: NOW }), { method: 'POST', query: { route: 'handoff' }, headers: {} });
  assert.equal(noAuth.code, 401);
  const badAuth = await call((req, res) => handoff(req, res, { ...s, now: NOW }), { method: 'POST', query: { route: 'handoff' }, headers: { authorization: 'Bearer nope' } });
  assert.equal(badAuth.code, 401);
  await call((req, res) => handoff(req, res, { ...s, now: NOW, newCode: () => code }), { method: 'POST', query: { route: 'handoff' }, headers: { authorization: 'Bearer good' } });
  const late = await call((req, res) => handoff(req, res, { ...s, now: NOW + HANDOFF_TTL_MS + 1 }), { method: 'POST', query: { route: 'handoff-redeem' }, body: { code } });
  assert.equal(late.code, 400);
  assert.equal(s.data.size, 0, 'an expired code is removed too');
  const junk = await call((req, res) => handoff(req, res, { ...s, now: NOW }), { method: 'POST', query: { route: 'handoff-redeem' }, body: { code: '../x' } });
  assert.equal(junk.code, 400);
  const get = await call((req, res) => handoff(req, res, { ...s, now: NOW }), { method: 'GET', query: { route: 'handoff' }, headers: {} });
  assert.equal(get.code, 405);
});
