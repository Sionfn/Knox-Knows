import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
const source = readFileSync('support-widget.js', 'utf8');
const callCode = source.slice(source.indexOf('  async function call(body)'), source.indexOf('  // ── DOM'));
const chatCode = source.slice(source.indexOf('  async function openChat(id)'), source.indexOf('  function newChat()'));
function harness() {
  let resolve;
  const pending = new Promise(r => { resolve = r; });
  const ctx = {
    authEpoch: 0, viewEpoch: 0, current: { uid: 'alice', getIdToken: async () => 'token' },
    st: { chats: [], chat: null }, API: '/api/me', render() {},
    fetch: async () => ({ ok: true, json: () => pending }),
  };
  ctx.user = () => ctx.current;
  runInNewContext(callCode + chatCode + '\nthis.call = call; this.openChat = openChat;', ctx);
  return { ctx, resolve };
}
test('Support discards responses across account changes, even switching back to the same UID', async () => {
  const { ctx, resolve } = harness();
  const request = ctx.call({ action: 'get' });
  await Promise.resolve(); await Promise.resolve();
  ctx.authEpoch += 2;
  resolve({ chat: { id: 'private-alice' } });
  await assert.rejects(request, e => e.stale === true);
});
test('Leaving a Support conversation cannot reopen it when its response arrives', async () => {
  const { ctx, resolve } = harness();
  const request = ctx.openChat('old');
  await Promise.resolve(); await Promise.resolve();
  ctx.viewEpoch++; ctx.st.chat = null;
  resolve({ chat: { id: 'old', messages: [{ text: 'private' }] } });
  await request;
  assert.equal(ctx.st.chat, null);
});
test('Normal Support responses still render', async () => {
  const { ctx, resolve } = harness();
  const request = ctx.openChat('current');
  resolve({ chat: { id: 'current', messages: [] } });
  await request;
  assert.equal(ctx.st.chat.id, 'current');
});
