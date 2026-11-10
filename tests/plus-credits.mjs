import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BANKS, plusUsesCredits, PLUS_CREDITS_START } from '../api/_plans.js';

test('Free and Knox Plus banks save up to 4 days of credits; Plus gets 50 a day', () => {
  assert.deepEqual([BANKS.free.regen, BANKS.free.max], [5, 20]);
  assert.deepEqual([BANKS.plus.regen, BANKS.plus.max], [50, 200]);
  for (const b of Object.values(BANKS)) assert.equal(b.max / b.regen, 4);
  assert.notEqual(BANKS.free.doc, BANKS.plus.doc);
});

test('Knox Plus credits start Dec 1 (preview builds earlier); earlier subscribers keep unlimited until renewal', () => {
  const env = process.env.VERCEL_ENV;
  try {
    delete process.env.VERCEL_ENV;
    assert.equal(plusUsesCredits({}, PLUS_CREDITS_START - 1000), false);
    assert.equal(plusUsesCredits({}, PLUS_CREDITS_START + 1000), true);
    assert.equal(plusUsesCredits({ plusLegacyUntil: PLUS_CREDITS_START + 86400000 }, PLUS_CREDITS_START + 1000), false);
    assert.equal(plusUsesCredits({ plusLegacyUntil: PLUS_CREDITS_START + 1000 }, PLUS_CREDITS_START + 2000), true);
    process.env.VERCEL_ENV = 'preview';
    assert.equal(plusUsesCredits({}, PLUS_CREDITS_START - 1000), true);
  } finally { if (env === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = env; }
});

test('Multi-page photos are Mega only, at most 5 pages, and bounded in size', () => {
  const ask = readFileSync(new URL('../api/ask.js', import.meta.url), 'utf8');
  assert.match(ask, /pages\.length > 4/);
  assert.match(ask, /pages\.length && tier !== 'mega'/);
  assert.match(ask, /> 4_300_000/);
  assert.match(ask, /checkAndIncrementUsage\(uid, plan, cost, plusCredits \? 'plus' : null\)/);
});
