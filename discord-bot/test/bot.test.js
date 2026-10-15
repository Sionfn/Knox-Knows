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

// ── /ask and Reply with fake Discord interactions ──
import { createHandlers } from '../src/ask.js';
import { KnoxError } from '../src/knox.js';
import { Lessons, MAX_REPLIES } from '../src/lessons.js';

const config = { studyChannelId: 'study', plusRoleId: 'plus', perUserLimit: 2, knoxApiUrl: 'x', knoxBotKey: 'k' };

function setup(askKnox, { perUserLimit = 2, globalCap = 10 } = {}) {
  const dataFile = tempFile();
  const limits = new Limits({ perUserLimit, globalCap, dataFile });
  const lessons = new Lessons({ dataFile });
  return { limits, lessons, ...createHandlers({ config: { ...config, perUserLimit }, limits, lessons, askKnox }) };
}

function fake({ channelId = 'study', parentId = null, roles = [], userId = 'amy', question = 'How do I factor x^2+5x+6?', customId, reply } = {}) {
  const sent = [];
  return {
    sent, channelId, channel: { parentId }, user: { id: userId }, member: { roles }, customId,
    options: { getString: () => question },
    fields: { getTextInputValue: () => reply },
    reply: async m => sent.push({ type: 'reply', ...m }),
    deferReply: async () => sent.push({ type: 'defer' }),
    editReply: async m => sent.push({ type: 'edit', ...m }),
    followUp: async m => sent.push({ type: 'followUp', ...m }),
    showModal: async m => sent.push({ type: 'modal', modal: m.toJSON() }),
  };
}
const buttonId = message => message.components?.[0]?.toJSON().components[0].custom_id;

test('/ask outside #study-help gets a private pointer and costs nothing', async () => {
  const bot = setup(() => assert.fail('must not call Knox'));
  const i = fake({ channelId: 'general' });
  await bot.ask(i);
  assert.equal(i.sent[0].type, 'reply');
  assert.ok(i.sent[0].flags);
  assert.match(i.sent[0].content, /<#study>/);
  assert.equal(bot.limits.reserve('amy', false).remaining, 1);
});

test('/ask answers publicly, shows questions left, never pings, and offers a Reply button', async () => {
  let sentTo;
  const bot = setup(async args => { sentTo = args; return 'What two numbers multiply to 6 and add to 5?'; });
  const i = fake({ parentId: 'study', question: '@everyone factor x^2+5x+6' });
  await bot.ask(i);
  assert.equal(sentTo.question, '@everyone factor x^2+5x+6');
  assert.deepEqual(i.sent.map(m => m.type), ['defer', 'edit']);
  assert.match(i.sent[1].content, /multiply to 6/);
  assert.match(i.sent[1].content, /1 of 2 questions left today/);
  assert.equal(JSON.stringify(i.sent[1].allowedMentions), '{"parse":[]}');
  assert.match(buttonId(i.sent[1]), /^reply:/);
});

test('/ask stops at the daily limit, but Plus members keep going', async () => {
  const bot = setup(async () => 'Hint.');
  for (let n = 0; n < 2; n++) await bot.ask(fake());
  const blocked = fake();
  await bot.ask(blocked);
  assert.equal(blocked.sent[0].type, 'reply');
  assert.match(blocked.sent[0].content, /used your 2 questions/);
  const plus = fake({ roles: ['plus'] });
  await bot.ask(plus);
  assert.match(plus.sent.at(-1).content, /unlimited/);
});

test('/ask explains errors politely and refunds the question', async () => {
  const bot = setup(async () => { throw new KnoxError('Knox took too long to answer. Please try again in a minute.'); });
  const i = fake();
  await bot.ask(i);
  assert.match(i.sent.at(-1).content, /took too long.*didn't count/);
  assert.equal(bot.limits.reserve('amy', false).remaining, 1);
});

test('Reply continues the lesson with its history and does not use a question', async () => {
  const calls = [];
  const bot = setup(async args => { calls.push(args); return calls.length === 1 ? 'What could you compare?' : 'Yes! Rise over run.'; }, { perUserLimit: 1 });
  const asked = fake({ question: 'How do I find slope?' });
  await bot.ask(asked);
  const id = buttonId(asked.sent.at(-1));

  const click = fake({ customId: id });
  await bot.replyButtonClicked(click);
  assert.equal(click.sent[0].type, 'modal');
  assert.equal(click.sent[0].modal.custom_id, id.replace('reply:', 'answer:'));

  const submit = fake({ customId: id.replace('reply:', 'answer:'), reply: 'rise over run?' });
  await bot.replySubmitted(submit);
  assert.equal(calls[1].question, 'rise over run?');
  assert.deepEqual(calls[1].history.map(m => m.content), ['How do I find slope?', 'What could you compare?']);
  const posted = submit.sent.at(-1);
  assert.match(posted.content, /<@amy>[\s\S]*rise over run\?[\s\S]*Rise over run/);
  assert.match(posted.content, new RegExp(`${MAX_REPLIES - 1} replies left`));
  assert.equal(buttonId(posted), id);
  // amy's 1 daily question went to /ask; the reply didn't need another.
  assert.equal(bot.limits.reserve('amy', false).ok, false);
});

test('Only the asker can reply, and lessons stop after the reply limit', async () => {
  const bot = setup(async () => 'Hint.', { globalCap: 50 });
  const asked = fake();
  await bot.ask(asked);
  const id = buttonId(asked.sent.at(-1));

  const stranger = fake({ customId: id, userId: 'ben' });
  await bot.replyButtonClicked(stranger);
  assert.match(stranger.sent[0].content, /Only the student who asked/);

  let last;
  for (let n = 0; n < MAX_REPLIES; n++) {
    last = fake({ customId: id.replace('reply:', 'answer:'), reply: 'idk' });
    await bot.replySubmitted(last);
  }
  assert.match(last.sent.at(-1).content, /last reply in this lesson/);
  assert.equal(buttonId(last.sent.at(-1)), undefined);
  const tooMany = fake({ customId: id });
  await bot.replyButtonClicked(tooMany);
  assert.match(tooMany.sent[0].content, /used all/);
});

test('Replies count toward the global cost cap', async () => {
  const bot = setup(async () => 'Hint.', { globalCap: 1 });
  const asked = fake();
  await bot.ask(asked);
  const submit = fake({ customId: buttonId(asked.sent.at(-1)).replace('reply:', 'answer:'), reply: 'ok' });
  await bot.replySubmitted(submit);
  assert.match(submit.sent[0].content, /all the questions it can for today/);
});

test('Lessons survive a restart', async () => {
  const dataFile = tempFile();
  const id = new Lessons({ dataFile }).start('amy', 'q', 'a');
  assert.equal(new Lessons({ dataFile }).get(id).ownerId, 'amy');
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
