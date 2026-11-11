// App Store plans (api/_apple.js): only Apple-signed purchases count, only for the
// Knox account that bought them, and only while the subscription is active.
// The certificates below are a throwaway test chain (not Apple's), used with a
// test root fingerprint so the real check can be exercised end to end.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import apple, { verifyAppleJws, appleAccountToken, appleState, APPLE_BUNDLE_ID } from '../api/_apple.js';
import { tierOf } from '../api/_plans.js';

const ROOT = `-----BEGIN CERTIFICATE-----
MIIBQjCB6KADAgECAgkAohg7R+3wFAQwCgYIKoZIzj0EAwIwFDESMBAGA1UEAwwJ
VGVzdCBSb290MB4XDTI2MTExMTIzMzAxMVoXDTM2MTEwODIzMzAxMVowFDESMBAG
A1UEAwwJVGVzdCBSb290MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQo73nHpI
fbaFYTHG/YGjJAPGzIoVGuM8P69mkH95OJOcwW1KpUKtYmbLCXmW7agMgOOvOVsO
WvZciu3bWvJenaMjMCEwDwYDVR0TAQH/BAUwAwEB/zAOBgNVHQ8BAf8EBAMCAQYw
CgYIKoZIzj0EAwIDSQAwRgIhAL2mlfBtjDaGtZ15HUfn9Fsso+ddnhsTXTtVphUV
tuDMAiEApdnw45pwdyun7sHKxjqVugP3P/4vIQq/kka+9PsaLoY=
-----END CERTIFICATE-----`;
const INT = `-----BEGIN CERTIFICATE-----
MIIBSDCB76ADAgECAgkAsmLXC7F+/9gwCQYHKoZIzj0EATAUMRIwEAYDVQQDDAlU
ZXN0IFJvb3QwHhcNMjYxMTExMjMzMDExWhcNMzYxMTA4MjMzMDExWjAcMRowGAYD
VQQDDBFUZXN0IEludGVybWVkaWF0ZTBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IA
BK8nevHi4jaoVCZNrGGBApRWCyDOGb0JsmnyJtfjYfhWxTJrKtIi4yAM7C1OmuZe
wNpa7kl3ePl+y+rMiFXx4fWjIzAhMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/
BAQDAgEGMAkGByqGSM49BAEDSQAwRgIhAPnlk+bJsOsxRcfEcm1N3PKOOXEGCJLB
ZecmpJktPbDmAiEAxkZfEajG61v9DFvQuk5BCPQGaU2jA17RjTe1gwMe4mY=
-----END CERTIFICATE-----`;
const LEAF = `-----BEGIN CERTIFICATE-----
MIIBHDCBxQIJAM/IGwS5V8c+MAkGByqGSM49BAEwHDEaMBgGA1UEAwwRVGVzdCBJ
bnRlcm1lZGlhdGUwHhcNMjYxMTExMjMzMDExWhcNMzYxMTA4MjMzMDExWjAUMRIw
EAYDVQQDDAlUZXN0IExlYWYwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAATxzSSU
KfJvXr5myZPHozVFRmrKtwUYPyeMubLDcBur/qM7FNSmrnsux8S/YZQ6NBZNqD48
+OpyQ3niEBQVgZGIMAkGByqGSM49BAEDRwAwRAIgVrO5KSN8i2xalHMm2WyezSAh
YDJuHmMRyhjjXtwpHzcCIDlsXWQEnXQlx2hXE1eh6QpNBEmDuHDqnvs+KgV/nvLr
-----END CERTIFICATE-----`;
const LEAF_KEY = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgT83sF04Alr4Zzgn6
ra9xpz4BX6jc5k0Dtz0tSyn75ruhRANCAATxzSSUKfJvXr5myZPHozVFRmrKtwUY
PyeMubLDcBur/qM7FNSmrnsux8S/YZQ6NBZNqD48+OpyQ3niEBQVgZGI
-----END PRIVATE KEY-----`;
const der = pem => new crypto.X509Certificate(pem).raw.toString('base64');
const ROOT_SHA = new crypto.X509Certificate(ROOT).fingerprint256.replace(/:/g, '');
const b64u = b => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
function sign(payload, { chain = [LEAF, INT, ROOT] } = {}) {
  const head = b64u(JSON.stringify({ alg: 'ES256', x5c: chain.map(der) }));
  const body = b64u(JSON.stringify(payload));
  const sig = crypto.sign('sha256', Buffer.from(head + '.' + body), { key: LEAF_KEY, dsaEncoding: 'ieee-p1363' });
  return head + '.' + body + '.' + b64u(sig);
}

test('Apple signatures: a real chain passes; a tampered payload, a wrong root or a short chain fail', () => {
  const jws = sign({ productId: 'x', n: 1 });
  assert.deepEqual(verifyAppleJws(jws, { rootSha256: ROOT_SHA }), { productId: 'x', n: 1 });
  assert.throws(() => verifyAppleJws(jws), /Not signed by Apple/, 'the real Apple root is required by default');
  const [h, , s] = jws.split('.');
  assert.throws(() => verifyAppleJws(h + '.' + b64u(JSON.stringify({ productId: 'x', n: 2 })) + '.' + s, { rootSha256: ROOT_SHA }), /does not match/);
  assert.throws(() => verifyAppleJws(sign({ a: 1 }, { chain: [LEAF] }), { rootSha256: ROOT_SHA }), /format/);
  assert.throws(() => verifyAppleJws(sign({ a: 1 }, { chain: [LEAF, ROOT] }), { rootSha256: ROOT_SHA }), /chain/);
  assert.throws(() => verifyAppleJws('nope'), /Not a signed/);
});

test('App Store plans: account token, active/expired/refunded, and tierOf', () => {
  const t = appleAccountToken('uid-1');
  assert.match(t, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(appleAccountToken('uid-1'), t);
  assert.notEqual(appleAccountToken('uid-2'), t);
  const now = 1_800_000_000_000;
  assert.deepEqual(appleState({ productId: 'com.knoxknowsapp.mega.monthly', expiresDate: now + 1000 }, now), { tier: 'mega', active: true, until: now + 1000 });
  assert.equal(appleState({ productId: 'com.knoxknowsapp.mega.monthly', expiresDate: now - 1 }, now).active, false);
  assert.equal(appleState({ productId: 'com.knoxknowsapp.plus.yearly', expiresDate: now + 1000, revocationDate: now - 5 }, now).active, false);
  assert.equal(appleState({ productId: 'com.other.app', expiresDate: now + 1000 }, now).active, false);
  assert.equal(tierOf({ appleTier: 'mega', appleUntil: now + 1 }, now), 'mega');
  assert.equal(tierOf({ appleTier: 'plus', appleUntil: now + 1 }, now), 'plus');
  assert.equal(tierOf({ appleTier: 'mega', appleUntil: now - 1 }, now), 'free');
});

// A tiny Firestore stand-in.
function fakeDb() {
  const data = new Map();
  const ref = (col, id) => ({ id, async get() { const v = data.get(col + '/' + id); return { exists: !!v, data: () => v, id }; }, async set(v, o) { data.set(col + '/' + id, o?.merge ? { ...(data.get(col + '/' + id) || {}), ...v } : v); } });
  return {
    data,
    collection: col => ({
      doc: id => ref(col, id),
      where: (f, op, val) => ({ limit: () => ({ async get() { return { docs: [...data].filter(([k, v]) => k.startsWith(col + '/') && v[f] === val).map(([k]) => ({ id: k.split('/')[1] })) }; } }) }),
    }),
    async runTransaction(fn) { return fn({ get: r => r.get(), set: (r, v, o) => r.set(v, o) }); },
  };
}

test('App Store plans endpoint: unlocks only the buyer\'s account, refuses others, and Apple notices update it', async () => {
  // The handler checks against Apple's real root, so route our test chain through a wrapper.
  const mod = await import('../api/_apple.js');
  const now = 1_800_000_000_000;
  const db = fakeDb();
  const auth = { async verifyIdToken(t) { if (t === 'amy-token') return { uid: 'amy' }; if (t === 'bob-token') return { uid: 'bob' }; throw Error('bad'); } };
  const call = async (body, headers = {}, query = { route: 'apple' }) => {
    const res = { code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
    await apple({ method: 'POST', query, headers, body }, res, { db, auth, now, rootSha256: ROOT_SHA });
    return res;
  };
  const tx = (uid, extra = {}) => sign({ bundleId: APPLE_BUNDLE_ID, productId: 'com.knoxknowsapp.mega.monthly', originalTransactionId: '1000', expiresDate: now + 86400000, appAccountToken: appleAccountToken(uid), environment: 'Sandbox', ...extra });

  assert.equal((await call({ action: 'token' })).code, 401, 'signed in only');
  const tok = await call({ action: 'token' }, { authorization: 'Bearer amy-token' });
  assert.equal(tok.body.accountToken, appleAccountToken('amy'));

  let r = await call({ action: 'verify', transactions: [tx('amy')] }, { authorization: 'Bearer amy-token' });
  assert.equal(r.body.tier, 'mega');
  assert.equal(tierOf(db.data.get('users/amy'), now), 'mega');

  // Bob can't use Amy's purchase (wrong account token), nor claim her subscription.
  r = await call({ action: 'verify', transactions: [tx('amy')] }, { authorization: 'Bearer bob-token' });
  assert.equal(r.body.tier, null);
  r = await call({ action: 'verify', transactions: [tx('bob')] }, { authorization: 'Bearer bob-token' });
  assert.equal(r.code, 409, 'subscription 1000 already belongs to Amy');
  assert.equal(tierOf(db.data.get('users/bob') || {}, now), 'free');

  // Forged or other-app purchases are ignored.
  r = await call({ action: 'verify', transactions: ['a.b.c', tx('amy', { bundleId: 'com.other' })] }, { authorization: 'Bearer amy-token' });
  assert.equal(r.body.tier, null);

  // Apple says it was refunded: Amy is back to free.
  const notice = sign({ notificationType: 'REFUND', data: { bundleId: APPLE_BUNDLE_ID, signedTransactionInfo: tx('amy', { revocationDate: now - 10 }) } });
  r = await call({ signedPayload: notice }, {}, { route: 'apple-notify' });
  assert.equal(r.code, 200);
  assert.equal(tierOf(db.data.get('users/amy'), now), 'free');
  assert.equal((await call({ signedPayload: 'forged' }, {}, { route: 'apple-notify' })).code, 400);
});
