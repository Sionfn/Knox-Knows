import test from 'node:test';
import assert from 'node:assert/strict';
import transcribe, { DAILY_VOICE_LIMIT } from '../api/_transcribe.js';

const reply = () => ({ code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } });
const fakeDb = store => ({ collection: () => ({ doc: id => ({ id }) }), runTransaction: fn => fn({ get: async r => ({ data: () => store[r.id] }), set: (r, v) => { store[r.id] = v; } }) });
const auth = { verifyIdToken: async t => { if (t !== 'good') throw Error('bad'); return { uid: 'student' }; } };
const req = (body, token = 'good') => ({ method: 'POST', headers: token ? { authorization: 'Bearer ' + token } : {}, body });
const audio = Buffer.from('fake audio').toString('base64');
const realFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = realFetch; });
const okModel = text => { globalThis.fetch = async () => new Response(JSON.stringify({ text }), { status: 200 }); };

test('voice availability is readable before asking for microphone access', async () => {
  const res = reply();
  await transcribe({ method: 'GET' }, res, {});
  assert.equal(res.code, 200);
  assert.equal(res.body.transcriptionAvailable, Boolean(process.env.OPENAI_API_KEY));
});

test('a signed-in student gets their words back and the use is counted', async () => {
  okModel(' What is 2 + 2? '); const store = {}, res = reply();
  await transcribe(req({ audio, type: 'audio/mp4;codecs=mp4a.40.2' }), res, { db: fakeDb(store), auth });
  assert.equal(res.code, 200); assert.equal(res.body.text, 'What is 2 + 2?'); assert.equal(store.student.count, 1);
});
test('signed-out or invalid tokens never reach OpenAI', async () => {
  globalThis.fetch = async () => { throw Error('should not run'); };
  for (const token of [null, 'bad']) { const res = reply(); await transcribe(req({ audio, type: 'audio/mp4' }, token), res, { db: fakeDb({}), auth }); assert.equal(res.code, 401); }
});
test('bad recordings are refused before any cost', async () => {
  globalThis.fetch = async () => { throw Error('should not run'); }; const store = {};
  for (const body of [{ type: 'audio/mp4' }, { audio, type: 'text/html' }, { audio: 'not base64!', type: 'audio/mp4' }, { audio: 'A'.repeat(4_000_001), type: 'audio/mp4' }, null]) {
    const res = reply(); await transcribe(req(body), res, { db: fakeDb(store), auth }); assert.equal(res.code, 400);
  }
  assert.deepEqual(store, {});
});
test('the daily limit stops further transcriptions', async () => {
  globalThis.fetch = async () => { throw Error('should not run'); };
  const store = { student: { day: new Date().toISOString().slice(0, 10), count: DAILY_VOICE_LIMIT } }, res = reply();
  await transcribe(req({ audio, type: 'audio/webm' }), res, { db: fakeDb(store), auth }); assert.equal(res.code, 429);
});
test('falls back to the second model, and a failure gives a friendly error', async () => {
  const models = []; globalThis.fetch = async (_, o) => { models.push(o.body.get('model')); return models.length === 1 ? new Response('{}', { status: 404 }) : new Response(JSON.stringify({ text: 'hi' }), { status: 200 }); };
  let res = reply(); await transcribe(req({ audio, type: 'audio/mp4' }), res, { db: fakeDb({}), auth });
  assert.deepEqual(models, ['gpt-4o-mini-transcribe', 'whisper-1']); assert.equal(res.body.text, 'hi');
  globalThis.fetch = async () => new Response('{}', { status: 500 }); res = reply(); await transcribe(req({ audio, type: 'audio/mp4' }), res, { db: fakeDb({}), auth });
  assert.equal(res.code, 502); assert.match(res.body.error, /type your question/);
});
