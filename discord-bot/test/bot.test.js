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
    editReply: async m => sent.push({ type: 'edit', ...(typeof m === 'string' ? { content: m } : m) }),
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

// ── Knox Plus linking and the Knox Plus role ──
import { createHmac } from 'node:crypto';
import { Plus } from '../src/plus.js';

function fakeSite(statuses) {
  const calls = [];
  const fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, key: options.headers['X-Knox-Bot-Key'], ids: body.discordIds });
    return { ok: true, json: async () => ({ results: Object.fromEntries(body.discordIds.map(id => [id, statuses[id] || { linked: false, plus: false }])) }) };
  };
  return { fetch, calls };
}

function fakeMember(id, roleIds = []) {
  const roles = new Set(roleIds);
  return {
    id, roleSet: roles,
    roles: { cache: { has: r => roles.has(r) }, add: async r => roles.add(r), remove: async r => roles.delete(r) },
  };
}

const plusConfig = () => ({ ...config, knoxApiUrl: 'https://knoxknowsapp.com/api/ask', knoxBotKey: 'secret-key', dataFile: tempFile() });

test('/link makes a signed website link the website can verify', () => {
  const plus = new Plus({ config: plusConfig() });
  const url = new URL(plus.linkUrl('123456789012345678', 1_000_000_000_000));
  assert.equal(url.origin + url.pathname, 'https://knoxknowsapp.com/app');
  const [id, expires, signature] = url.searchParams.get('discord').split('.');
  assert.equal(id, '123456789012345678');
  assert.equal(Number(expires), 1_000_000_000 + 15 * 60);
  assert.equal(signature, createHmac('sha256', 'secret-key').update(`discord-link:${id}:${expires}`).digest('base64url'));
});

test('Plus status is asked with the bot key and cached', async () => {
  const site = fakeSite({ amy: { linked: true, plus: true } });
  const plus = new Plus({ config: plusConfig(), fetch: site.fetch });
  assert.equal(await plus.isPlus('amy'), true);
  assert.equal(await plus.isPlus('amy'), true);
  assert.equal(site.calls.length, 1);
  assert.equal(site.calls[0].url, 'https://knoxknowsapp.com/api/discord-link');
  assert.equal(site.calls[0].key, 'secret-key');
  await plus.isPlus('amy', { fresh: true });
  assert.equal(site.calls.length, 2);
  const down = new Plus({ config: plusConfig(), fetch: async () => { throw new Error('offline'); } });
  assert.equal(await down.isPlus('amy'), null);
});

test('The role is given to subscribers, and only bot-given roles are taken back', async () => {
  const plus = new Plus({ config: plusConfig(), fetch: fakeSite({}).fetch });
  const amy = fakeMember('amy');
  assert.equal(await plus.syncRole(amy, true), 'added');
  assert.ok(amy.roleSet.has('plus'));
  assert.equal(await plus.syncRole(amy, false), 'removed');
  assert.ok(!amy.roleSet.has('plus'));

  const owner = fakeMember('owner', ['plus']); // given the role by hand
  assert.equal(await plus.syncRole(owner, false), 'kept');
  assert.ok(owner.roleSet.has('plus'));
  assert.equal(await plus.syncRole(fakeMember('x'), null), 'kept'); // website unreachable: change nothing
});

test('The sweep takes the role back when Plus ends', async () => {
  const statuses = { amy: { linked: true, plus: true } };
  const config = plusConfig();
  const plus = new Plus({ config, fetch: fakeSite(statuses).fetch });
  const amy = fakeMember('amy');
  await plus.syncRole(amy, true);
  statuses.amy = { linked: true, plus: false };
  await new Plus({ config, fetch: fakeSite(statuses).fetch }).sweep({ members: { fetch: async () => amy } }); // after a restart
  assert.ok(!amy.roleSet.has('plus'));
});

test('/ask: a linked subscriber is unlimited and gets the role; an ended bot-given role stops counting', async () => {
  const statuses = { amy: { linked: true, plus: true } };
  const cfg = plusConfig();
  const plus = new Plus({ config: cfg, fetch: fakeSite(statuses).fetch });
  const dataFile = tempFile();
  const handlers = createHandlers({ config: { ...cfg, perUserLimit: 1 }, limits: new Limits({ perUserLimit: 1, globalCap: 50, dataFile }), lessons: new Lessons({ dataFile }), askKnox: async () => 'Hint.', plus });

  const member = fakeMember('amy');
  const first = { ...fake(), member };
  await handlers.ask(first);
  assert.match(first.sent.at(-1).content, /unlimited/);
  await new Promise(r => setImmediate(r));
  assert.ok(member.roleSet.has('plus'));

  statuses.amy = { linked: true, plus: false };
  plus.cache.clear();
  const second = { ...fake(), member };
  await handlers.ask(second);
  // Back to the free limit (today's question already used) and the role is gone.
  assert.match(second.sent.at(-1).content, /used your 1 questions/);
  await new Promise(r => setImmediate(r));
  assert.ok(!member.roleSet.has('plus'));
});

test('Check my Plus explains each case', async () => {
  const statuses = { plus: { linked: true, plus: true }, free: { linked: true, plus: false } };
  const plus = new Plus({ config: plusConfig(), fetch: fakeSite(statuses).fetch });
  const handlers = createHandlers({ config: plusConfig(), limits: null, lessons: null, askKnox: null, plus });
  const reply = async userId => {
    const i = { ...fake({ userId }), member: fakeMember(userId) };
    await handlers.checkPlus(i);
    return i.sent.at(-1);
  };
  assert.match((await reply('plus')).content, /got Knox Plus/);
  assert.match((await reply('free')).content, /doesn't have Knox Plus/);
  assert.match((await reply('stranger')).content, /isn't connected yet/);
});

test('Ended lessons are deleted from disk', async () => {
  const dataFile = tempFile();
  const lessons = new Lessons({ dataFile });
  const id = lessons.start('amy', 'q', 'a');
  lessons.lessons[id].startedAt -= 3 * 3600_000; // 3 hours ago
  lessons.prune();
  const { readFileSync } = await import('node:fs');
  assert.equal(readFileSync(lessons.file, 'utf8'), '{}');
});
