// Knox Support (api/_support.js) and the Support Desk (api/_support-desk.js):
// the student chat, hand-offs to the team, team replies, permissions, refunds
// and concurrent writes — run against an in-memory Firestore.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm';
import test from 'node:test';

function memoryDb() {
  const store = new Map();
  let ids = 0, tail = Promise.resolve();
  const snap = path => ({ id: path.split('/').pop(), exists: store.has(path), data: () => store.get(path) && structuredClone(store.get(path)) });
  const write = (path, value, opts) => store.set(path, opts?.merge ? { ...store.get(path), ...structuredClone(value) } : structuredClone(value));
  const ref = path => ({
    path, id: path.split('/').pop(),
    collection: name => collection(`${path}/${name}`),
    get: async () => snap(path),
    set: async (v, o) => write(path, v, o),
    update: async v => { if (!store.has(path)) throw new Error('no doc'); write(path, v, { merge: true }); },
    delete: async () => { store.delete(path); },
  });
  const docsIn = path => [...store.keys()].filter(k => k.startsWith(path + '/') && !k.slice(path.length + 1).includes('/')).map(snap);
  const query = (path, filters = [], order = null, max = Infinity) => ({
    where: (f, op, v) => query(path, [...filters, d => d.data()[f] === v], order, max),
    orderBy: (f, dir) => query(path, filters, { f, dir }, max),
    limit: n => query(path, filters, order, n),
    get: async () => {
      let docs = docsIn(path).filter(d => filters.every(fn => fn(d)));
      if (order) docs = docs.filter(d => d.data()[order.f] !== undefined).sort((a, b) => (a.data()[order.f] - b.data()[order.f]) * (order.dir === 'desc' ? -1 : 1));
      return { docs: docs.slice(0, max) };
    },
  });
  const collection = path => ({ ...query(path), doc: id => ref(`${path}/${id ?? 'auto' + ++ids}`) });
  const db = {
    collection,
    runTransaction(fn) {
      const task = tail.then(async () => {
        const writes = [];
        const tx = { get: r => Promise.resolve(snap(r.path)), set: (r, v, o) => writes.push(() => write(r.path, v, o)), update: (r, v) => writes.push(() => write(r.path, v, { merge: true })) };
        const out = await fn(tx);
        writes.forEach(w => w());
        return out;
      });
      tail = task.catch(() => {});
      return task;
    },
  };
  return { db, store };
}

const OWNER = { uid: 'owner', email: 'sion@example.com', email_verified: true };
const STUDENT = { uid: 'stu', email: 'maya@example.com', email_verified: true, name: 'Maya Lopez' };
const OTHER = { uid: 'other', email: 'jo@example.com', email_verified: true };
const AGENT = { uid: 'agent', email: 'helper@example.com', email_verified: true };

// One loaded copy of the support handler with swappable fakes.
async function setup({ users = {} } = {}) {
  const { db, store } = memoryDb();
  for (const [uid, data] of Object.entries(users)) store.set(`users/${uid}`, data);
  const state = { token: STUDENT, ai: () => 'Happy to help!', emails: [], emailFails: false, aiCalls: 0, beforeAiReturns: null, refunds: [], cancels: [] };
  const fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    if (String(url).includes('openai')) {
      state.aiCalls++;
      if (state.beforeAiReturns) { await state.beforeAiReturns(); state.beforeAiReturns = null; }
      return { ok: true, json: async () => ({ choices: [{ message: { content: state.ai(body) } }] }) };
    }
    if (String(url).includes('resend')) { state.emails.push(body); return { ok: !state.emailFails, status: state.emailFails ? 503 : 200, text: async () => '' }; }
    return { ok: true, text: async () => '' };
  };
  const stripe = {
    invoices: { list: async () => ({ data: [{ id: 'in_paid', amount_paid: 999, status_transitions: { paid_at: Math.floor(Date.now() / 1000) - 2 * 86400 }, lines: { data: [{ price: { recurring: { interval: 'month' } } }] } }], has_more: false }) },
    subscriptions: {
      retrieve: async () => ({ status: 'active', start_date: Math.floor(Date.now() / 1000) - 2 * 86400, current_period_end: Math.floor(Date.now() / 1000) + 28 * 86400, items: { data: [{ price: { recurring: { interval: 'month' } } }] } }),
      cancel: async id => { state.cancels.push(id); },
    },
    charges: {
      list: async () => ({ data: [{ id: 'ch_1', paid: true, amount: 999, amount_refunded: 0, currency: 'usd', created: 1, invoice: 'in_1', refunded: false }] }),
      retrieve: async id => ({ id, customer: id === 'ch_1' ? 'cus_stu' : 'cus_someone_else', refunded: false }),
    },
    refunds: { create: async (p, o) => { state.refunds.push({ p, o }); return { id: 're_1', amount: 999, currency: 'usd' }; } },
  };
  const accounts = { [AGENT.email]: { uid: AGENT.uid, email: AGENT.email, displayName: 'Helper' } };
  const context = createContext({
    process: { env: { OPENAI_API_KEY: 'k', STRIPE_SECRET_KEY: 'k', RESEND_API_KEY: 'k', ADMIN_UID: OWNER.uid } },
    console: { ...console, error() {}, log() {} }, fetch, AbortSignal, Date, structuredClone,
  });
  const cache = new Map();
  const link = async (spec, ref) => {
    if (spec.startsWith('./')) {
      const path = new URL(spec, 'file:///' + ref.identifier).pathname.slice(1);
      if (!cache.has(path)) { const m = new SourceTextModule(readFileSync(path, 'utf8'), { context, identifier: path }); cache.set(path, m); await m.link(link); }
      return cache.get(path);
    }
    const exports = spec === 'firebase-admin/auth' ? { getAuth: () => ({ verifyIdToken: async () => state.token, getUserByEmail: async e => { if (!accounts[e]) throw new Error('none'); return accounts[e]; } }) }
      : spec === 'firebase-admin/firestore' ? { getFirestore: () => db, FieldValue: {} }
      : spec === 'stripe' ? { default: class { constructor() { return stripe; } } } : null;
    if (!exports) throw new Error('Unexpected import ' + spec);
    return new SyntheticModule(Object.keys(exports), function () { for (const [k, v] of Object.entries(exports)) this.setExport(k, v); }, { context });
  };
  const mod = new SourceTextModule(readFileSync('api/_support.js', 'utf8'), { context, identifier: 'api/_support.js' });
  await mod.link(link); await mod.evaluate();
  const handler = mod.namespace.default;
  const call = async (who, body) => {
    state.token = who;
    const res = { code: 200, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
    await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body }, res);
    return res;
  };
  return { call, state, store, stripe, env: context.process.env, shared: cache.get('api/_support-shared.js').namespace, db, chat: id => store.get(`supportChats/${id}`) };
}

test('Newest conversations are selected after sorting the full student inbox', async () => {
  const s = await setup();
  for (let i = 0; i < 65; i++) s.store.set('supportChats/c' + i, { uid: STUDENT.uid, title: 'Chat ' + i, updatedAt: i, messages: [] });
  const r = await s.call(STUDENT, { action: 'list' });
  assert.equal(r.body.chats.length, 50);
  assert.equal(r.body.chats[0].id, 'c64');
  assert.equal(r.body.chats.at(-1).id, 'c15');
});

test('Support email failures persist, recover on polling, and are not sent again', async () => {
  const s = await setup();
  s.state.emailFails = true;
  await s.shared.sendEmail({ db: s.db, studentUid: STUDENT.uid, to: STUDENT.email, subject: 'Reply', html: '<p>Reply</p>', text: 'Reply' });
  const [path, queued] = [...s.store].find(([p]) => p.startsWith('supportNotifications/'));
  assert.equal(queued.state, 'pending');
  assert.match(queued.lastError, /503/);
  s.store.set(path, { ...queued, nextAttemptAt: 0 });
  s.state.emailFails = false;
  await s.shared.flushEmails(s.db, OTHER.uid);
  assert.equal(s.state.emails.length, 1, 'another student cannot drain this queue');
  await s.shared.flushEmails(s.db, STUDENT.uid);
  assert.equal(s.store.get(path).state, 'sent');
  assert.equal(s.store.get(path).payload, null, 'sent transcript payload is removed');
  await s.shared.flushEmails(s.db);
  assert.equal(s.state.emails.length, 2);
});

test('Missing email configuration is visible and retained for later delivery', async () => {
  const s = await setup();
  delete s.env.RESEND_API_KEY;
  await s.shared.sendEmail({ db: s.db, studentUid: STUDENT.uid, to: STUDENT.email, subject: 'Reply', html: 'Reply', text: 'Reply' });
  const queued = [...s.store].find(([p]) => p.startsWith('supportNotifications/'))[1];
  assert.equal(queued.state, 'pending');
  assert.match(queued.lastError, /not configured/);
  assert.equal(s.state.emails.length, 0);
  s.state.token = OWNER;
  const r = await s.call(OWNER, { action: 'desk-list' });
  assert.equal(r.body.delivery.pending, 1);
});

test('Refund facts use actual paid invoices, never subscription start or free invoices', async () => {
  const s = await setup({ users: { stu: { plan: 'super', stripeSubscription: 'sub_1' } } });
  s.stripe.invoices.list = async () => ({ data: [], has_more: false });
  let facts = await s.shared.accountFacts(s.db, STUDENT.uid, STUDENT.email);
  assert.equal(facts.refund, null);
  assert.match(facts.text, /could not be confirmed/);
  s.stripe.invoices.list = async () => ({ data: [
    { id: 'zero', amount_paid: 0, status_transitions: { paid_at: 1 } },
    { id: 'paid', amount_paid: 999, status_transitions: { paid_at: Math.floor(Date.now() / 1000) - 40 * 86400 } }
  ], has_more: false });
  facts = await s.shared.accountFacts(s.db, STUDENT.uid, STUDENT.email);
  assert.equal(facts.refund, false);
  assert.match(facts.text, /window has PASSED/);
});

test('Student chat: Knox Support answers, ACTION is stripped and offered, refund goes to the team by email', async () => {
  const s = await setup({ users: { stu: { plan: 'super', stripeSubscription: 'sub_1', stripeCustomerId: 'cus_stu' } } });
  s.state.ai = () => 'You paid 2 days ago, so you are inside the window. Want me to send a refund request?\nACTION: refund';
  const r = await s.call(STUDENT, { action: 'say', text: 'Can I get a refund?' });
  assert.equal(r.code, 200);
  assert.equal(r.body.action, 'refund');
  assert.equal(r.body.chat.messages.at(-1).text, 'You paid 2 days ago, so you are inside the window. Want me to send a refund request?');
  const id = r.body.chat.id, stored = s.chat(id);
  assert.equal(stored.status, 'open');
  assert.equal(stored.refundEligible, true);
  assert.match(stored.facts, /Knox Plus monthly/);
  assert.match(stored.facts, /STILL INSIDE/);
  const h = await s.call(STUDENT, { action: 'handoff', id, kind: 'refund' });
  assert.equal(h.body.chat.status, 'waiting');
  assert.equal(s.chat(id).kind, 'refund');
  assert.ok(h.body.chat.messages.at(-1).note);
  assert.ok(s.state.emails.some(e => e.to[0] === 'support@knoxknowsapp.com' && /Refund request/.test(e.subject) && e.reply_to === STUDENT.email));
  // A second hand-off while waiting changes nothing and sends nothing.
  const sent = s.state.emails.length;
  await s.call(STUDENT, { action: 'handoff', id, kind: 'refund' });
  assert.equal(s.state.emails.length, sent);
});

test('Team reply reaches the student (badge + email with the teammate name); student replies go back to the team, not the AI', async () => {
  const s = await setup();
  const id = (await s.call(STUDENT, { action: 'say', text: 'my discord role is missing' })).body.chat.id;
  await s.call(STUDENT, { action: 'handoff', id, kind: 'human' });
  const list = await s.call(OWNER, { action: 'desk-list' });
  assert.equal(list.body.chats[0].id, id);
  assert.equal(list.body.chats[0].teamUnread, true);
  const rep = await s.call(OWNER, { action: 'desk-reply', id, text: 'Try /link again!' });
  assert.equal(rep.body.chat.status, 'replied');
  assert.equal(rep.body.chat.assignedTo.uid, OWNER.uid);
  assert.ok(s.state.emails.some(e => e.to[0] === STUDENT.email && /Sion from Knox Knows replied/.test(e.subject)));
  // The student sees it as unread, with the name, and without internal ids.
  const mine = await s.call(STUDENT, { action: 'list' });
  assert.equal(mine.body.chats[0].unread, 1);
  assert.equal(mine.body.chats[0].last.by, 'Sion');
  const got = await s.call(STUDENT, { action: 'get', id });
  assert.equal(got.body.chat.messages.at(-1).by, 'Sion');
  assert.equal(got.body.chat.messages.at(-1).byUid, undefined);
  assert.equal((await s.call(STUDENT, { action: 'list' })).body.chats[0].unread, 0);
  // Writing back goes to the team: no AI call, status waiting, one email.
  const calls = s.state.aiCalls, emails = s.state.emails.length;
  const back = await s.call(STUDENT, { action: 'say', id, text: 'still not working' });
  assert.equal(back.body.chat.status, 'waiting');
  assert.equal(back.body.action, undefined);
  assert.equal(s.state.aiCalls, calls);
  assert.equal(s.state.emails.length, emails + 1);
  // Another message while already waiting: no extra email.
  await s.call(STUDENT, { action: 'say', id, text: 'hello?' });
  assert.equal(s.state.emails.length, emails + 1);
});

test('A solved conversation comes back to the team when the student writes again', async () => {
  const s = await setup();
  const id = (await s.call(STUDENT, { action: 'say', text: 'refund please' })).body.chat.id;
  await s.call(STUDENT, { action: 'handoff', id, kind: 'refund' });
  await s.call(OWNER, { action: 'desk-reply', id, text: 'Done!', solve: true });
  assert.equal(s.chat(id).status, 'closed');
  const calls = s.state.aiCalls;
  const again = await s.call(STUDENT, { action: 'say', id, text: 'one more thing' });
  assert.equal(again.body.chat.status, 'waiting');
  assert.equal(s.state.aiCalls, calls);
  assert.equal(s.chat(id).solvedAt, null);
  assert.ok(s.state.emails.some(e => /Wrote again after it was solved/.test(e.subject)));
  // A chat only Knox Support handled stays with Knox Support after being closed.
  const bot = (await s.call(STUDENT, { action: 'say', text: 'how do I cancel' })).body.chat.id;
  await s.call(OWNER, { action: 'desk-status', id: bot, status: 'closed' });
  const r = await s.call(STUDENT, { action: 'say', id: bot, text: 'thanks' });
  assert.equal(r.body.chat.status, 'open');
  assert.equal(s.state.aiCalls, calls + 2);
});

test('Nothing is lost when the team writes while Knox Support is thinking', async () => {
  const s = await setup();
  const id = (await s.call(STUDENT, { action: 'say', text: 'hi' })).body.chat.id;
  s.state.beforeAiReturns = async () => {
    await s.call(OWNER, { action: 'desk-note', id, text: 'Looking into this' });
    await s.call(OWNER, { action: 'desk-assign', id, to: 'me' });
  };
  await s.call(STUDENT, { action: 'say', id, text: 'are you there?' });
  const c = s.chat(id);
  assert.equal(c.notes.filter(n => n.text === 'Looking into this').length, 1);
  assert.equal(c.assignedTo.uid, OWNER.uid);
  assert.deepEqual(c.messages.map(m => m.from), ['user', 'knox', 'user', 'knox']);
});

test('Students only see their own conversations; the desk is team-only', async () => {
  const s = await setup();
  const id = (await s.call(STUDENT, { action: 'say', text: 'hi' })).body.chat.id;
  assert.equal((await s.call(OTHER, { action: 'get', id })).code, 404);
  assert.equal((await s.call(OTHER, { action: 'say', id, text: 'x' })).code, 404);
  assert.equal((await s.call(OTHER, { action: 'list' })).body.chats.length, 0);
  for (const action of ['desk-list', 'desk-get', 'desk-reply', 'desk-team-save', 'desk-refund']) {
    assert.equal((await s.call(STUDENT, { action, id, text: 'x' })).code, 403, action);
  }
  // An unverified email on the owner's uid isn't the owner.
  assert.equal((await s.call({ ...OWNER, email_verified: false }, { action: 'desk-list' })).code, 403);
  assert.equal((await s.call({ uid: 'x' }, { action: 'nope' })).code, 400);
});

test('Owner adds a teammate; teammates can work the inbox but not refund or change the team unless allowed', async () => {
  const s = await setup({ users: { stu: { plan: 'super', stripeCustomerId: 'cus_stu', stripeSubscription: 'sub_1' } } });
  assert.equal((await s.call(OWNER, { action: 'desk-team-save', email: 'nobody@example.com' })).code, 404);
  assert.equal((await s.call(OWNER, { action: 'desk-team-save', email: 'Helper@Example.com', name: 'Hana' })).code, 200);
  const me = await s.call(AGENT, { action: 'desk-me' });
  assert.equal(me.body.me.role, 'agent');
  assert.equal(me.body.me.canRefund, false);
  assert.ok(me.body.replies.length > 0);
  const team = await s.call(AGENT, { action: 'desk-team' });
  assert.ok(team.body.team.some(a => a.uid === OWNER.uid && a.owner));
  assert.equal(team.body.team.find(a => a.uid === AGENT.uid).canRefund, undefined); // owner-only detail
  assert.equal((await s.call(AGENT, { action: 'desk-team-save', email: AGENT.email, canRefund: true })).code, 403);
  assert.equal((await s.call(AGENT, { action: 'desk-replies-save', list: [] })).code, 403);
  const id = (await s.call(STUDENT, { action: 'say', text: 'refund' })).body.chat.id;
  await s.call(STUDENT, { action: 'handoff', id, kind: 'refund' });
  const rep = await s.call(AGENT, { action: 'desk-reply', id, text: 'On it' });
  assert.equal(rep.body.chat.messages.at(-1).by, 'Hana');
  assert.equal((await s.call(AGENT, { action: 'desk-charges', id })).code, 403);
  // Given refund access, they can refund.
  await s.call(OWNER, { action: 'desk-team-save', email: AGENT.email, name: 'Hana', canRefund: true });
  assert.equal((await s.call(AGENT, { action: 'desk-charges', id })).code, 200);
  // Removed: locked out.
  await s.call(OWNER, { action: 'desk-team-remove', uid: AGENT.uid });
  assert.equal((await s.call(AGENT, { action: 'desk-list' })).code, 403);
  assert.equal((await s.call(OWNER, { action: 'desk-team-remove', uid: OWNER.uid })).code, 400);
});

test('Refunds: only this student\'s payment, once per payment, optional cancel, logged on the conversation', async () => {
  const s = await setup({ users: { stu: { plan: 'super', stripeCustomerId: 'cus_stu', stripeSubscription: 'sub_1' } } });
  const id = (await s.call(STUDENT, { action: 'say', text: 'refund' })).body.chat.id;
  const charges = await s.call(OWNER, { action: 'desk-charges', id });
  assert.equal(charges.body.charges[0].label, '$9.99');
  assert.equal(charges.body.charges[0].description, 'Plan payment');
  assert.equal((await s.call(OWNER, { action: 'desk-refund', id, chargeId: 'ch_not_theirs' })).code, 404);
  const r = await s.call(OWNER, { action: 'desk-refund', id, chargeId: 'ch_1', cancel: true });
  assert.equal(r.body.refunded, '$9.99');
  assert.equal(r.body.cancelled, true);
  assert.deepEqual(s.state.cancels, ['sub_1']);
  assert.equal(s.state.refunds[0].o.idempotencyKey, 'knox-desk-refund-ch_1');
  const c = s.chat(id);
  assert.equal(c.refunds.length, 1);
  assert.match(c.notes.at(-1).text, /Refunded \$9\.99 and cancelled their plan/);
  // A student who never paid has nothing to refund.
  const other = (await s.call(OTHER, { action: 'say', text: 'refund' })).body.chat.id;
  assert.equal((await s.call(OWNER, { action: 'desk-charges', id: other })).code, 404);
});

test('Daily limits, empty messages, and long conversations stay bounded', async () => {
  const s = await setup();
  assert.equal((await s.call(STUDENT, { action: 'say', text: '   ' })).code, 400);
  const id = (await s.call(STUDENT, { action: 'say', text: 'hi' })).body.chat.id;
  for (let i = 0; i < 39; i++) assert.equal((await s.call(STUDENT, { action: 'say', id, text: 'q' + i })).code, 200);
  const over = await s.call(STUDENT, { action: 'say', id, text: 'one too many' });
  assert.equal(over.code, 429);
  assert.equal(s.chat(id).messages.length, 80);
  // The cap keeps the newest 120 messages.
  const s2 = await setup();
  const id2 = (await s2.call(STUDENT, { action: 'say', text: 'x' })).body.chat.id;
  await s2.call(STUDENT, { action: 'handoff', id: id2, kind: 'human' });
  for (let i = 0; i < 130; i++) await s2.call(OWNER, { action: 'desk-reply', id: id2, text: 'r' + i });
  assert.equal(s2.chat(id2).messages.length, 120);
  assert.equal(s2.chat(id2).messages.at(-1).text, 'r129');
});

test('Knox Support failing still lets the student reach a person', async () => {
  const s = await setup();
  s.state.ai = () => { throw new Error('down'); };
  const r = await s.call(STUDENT, { action: 'say', text: 'help' });
  assert.equal(r.code, 200);
  assert.equal(r.body.action, 'human');
  assert.match(r.body.chat.messages.at(-1).text, /trouble/);
});

test('"Talk to a person" goes straight to the Knox team without a Knox Support reply', async () => {
  const s = await setup();
  let aiCalls = 0;
  s.state.ai = () => { aiCalls++; return 'Hi!'; };
  const r = await s.call(STUDENT, { action: 'say', text: 'Talk to a person', kind: 'human' });
  assert.equal(r.code, 200);
  assert.equal(aiCalls, 0);
  assert.equal(r.body.chat.status, 'waiting');
  assert.equal(s.chat(r.body.chat.id).kind, 'human');
  assert.ok(r.body.chat.messages.at(-1).note);
  assert.ok(s.state.emails.some(e => /Needs a person/.test(e.subject)));
});
