import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tierOf, isFamilyPrice, FAMILY_SEATS } from '../api/_plans.js';

const src = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('a Family member has Knox Plus until the payer’s paid-through date', () => {
  const now = Date.now();
  assert.equal(tierOf({ familyUntil: now + 60000 }, now), 'plus');
  assert.equal(tierOf({ familyUntil: now - 1 }, now), 'free');
  assert.equal(tierOf({ plan: 'super', family: true }, now), 'plus');
  assert.equal(FAMILY_SEATS, 4);
});

test('Family prices come from env vars and are recognized', () => {
  process.env.STRIPE_PRICE_FAMILY_MONTHLY = 'price_fam_m';
  assert.equal(isFamilyPrice('price_fam_m'), true);
  assert.equal(isFamilyPrice('price_other'), false);
  assert.equal(isFamilyPrice(''), false);
});

test('the webhook keeps members in step and ends them with the subscription', () => {
  const w = src('api/webhook.js');
  assert.match(w, /PRICE_TO_PLAN\[id\] = PLUS_PLAN/);
  assert.match(w, /syncFamily\(db, uid, family \? familyUntilOf\(subscription\) : 0\)/);
  assert.equal((w.match(/syncFamily\(db, uid, 0\)/g) || []).length, 2); // paused/unpaid and deleted
});

test('family fields are server-only and the route is reachable', () => {
  assert.match(src('firestore.rules'), /return \['lastActiveAt', 'firstSeenAt'\];/);
  assert.match(src('api/me.js'), /route === "family"\) return family\(req, res/);
  const f = src('api/_family.js');
  assert.match(f, /members\.length >= FAMILY_SEATS - 1/);
  assert.match(f, /if \(owner === me\)/);
});
