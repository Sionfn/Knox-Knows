import test from 'node:test';
import assert from 'node:assert/strict';
import { VerificationStatus } from '@apple/app-store-server-library';
import apple, { appleAccountToken, appleState, APPLE_BUNDLE_ID } from '../api/_apple.js';
import { tierOf } from '../api/_plans.js';

const NOW = 1_800_000_000_000;
const day = 86400000;
const mega = 'com.knoxknowsapp.mega.monthly';
const plus = 'com.knoxknowsapp.plus.yearly';
const receipt = (uid, extra = {}) => ({
  bundleId: APPLE_BUNDLE_ID, productId: mega, originalTransactionId: '100',
  transactionId: '101', purchaseDate: NOW - day, signedDate: NOW - day,
  expiresDate: NOW + day, appAccountToken: appleAccountToken(uid),
  environment: 'Production', ...extra,
});

function setup(overrides = {}) {
  const data = new Map([['users/amy', {}], ['users/bob', {}]]);
  function ref(path) {
    return {
      id: path.split('/').at(-1),
      async get() { return { exists: data.has(path), data: () => data.get(path) }; },
      async set(v, o) { data.set(path, o?.merge ? { ...data.get(path), ...v } : v); },
      async update(v) {
        if (!data.has(path)) throw Error('Missing document');
        data.set(path, { ...data.get(path), ...v });
      },
    };
  }
  const db = {
    collection: collection => ({
      doc: key => ref(collection + '/' + key),
      where: (field, _, value) => ({ limit: () => ({
        async get() {
          return { docs: [...data].filter(([path, item]) => path.startsWith(collection + '/') && item[field] === value).map(([path]) => ref(path)) };
        },
      }) }),
    }),
    async runTransaction(fn) {
      const writes = [];
      const result = await fn({ get: r => r.get(), set: (...args) => writes.push(args) });
      for (const [r, value, options] of writes) await r.set(value, options);
      return result;
    },
  };
  const auth = { async verifyIdToken(t) { if (!['amy','bob'].includes(t)) throw Error('bad token');return { uid:t }; } };
  // These tests exercise reconciliation after cryptographic verification. A
  // separate test calls the real verifier to ensure fake receipts are rejected.
  const decoded = new Map();
  const sign = payload => { const key = 'verified-fixture-' + decoded.size;decoded.set(key,payload);return key; };
  const verify = async key => { if (!decoded.has(key)) throw Error('Invalid signature');return decoded.get(key); };
  const call = async (body, uid = 'amy', route = 'apple', method = 'POST') => {
    const res = { code: 0, body: null, setHeader() {}, status(c) { this.code=c;return this; }, json(b) { this.body=b;return this; } };
    await apple({ method, body, query:{route}, headers:uid?{authorization:'Bearer '+uid}:{} },res,
      { db, auth, now:NOW, enabled:true, verifyTransaction:verify, verifyNotification:verify, verifyRenewal:verify, ...overrides });
    return res;
  };
  const sync = (uid, ...receipts) => call({action:'verify',transactions:receipts.map(sign)},uid);
  const notice = (tx, kind, date = NOW, extra = {}) => call({signedPayload:sign({
    signedDate:date, notificationType:kind,
    data:{ environment:tx.environment, signedTransactionInfo:sign(tx), ...extra },
  })}, null, 'apple-notify');
  return { data, call, sync, notice };
}

test('Apple plans validate account tokens and ignore expired, refunded and upgraded receipts', () => {
  assert.match(appleAccountToken('amy'), /^[0-9a-f-]{36}$/);
  assert.notEqual(appleAccountToken('amy'), appleAccountToken('bob'));
  assert.equal(appleState(receipt('amy'), NOW).tier,'mega');
  assert.equal(appleState(receipt('amy',{revocationDate:NOW-1}), NOW).active,false);
  assert.equal(appleState(receipt('amy',{expiresDate:NOW-1}), NOW).active,false);
  assert.equal(appleState(receipt('amy',{isUpgraded:true}), NOW).active,false);
  assert.equal(appleState(receipt('amy',{productId:'constructor'}), NOW).active,false);
});

test('StoreKit starts only when enabled and only signs in the current Knox account', async () => {
  const {call} = setup({enabled:false,allowSandbox:uid=>uid==='amy'});
  assert.equal((await call({}, null,'apple','GET')).body.purchasesAvailable,false);
  assert.equal((await call({action:'token'},null)).code,401);
  assert.equal((await call({action:'token'},'bob')).code,503);
  assert.equal((await call({action:'token'},'amy')).body.accountToken,appleAccountToken('amy'));
});

test('a current website subscriber cannot start a second App Store subscription', async () => {
  const {call,data} = setup();
  data.set('users/amy', {stripeSubscription:'sub_qa',planStatus:'trialing'});
  const blocked = await call({action:'token'});
  assert.equal(blocked.code,409);
  assert.equal(data.get('users/amy').appleAccountToken,undefined);
  data.set('users/amy', {stripeSubscription:'sub_qa',planStatus:'cancelled'});
  assert.equal((await call({action:'token'})).code,200);
});

test('restore acknowledges only signed receipts tied to that Knox account and subscription owner', async () => {
  const {sync,data} = setup();
  assert.deepEqual((await sync('amy',receipt('amy'))).body.acceptedTransactionIds,['101']);
  assert.equal((await sync('bob',receipt('amy'))).body.tier,null);
  assert.equal((await sync('bob',receipt('bob'))).code,409);
  assert.equal((await sync('bob',receipt('bob',{originalTransactionId:'200',bundleId:'com.other'}))).body.tier,null);
  assert.equal(tierOf(data.get('users/bob'),NOW),'free');
});

test('the real verifier rejects forged and malformed JWS receipts', async () => {
  const {call} = setup({verifyTransaction:undefined,verifyNotification:undefined});
  assert.deepEqual((await call({action:'verify',transactions:['a.b.c']})).body.acceptedTransactionIds,[]);
  assert.equal((await call({signedPayload:'a.b.c'},null,'apple-notify')).code,400);
});

test('sandbox receipts cannot unlock production accounts or replace a production chain', async () => {
  const {sync,data} = setup({allowSandbox:uid=>uid==='amy'});
  assert.equal((await sync('bob',receipt('bob',{environment:'Sandbox'}))).body.tier,null);
  await sync('amy',receipt('amy'));
  await sync('amy',receipt('amy',{environment:'Sandbox',productId:plus,transactionId:'104'}));
  assert.equal(tierOf(data.get('users/amy'),NOW),'mega');
  assert.equal(data.get('appleSubscriptions/100').environment,'Production');
  assert.equal(data.get('appleSubscriptions/sandbox-100').environment,'Sandbox');
});

test('renewal order, refund replay, and unrelated refunds preserve the effective tier', async () => {
  const {sync,data,notice} = setup();
  const older = receipt('amy');
  const renewal = receipt('amy',{transactionId:'102',purchaseDate:NOW-1000,signedDate:NOW-999,expiresDate:NOW+2*day});
  const second = receipt('amy',{originalTransactionId:'300',transactionId:'301',productId:plus,expiresDate:NOW+3*day});
  await sync('amy',older,second);
  await notice(renewal,'DID_RENEW');
  assert.equal((await sync('amy',older)).body.until,NOW+2*day);
  await notice({...older,revocationDate:NOW},'REFUND');
  assert.equal(tierOf(data.get('users/amy'),NOW),'mega');
  await notice({...renewal,revocationDate:NOW},'REFUND');
  assert.equal((await sync('amy',renewal)).body.tier,'plus','replaying a pre-refund receipt cannot restore Mega');
  assert.equal(tierOf(data.get('users/amy'),NOW),'plus');
  await notice({...renewal,signedDate:NOW+10},'REFUND_REVERSED',NOW+10);
  assert.equal(tierOf(data.get('users/amy'),NOW),'mega');
  assert.equal(tierOf(data.get('users/amy'),NOW+2*day+1),'plus','an independent Plus plan remains usable after Mega expires');
});

test('failed notification verification retries and deletion does not recreate a user', async () => {
  const {notice,sync,data} = setup();
  await sync('amy',receipt('amy'));
  data.delete('users/amy');
  assert.equal((await notice(receipt('amy'),'DID_RENEW')).code,200);
  assert.equal(data.has('users/amy'),false);
  const failed=setup({verifyNotification:async()=>{throw {status:VerificationStatus.RETRYABLE_VERIFICATION_FAILURE};}});
  assert.equal((await failed.notice(receipt('amy'),'DID_RENEW')).code,503);
});
