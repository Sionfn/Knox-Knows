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

const config = { studyChannelId: 'study', plusRoleId: 'plus', megaRoleId: 'mega', perUserLimit: 2, knoxApiUrl: 'x', knoxBotKey: 'k' };

function setup(askKnox, { perUserLimit = 2, globalCap = 10 } = {}) {
  const dataFile = tempFile();
  const limits = new Limits({ perUserLimit, globalCap, dataFile });
  const lessons = new Lessons({ dataFile });
  return { limits, lessons, ...createHandlers({ config: { ...config, perUserLimit }, limits, lessons, askKnox }) };
}

function fake({ channelId = 'study', parentId = null, roles = [], userId = 'amy', question = 'How do I factor x^2+5x+6?', photo = null, customId, reply } = {}) {
  const sent = [];
  return {
    sent, channelId, channel: { parentId }, user: { id: userId }, member: { roles }, customId,
    options: { getString: () => question, getAttachment: () => photo },
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
  await bot.learn(i);
  assert.equal(i.sent[0].type, 'reply');
  assert.ok(i.sent[0].flags);
  assert.match(i.sent[0].content, /<#study>/);
  assert.equal(bot.limits.reserve('amy', false).remaining, 1);
});

test('/ask answers publicly, shows questions left, never pings, and offers a Reply button', async () => {
  let sentTo;
  const bot = setup(async args => { sentTo = args; return 'What two numbers multiply to 6 and add to 5?'; });
  const i = fake({ parentId: 'study', question: '@everyone factor x^2+5x+6' });
  await bot.learn(i);
  assert.equal(sentTo.question, '@everyone factor x^2+5x+6');
  assert.deepEqual(i.sent.map(m => m.type), ['defer', 'edit']);
  assert.match(i.sent[1].content, /multiply to 6/);
  assert.match(i.sent[1].content, /1 of 2 questions left today · Replies to this lesson are free/);
  assert.equal(JSON.stringify(i.sent[1].allowedMentions), '{"parse":[]}');
  assert.match(buttonId(i.sent[1]), /^reply:/);
});

test('/ask stops at the daily limit, but Plus members keep going', async () => {
  const bot = setup(async () => 'Hint.');
  for (let n = 0; n < 2; n++) await bot.learn(fake());
  const blocked = fake();
  await bot.learn(blocked);
  assert.equal(blocked.sent[0].type, 'reply');
  assert.match(blocked.sent[0].content, /used your 2 questions/);
  const plus = fake({ roles: ['plus'] });
  await bot.learn(plus);
  assert.match(plus.sent.at(-1).content, /-# Knox Plus · unlimited questions$/);
});

test('/ask explains errors politely and refunds the question', async () => {
  const bot = setup(async () => { throw new KnoxError('Knox took too long to answer. Please try again in a minute.'); });
  const i = fake();
  await bot.learn(i);
  assert.match(i.sent.at(-1).content, /took too long.*didn't count/);
  assert.equal(bot.limits.reserve('amy', false).remaining, 1);
});

test('Reply continues the lesson with its history and does not use a question', async () => {
  const calls = [];
  const bot = setup(async args => { calls.push(args); return calls.length === 1 ? 'What could you compare?' : 'Yes! Rise over run.'; }, { perUserLimit: 1 });
  const asked = fake({ question: 'How do I find slope?' });
  await bot.learn(asked);
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
  assert.match(posted.content, new RegExp(`Lesson reply · doesn't use a question · ${MAX_REPLIES - 1} replies left`));
  assert.equal(buttonId(posted), id);
  // amy's 1 daily question went to /ask; the reply didn't need another.
  assert.equal(bot.limits.reserve('amy', false).ok, false);
});

test('Only the asker can reply, and lessons stop after the reply limit', async () => {
  const bot = setup(async () => 'Hint.', { globalCap: 50 });
  const asked = fake();
  await bot.learn(asked);
  const id = buttonId(asked.sent.at(-1));

  const stranger = fake({ customId: id, userId: 'ben' });
  await bot.replyButtonClicked(stranger);
  assert.match(stranger.sent[0].content, /Only the student who asked/);

  let last;
  for (let n = 0; n < MAX_REPLIES; n++) {
    last = fake({ customId: id.replace('reply:', 'answer:'), reply: 'idk' });
    await bot.replySubmitted(last);
  }
  assert.match(last.sent.at(-1).content, /last reply here/);
  assert.equal(buttonId(last.sent.at(-1)), undefined);
  const tooMany = fake({ customId: id });
  await bot.replyButtonClicked(tooMany);
  assert.match(tooMany.sent[0].content, /used all/);
});

test('Replies count toward the global cost cap', async () => {
  const bot = setup(async () => 'Hint.', { globalCap: 1 });
  const asked = fake();
  await bot.learn(asked);
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
  await handlers.learn(first);
  assert.match(first.sent.at(-1).content, /unlimited/);
  await new Promise(r => setImmediate(r));
  assert.ok(member.roleSet.has('plus'));

  statuses.amy = { linked: true, plus: false };
  plus.cache.clear();
  const second = { ...fake(), member };
  await handlers.learn(second);
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

test('Plus members see "Knox Plus" on lesson replies too', async () => {
  const bot = setup(async () => 'Hint.');
  const asked = fake({ roles: ['plus'] });
  await bot.learn(asked);
  const submit = fake({ roles: ['plus'], customId: buttonId(asked.sent.at(-1)).replace('reply:', 'answer:'), reply: 'ok' });
  await bot.replySubmitted(submit);
  assert.match(submit.sent.at(-1).content, /-# Knox Plus · 29 replies left in this lesson/); // 30 replies, like Learn on the website
});

test('Mega Knox members get Mega on /ask and 50-reply lessons, like the website', async () => {
  const bot = setup(async () => 'Hint.');
  const asked = fake({ roles: ['mega'] });
  await bot.learn(asked);
  assert.match(asked.sent.at(-1).content, /-# Mega Knox · unlimited questions$/);
  const submit = fake({ roles: ['mega'], customId: buttonId(asked.sent.at(-1)).replace('reply:', 'answer:'), reply: 'ok' });
  await bot.replySubmitted(submit);
  assert.match(submit.sent.at(-1).content, /-# Mega Knox · 49 replies left in this lesson/);
});

test('/ask with a photo sends it to Knox, shows it with the answer, and costs one question', async () => {
  let sentTo;
  const dataFile = tempFile();
  const limits = new Limits({ perUserLimit: 2, globalCap: 10, dataFile });
  const lessons = new Lessons({ dataFile });
  const handlers = createHandlers({
    config, limits, lessons,
    askKnox: async args => { sentTo = args; return 'What does the first problem ask for?'; },
    downloadPhoto: async url => { assert.equal(url, 'https://cdn.discordapp.com/hw.png'); return Buffer.from('png-bytes'); },
  });
  const i = fake({ question: null, photo: { url: 'https://cdn.discordapp.com/hw.png', name: 'hw.png', contentType: 'image/png', size: 1000 } });
  await handlers.learn(i);
  assert.equal(sentTo.image, Buffer.from('png-bytes').toString('base64'));
  assert.equal(sentTo.imageType, 'image/png');
  assert.equal(sentTo.question, '');
  const posted = i.sent.at(-1);
  assert.match(posted.content, /📷 Photo question[\s\S]*first problem/);
  assert.equal(posted.files[0].name, 'hw.png');
  assert.match(posted.content, /1 of 2 questions left/);
  // Replies continue from the text of the lesson, like on the website.
  const lessonId = buttonId(posted).slice('reply:'.length);
  assert.equal(lessons.get(lessonId).history[0].content, '📷 Photo');
});

test('/ask checks photos before using a question', async () => {
  const bot = setup(() => assert.fail('must not call Knox'));
  for (const [photo, message] of [
    [null, /Add a question, a photo/],
    [{ url: 'x', contentType: 'application/pdf', size: 10 }, /JPG, PNG, GIF or WebP/],
    [{ url: 'x', contentType: 'image/png', size: 5_000_000 }, /under 3 MB/],
  ]) {
    const i = fake({ question: null, photo });
    await bot.learn(i);
    assert.match(i.sent[0].content, message);
  }
  assert.equal(bot.limits.reserve('amy', false).remaining, 1);
});

test('A photo that cannot be downloaded is refunded', async () => {
  const dataFile = tempFile();
  const limits = new Limits({ perUserLimit: 2, globalCap: 10, dataFile });
  const handlers = createHandlers({
    config, limits, lessons: new Lessons({ dataFile }), askKnox: () => assert.fail('must not call Knox'),
    downloadPhoto: async () => { throw new KnoxError("I couldn't open your photo. Please try attaching it again."); },
  });
  const i = fake({ photo: { url: 'x', contentType: 'image/jpeg', size: 10 } });
  await handlers.learn(i);
  assert.match(i.sent.at(-1).content, /couldn't open your photo.*didn't count/);
  assert.equal(limits.reserve('amy', false).remaining, 1);
});

test('downloadPhoto fetches the attachment and rejects failures', async () => {
  const { downloadPhoto } = await import('../src/knox.js');
  const server = createServer((req, res) => {
    if (req.url === '/ok.png') { res.writeHead(200); res.end('png-bytes'); }
    else { res.writeHead(404); res.end(); }
  });
  await new Promise(r => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await downloadPhoto(`${base}/ok.png`)).toString(), 'png-bytes');
    await assert.rejects(downloadPhoto(`${base}/missing.png`), /couldn't open your photo/);
  } finally {
    server.close();
  }
});

test('Replies in a photo lesson send the photo to Knox again, without reposting it', async () => {
  const calls = [];
  const dataFile = tempFile();
  const lessons = new Lessons({ dataFile });
  let downloads = 0;
  const handlers = createHandlers({
    config, limits: new Limits({ perUserLimit: 2, globalCap: 10, dataFile }), lessons,
    askKnox: async args => { calls.push(args); return 'Next: 1 + 4?'; },
    downloadPhoto: async () => { downloads++; return Buffer.from('png-bytes'); },
  });
  const asked = fake({ question: null, photo: { url: 'https://cdn.discordapp.com/hw.png', name: 'hw.png', contentType: 'image/png', size: 1000 } });
  await handlers.learn(asked);
  const submit = fake({ customId: buttonId(asked.sent.at(-1)).replace('reply:', 'answer:'), reply: '8' });
  await handlers.replySubmitted(submit);
  assert.equal(calls[1].question, '8');
  assert.equal(calls[1].image, Buffer.from('png-bytes').toString('base64'));
  assert.equal(calls[1].imageType, 'image/png');
  assert.equal(downloads, 2);
  assert.equal(submit.sent.at(-1).files, undefined);

  // If the photo's link has expired, the lesson carries on as text.
  const lessonId = buttonId(asked.sent.at(-1)).slice('reply:'.length);
  const expired = createHandlers({
    config, limits: new Limits({ perUserLimit: 2, globalCap: 10, dataFile }), lessons,
    askKnox: async args => { calls.push(args); return 'Keep going!'; },
    downloadPhoto: async () => { throw new Error('expired'); },
  });
  const later = fake({ customId: `answer:${lessonId}`, reply: '5' });
  await expired.replySubmitted(later);
  assert.equal(calls[2].image, undefined);
  assert.match(later.sent.at(-1).content, /Keep going/);
});

test('End lesson: only the asker can end it; it removes the buttons and closes the lesson', async () => {
  const bot = setup(async () => 'Hint.');
  const asked = fake();
  await bot.learn(asked);
  const posted = asked.sent.at(-1);
  const ids = posted.components[0].toJSON().components.map(c => c.custom_id);
  const lessonId = ids[0].slice('reply:'.length);
  assert.deepEqual(ids, [`reply:${lessonId}`, `end:${lessonId}`]);

  const clickEnd = userId => {
    const i = { ...fake({ userId, customId: `end:${lessonId}` }), message: { content: posted.content } };
    i.update = async m => i.sent.push({ type: 'update', ...m });
    return i;
  };
  const stranger = clickEnd('ben');
  await bot.endLesson(stranger);
  assert.match(stranger.sent[0].content, /Only the student who asked/);
  assert.ok(bot.lessons.get(lessonId));

  const owner = clickEnd('amy');
  await bot.endLesson(owner);
  assert.equal(owner.sent[0].type, 'update');
  assert.deepEqual(owner.sent[0].components, []);
  assert.match(owner.sent[0].content, /Hint\.[\s\S]*🏁 Lesson ended/);
  assert.equal(bot.lessons.get(lessonId), null);

  const replyAfter = fake({ customId: `reply:${lessonId}` });
  await bot.replyButtonClicked(replyAfter);
  assert.match(replyAfter.sent[0].content, /has ended/);
  const again = clickEnd('amy');
  await bot.endLesson(again);
  assert.match(again.sent[0].content, /already ended/);
});

test('/link only works inside the Knox server (linking unlocks the Slime Flame)', async () => {
  const plus = new Plus({ config: plusConfig(), fetch: fakeSite({}).fetch });
  const handlers = createHandlers({ config: { ...plusConfig(), guildId: 'knox' }, limits: null, lessons: null, askKnox: null, plus });
  const elsewhere = { ...fake(), guildId: null };
  await handlers.link(elsewhere);
  assert.match(elsewhere.sent[0].content, /inside the Knox Knows server/);
  assert.equal(elsewhere.sent[0].components, undefined, 'no link button outside the server');
  const inServer = { ...fake(), guildId: 'knox' };
  await handlers.link(inServer);
  assert.match(inServer.sent[0].content, /Slime Flame/);
  assert.ok(inServer.sent[0].components?.length, 'gets the Connect button');
});

test('Learn marker lines become Discord formatting, and Choices become tap-to-answer buttons', async () => {
  const { formatLearn } = await import('../src/learn-format.js');
  const f = formatLearn('Subtract 5 from both sides first.\n**Key idea:** Do the same thing to both sides.\nProgress: 2/4\nGraph: y = 3x + 5\nVideo: two step equations khan academy\n- **Choices:** 3x = 15 | 3x = 25 | x = 15');
  assert.doesNotMatch(f.text, /Choices:|Progress:|Graph:|Video:|^Key idea:/m, 'no raw marker lines');
  assert.match(f.text, /^-# Part 2 of 4  ●●○○/);
  assert.match(f.text, /> 🧠 \*\*Key idea:\*\* Do the same thing to both sides\./);
  assert.match(f.text, /📈 \*\*Try graphing:\*\* `y = 3x \+ 5`/);
  assert.match(f.text, /youtube\.com\/results\?search_query=two%20step%20equations/);
  assert.deepEqual(f.choices, ['3x = 15', '3x = 25', 'x = 15']);
  const done = formatLearn('You solved it!\nRecap: Undo each step in reverse.\nWatch out: Do it to both sides.\nTopic: Two-step equations');
  assert.match(done.text, /🎉 \*\*What you learned · Two-step equations\*\*\n> Undo each step in reverse\.\n⚠️ \*\*Watch out:\*\* Do it to both sides\./);

  // In a lesson: choice buttons above Reply; tapping one sends it as the reply.
  const calls = [];
  const bot = setup(async args => { calls.push(args); return calls.length === 1 ? 'What do you get first?\nChoices: 3x = 15 | 3x = 25' : 'Yes!'; });
  const asked = fake({ question: 'Solve 3x + 5 = 20' });
  await bot.learn(asked);
  const posted = asked.sent.at(-1);
  assert.doesNotMatch(posted.content, /Choices:/);
  const rows = posted.components.map(r => r.toJSON().components.map(c => c.custom_id));
  assert.equal(rows.length, 2);
  assert.match(rows[0][1], /^choice:.+:1$/);
  assert.match(rows[1][0], /^reply:/);
  const tap = fake({ customId: rows[0][1] });
  await bot.choiceClicked(tap);
  assert.equal(calls[1].question, '3x = 25');
  assert.match(tap.sent.at(-1).content, /3x = 25[\s\S]*Yes!/);
});

test('Discord separates lesson goals from counted practice and preserves bold key terms',async()=>{
 const {formatLearn}=await import('../src/learn-format.js');
 const f=formatLearn('Try.\nKey idea: **Balance** matters.\nYour turn: What next?\nLesson plan: Keep balance | Solve independently\nProgress: 1/2\nPractice: 2/4');
 // One counter like the website: practice while practising, with the current goal's name.
 assert.match(f.text,/-# Practice 2 of 4  ●●○○ · Keep balance/);assert.doesNotMatch(f.text,/Part 1 of 2/);
 assert.match(f.text,/\*\*Balance\*\*/);
 assert.match(formatLearn('Next.\nLesson plan: Keep balance | Solve independently\nProgress: 2/2').text,/-# Part 2 of 2  ●● · Solve independently/);
 assert.doesNotMatch(formatLearn('Go.\nLesson plan: Solve it\nProgress: 1/1').text,/Part 1 of 1/);
 assert.doesNotMatch(f.text,/Lesson plan:|Progress:|Practice:/);
});

test('/ask is Ask Knox: a full answer with the Answer line, follow-ups use a question, Teach me this starts a free Learn lesson', async () => {
  const calls = [];
  const replies = ['Subtract 5 from both sides to isolate the x-term: 3x = 15.\nDivide both sides by 3 to get x alone: x = 5.\n\nAnswer: **x = 5**', 'Because 3 × 5 = 15.', 'What is the first step?\nChoices: subtract 5 | divide by 3'];
  const bot = setup(async args => { calls.push(args); return replies[calls.length - 1]; }, { perUserLimit: 2 });
  const asked = fake({ question: 'Solve 3x + 5 = 20' });
  await bot.ask(asked);
  assert.equal(calls[0].learnMode, false, 'Ask Knox, not Learn');
  const posted = asked.sent.at(-1);
  assert.match(posted.content, /> ✅ \*\*Answer:\*\* x = 5/);
  assert.match(posted.content, /1 of 2 questions left today · Follow-ups use a question/);
  const ids = posted.components[0].toJSON().components.map(c => c.custom_id);
  assert.match(ids[0], /^reply:/); assert.match(ids[1], /^teach:/); assert.match(ids[2], /^end:/);

  // A follow-up is a new question (like the website) and keeps the conversation.
  const click = fake({ customId: ids[0] });
  await bot.replyButtonClicked(click);
  assert.equal(click.sent[0].modal.title, 'Ask Knox a follow-up');
  const followUp = fake({ customId: 'answer:' + ids[0].slice(6), reply: 'why 5?' });
  await bot.replySubmitted(followUp);
  assert.equal(calls[1].learnMode, false);
  assert.deepEqual(calls[1].history.map(m => m.role), ['user', 'assistant']);
  assert.match(followUp.sent.at(-1).content, /0 of 2 questions left today/);
  assert.equal(bot.limits.reserve('amy', false).ok, false, 'both daily questions used');

  // Teach me this: the same question as a Learn lesson, free (it was already paid for).
  const teach = fake({ customId: ids[1] });
  await bot.teachClicked(teach);
  assert.equal(calls[2].learnMode, true);
  assert.equal(calls[2].question, 'Solve 3x + 5 = 20');
  assert.match(teach.sent.at(-1).content, /Teach me this[\s\S]*Replies to this lesson are free/);
  assert.match(teach.sent.at(-1).components[0].toJSON().components[0].custom_id, /^choice:/);
  const stranger = fake({ customId: ids[1], userId: 'bob' });
  await bot.teachClicked(stranger);
  assert.match(stranger.sent[0].content, /Only the student who asked/);
});

test('/unlink disconnects the Knox account and takes back the plan roles the bot gave', async () => {
  const calls = [];
  const fetch = async (url, options) => { const body = JSON.parse(options.body); calls.push(body); return { ok: true, json: async () => body.action === 'unlink' ? { ok: true, wasLinked: body.discordId === 'amy' } : { results: {} } }; };
  const plus = new Plus({ config: plusConfig(), fetch });
  const removed = [];
  plus.syncRole = async (member, on) => removed.push(['plus', member.id, on]);
  plus.syncMegaRole = async (member, on) => removed.push(['mega', member.id, on]);
  const handlers = createHandlers({ config: plusConfig(), limits: null, lessons: null, askKnox: null, plus });
  const amy = { ...fake({ userId: 'amy' }), member: fakeMember('amy', ['plus']) };
  await handlers.unlink(amy);
  assert.deepEqual(calls.at(-1), { action: 'unlink', discordId: 'amy' });
  assert.match(amy.sent.at(-1).content, /Disconnected/);
  assert.deepEqual(removed, [['plus', 'amy', false], ['mega', 'amy', false]]);
  const bob = { ...fake({ userId: 'bob' }), member: fakeMember('bob') };
  await handlers.unlink(bob);
  assert.match(bob.sent.at(-1).content, /isn't connected/);
});

test('a long lesson (Mega: 50 replies) stays inside the website’s history limits and keeps its opening plan', async () => {
  const { historyForKnox } = await import('../src/lessons.js');
  const history = [{ role: 'user', content: 'Teach me 3x + 5 = 20' }, { role: 'assistant', content: 'Plan: Part 1 undo +5, Part 2 divide by 3.' }];
  for (let i = 1; i < 50; i++) history.push({ role: 'user', content: 'reply ' + i }, { role: 'assistant', content: 'answer ' + i });
  const sent = historyForKnox(history);
  assert.ok(sent.length <= 30, 'no more than 30 messages (the website rejects over 40)');
  assert.deepEqual(sent.slice(0, 2), history.slice(0, 2), 'opening question and plan kept');
  assert.equal(sent.at(-1).content, 'answer 49', 'newest messages kept');
  for (let i = 1; i < sent.length; i++) assert.notEqual(sent[i].role, sent[i - 1].role, 'turns stay in order');
  // Short lessons are sent as they are.
  assert.deepEqual(historyForKnox(history.slice(0, 6)), history.slice(0, 6));
  // Very long messages are left out instead of breaking the request.
  const big = historyForKnox([...history.slice(0, 2), { role: 'user', content: 'x'.repeat(30000) }, { role: 'assistant', content: 'ok' }]);
  assert.ok(big.every(m => m.content.length <= 24000));
});

test('Learn in Discord: a Your turn question the message already ends with is not repeated', async () => {
  const { formatLearn } = await import('../src/learn-format.js');
  const f = formatLearn('Subtract 5 from both sides. What do you get?\nYour turn: What do you get?');
  assert.equal((f.text.match(/What do you get\?/g) || []).length, 1);
  assert.match(formatLearn('Here is the idea.\nYour turn: What is 20 − 5?').text, /\*\*Your turn:\*\* What is 20 − 5\?/);
});

test('Learn in Discord: the question Knox ends with gets its own Your turn line (never from a numbered step)', async () => {
  const { formatLearn } = await import('../src/learn-format.js');
  const f = formatLearn('Adding 5 gives 6x = 36. What do you get when you divide both sides by 6?');
  assert.match(f.text, /^Adding 5 gives 6x = 36\.\n\n\*\*Your turn:\*\* What do you get when you divide both sides by 6\?$/);
  assert.doesNotMatch(formatLearn('Steps:\n1. Is it even?').text, /Your turn/);
});
test('Learn in Discord hides private assessment and review metadata from lesson text',async()=>{
 const {formatLearn}=await import('../src/learn-format.js');
 const reply=formatLearn('Try again.\nYour turn: Which piece is larger?\nVisual: fraction | 3/4\nAssessment: partial\nReview focus: Compare equal-sized pieces.');
 assert.doesNotMatch(reply.text,/Assessment:|Review focus:|Visual:/);
 assert.match(reply.text,/Which piece is larger/);
});
