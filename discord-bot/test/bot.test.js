import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Limits } from '../src/limits.js';
import { splitMessage } from '../src/split.js';

const tempFile = () => join(mkdtempSync(join(tmpdir(), 'knox-bot-')), 'usage.json');

test('each user gets 5 a day and sees how many are left', () => {
  const limits = new Limits({ perUserLimit: 5, globalCap: 100, dataFile: tempFile() });
  const remaining = Array.from({ length: 5 }, () => limits.reserve('amy', false).remaining);
  assert.deepEqual(remaining, [4, 3, 2, 1, 0]);
  assert.deepEqual(limits.reserve('amy', false), { ok: false, reason: 'user', remaining: 0 });
  assert.equal(limits.reserve('ben', false).ok, true);
});

test('Plus members are unlimited, but the global cap still applies to everyone', () => {
  const limits = new Limits({ perUserLimit: 1, globalCap: 3, dataFile: tempFile() });
  assert.equal(limits.reserve('plus', true).remaining, null);
  assert.equal(limits.reserve('plus', true).ok, true);
  assert.equal(limits.reserve('plus', true).ok, true);
  assert.deepEqual(limits.reserve('plus', true), { ok: false, reason: 'global' });
  assert.equal(limits.reserve('amy', false).reason, 'global');
});

test('a failed answer is refunded, and counts survive a restart', () => {
  const dataFile = tempFile();
  const limits = new Limits({ perUserLimit: 2, globalCap: 10, dataFile });
  limits.reserve('amy', false);
  limits.reserve('amy', false);
  limits.refund('amy');
  const restarted = new Limits({ perUserLimit: 2, globalCap: 10, dataFile });
  assert.equal(restarted.reserve('amy', false).remaining, 0);
  assert.equal(restarted.reserve('amy', false).ok, false);
});

test('long answers split under the Discord limit without losing text', () => {
  const text = Array.from({ length: 60 }, (_, i) => `Paragraph ${i} ` + 'word '.repeat(20)).join('\n\n');
  const parts = splitMessage(text);
  assert.ok(parts.length > 1);
  assert.ok(parts.every(p => p.length <= 1900));
  assert.equal(parts.join(' ').replace(/\s+/g, ' '), text.replace(/\s+/g, ' '));
});

// ── /ask with fake Discord interactions ──
import { createAskHandler } from '../src/ask.js';
import { KnoxError } from '../src/knox.js';

const config = { studyChannelId: 'study', plusRoleId: 'plus', perUserLimit: 2, knoxApiUrl: 'x', knoxBotKey: 'k' };

function fakeInteraction({ channelId = 'study', parentId = null, roles = [], question = 'How do I factor x^2+5x+6?' } = {}) {
  const sent = [];
  return {
    sent, channelId, channel: { parentId }, user: { id: 'amy' }, member: { roles },
    options: { getString: () => question },
    reply: async m => sent.push({ type: 'reply', ...m }),
    deferReply: async () => sent.push({ type: 'defer' }),
    editReply: async m => sent.push({ type: 'edit', ...m }),
    followUp: async m => sent.push({ type: 'followUp', ...m }),
  };
}

test('/ask outside #study-help gets a private pointer and costs nothing', async () => {
  const limits = new Limits({ perUserLimit: 2, globalCap: 10, dataFile: tempFile() });
  const handle = createAskHandler({ config, limits, askKnox: () => assert.fail('must not call Knox') });
  const i = fakeInteraction({ channelId: 'general' });
  await handle(i);
  assert.equal(i.sent[0].type, 'reply');
  assert.ok(i.sent[0].flags);
  assert.match(i.sent[0].content, /<#study>/);
  assert.equal(limits.reserve('amy', false).remaining, 1);
});

test('/ask answers publicly, shows questions left, and never pings', async () => {
  const limits = new Limits({ perUserLimit: 2, globalCap: 10, dataFile: tempFile() });
  let sentTo;
  const handle = createAskHandler({ config, limits, askKnox: async args => { sentTo = args; return 'What two numbers multiply to 6 and add to 5?'; } });
  const i = fakeInteraction({ parentId: 'study', question: '@everyone factor x^2+5x+6' });
  await handle(i);
  assert.equal(sentTo.question, '@everyone factor x^2+5x+6');
  assert.deepEqual(i.sent.map(m => m.type), ['defer', 'edit']);
  assert.match(i.sent[1].content, /multiply to 6/);
  assert.match(i.sent[1].content, /1 of 2 questions left today/);
  assert.equal(JSON.stringify(i.sent[1].allowedMentions), '{"parse":[]}');
});

test('/ask stops at the daily limit, but Plus members keep going', async () => {
  const limits = new Limits({ perUserLimit: 2, globalCap: 10, dataFile: tempFile() });
  const handle = createAskHandler({ config, limits, askKnox: async () => 'Hint.' });
  for (let n = 0; n < 2; n++) await handle(fakeInteraction());
  const blocked = fakeInteraction();
  await handle(blocked);
  assert.equal(blocked.sent[0].type, 'reply');
  assert.match(blocked.sent[0].content, /used your 2 questions/);
  const plus = fakeInteraction({ roles: ['plus'] });
  await handle(plus);
  assert.match(plus.sent.at(-1).content, /unlimited/);
});

test('/ask explains errors politely and refunds the question', async () => {
  const limits = new Limits({ perUserLimit: 2, globalCap: 10, dataFile: tempFile() });
  const handle = createAskHandler({ config, limits, askKnox: async () => { throw new KnoxError('Knox took too long to answer. Please try again in a minute.'); } });
  const i = fakeInteraction();
  await handle(i);
  assert.match(i.sent.at(-1).content, /took too long.*didn't count/);
  assert.equal(limits.reserve('amy', false).remaining, 1);
});

// ── Knox API client against a local fake server ──
import { createServer } from 'node:http';
import { askKnox } from '../src/knox.js';

test('askKnox sends a Learn-mode request with the bot key and maps errors', async () => {
  let seen;
  let status = 200;
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      seen = { key: req.headers['x-knox-bot-key'], body: JSON.parse(body) };
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(status === 200 ? { answer: ' Try listing factors of 6. ' } : { error: 'busy' }));
    });
  });
  await new Promise(r => server.listen(0, r));
  const apiUrl = `http://127.0.0.1:${server.address().port}/api/ask`;
  try {
    assert.equal(await askKnox({ apiUrl, botKey: 'secret', question: 'q', discordUserId: 'amy' }), 'Try listing factors of 6.');
    assert.equal(seen.key, 'secret');
    assert.equal(seen.body.learnMode, true);
    status = 429;
    await assert.rejects(askKnox({ apiUrl, botKey: 'secret', question: 'q', discordUserId: 'amy' }), /very busy/);
  } finally {
    server.close();
  }
});
