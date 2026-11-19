// Talk to Knox (the app's mic button): turns a short recording into text so it
// can be sent like a typed question. The audio is only passed through to
// OpenAI for this one request; Knox never saves it.
const MAX_BASE64 = 4_000_000; // about 3 MB of audio, well over the app's 60-second limit
export const DAILY_VOICE_LIMIT = 60;
const EXT = { 'audio/mp4': 'mp4', 'audio/m4a': 'm4a', 'audio/x-m4a': 'm4a', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/wav': 'wav' };
const MODELS = ['gpt-4o-mini-transcribe', 'whisper-1'];

async function useOne(db, uid, now = new Date()) {
  const ref = db.collection('voiceUsage').doc(uid), day = now.toISOString().slice(0, 10);
  return db.runTransaction(async tx => {
    const data = (await tx.get(ref)).data() || {};
    const count = data.day === day ? data.count || 0 : 0;
    if (count >= DAILY_VOICE_LIMIT) return false;
    tx.set(ref, { day, count: count + 1 });
    return true;
  });
}

async function toText(audio, ext) {
  for (const model of MODELS) {
    const form = new FormData();
    form.append('file', new Blob([audio]), 'question.' + ext);
    form.append('model', model);
    const reply = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY }, body: form, signal: AbortSignal.timeout(25000),
    });
    if (reply.ok) return String((await reply.json()).text || '').trim().slice(0, 4000);
    if (![400, 404].includes(reply.status) || model === MODELS.at(-1)) throw Error('Transcription failed: ' + reply.status);
  }
  return '';
}

export default async function transcribe(req, res, { db, auth }) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'GET') return res.status(200).json({ transcriptionAvailable: Boolean(process.env.OPENAI_API_KEY) });
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'Sign in to talk to Knox.' });
  let uid;
  try { uid = (await auth.verifyIdToken(header.slice(7))).uid; }
  catch { return res.status(401).json({ error: 'Sign in to talk to Knox.' }); }

  const { audio, type } = req.body && typeof req.body === 'object' ? req.body : {};
  const ext = EXT[String(type || '').split(';')[0].trim().toLowerCase()];
  if (typeof audio !== 'string' || !audio || audio.length > MAX_BASE64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(audio) || !ext) {
    return res.status(400).json({ error: 'That recording could not be read. Try again.' });
  }
  try {
    if (!(await useOne(db, uid))) return res.status(429).json({ error: 'You’ve used voice a lot today. You can still type your question.' });
    return res.status(200).json({ text: await toText(Buffer.from(audio, 'base64'), ext) });
  } catch (e) {
    console.error('Voice transcription failed:', e?.name || 'error'); // never log the student's words
    return res.status(502).json({ error: 'Knox couldn’t hear that. Try again, or type your question.' });
  }
}
