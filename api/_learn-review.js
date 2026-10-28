import crypto from 'crypto';

const DAY = 86400000;
const INTERVALS = [1, 3, 7, 14];
const MAX_SKILLS = 12;
const refFor = (db, uid) => db.collection('users').doc(uid).collection('learning').doc('review');
export const skillKey = label => crypto.createHash('sha256').update(String(label).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()).digest('hex').slice(0, 16);
export function learningAssessment(answer) {
  return /^\s*(?:[-*•]\s+)?Assessment\s*:\s*(new|correct|partial|retry|help)\s*$/im.exec(String(answer).replace(/\*\*/g,''))?.[1].toLowerCase() || '';
}
export function learningFocus(answer) {
  return clean(/^\s*(?:[-*•]\s+)?Review focus\s*:\s*(.+)$/im.exec(String(answer).replace(/\*\*/g,''))?.[1],160);
}
const clean = (text, max) => String(text || '').replace(/\*\*|`/g, '').trim().slice(0, max);
const safeLabel = label => typeof label === 'string' && label.length >= 3 && label.length <= 64 && /\p{L}/u.test(label) && !/[@<>|\n]|https?:|\.(?:pdf|docx?|pptx?)\b/i.test(label);
function itemsOf(data) {
  return (Array.isArray(data?.items) ? data.items : []).filter(item => item && safeLabel(item.label) && item.id === skillKey(item.label) &&
    typeof item.focus === 'string' && item.focus.length <= 160 && Number.isFinite(item.dueAt) && Number.isFinite(item.updatedAt))
    .slice(0, MAX_SKILLS).map(item => ({ id: item.id, label: item.label, focus: item.focus, dueAt: item.dueAt, updatedAt: item.updatedAt,
      stage: Math.max(0, Math.min(3, Math.trunc(Number(item.stage) || 0))), lastCorrectSession: String(item.lastCorrectSession || '').slice(0, 100),
      lastStruggleSession: String(item.lastStruggleSession || '').slice(0, 100), pending: item.pending === true }));
}
async function loadReviewData(db, uid) {
  const snap = await refFor(db, uid).get();
  const data = snap.exists ? snap.data() : {};
  return { enabled: data.enabled !== false, items: data.enabled === false ? [] : itemsOf(data) };
}
export async function loadLearnReview(db, uid) {
  return (await loadReviewData(db,uid)).items;
}
export function reviewGuidance(items) {
  if (!items.length) return '';
  return 'Optional practice history for this account (not a diagnosis or proof of current ability): ' +
    JSON.stringify(items.slice(0, 4).map(({ label, focus }) => ({ skill: label, practiceFocus: focus }))) +
    '. Use this only when directly relevant to the current request. Do not bring unrelated skills into the lesson or make the student repeat something their current answer already demonstrates. For a relevant review, start with a fresh application question and adjust from the actual answer; never assume they still make an old mistake.';
}
export async function recordLearnReview(db, uid, { answer, state, sessionId, question, lastKnox, now = Date.now(), startedAt = now }) {
  const assessment = learningAssessment(answer);
  if (!uid || !sessionId || !lastKnox || !state?.plan?.length || !['correct', 'partial', 'retry'].includes(assessment)) return;
  const label = clean(state.plan[state.part - 1], 64);
  if (!safeLabel(label)) return;
  const id = skillKey(label);
  const focus = learningFocus(answer);
  // Keep skill-level notes only, never a quoted worksheet, file name or contact.
  const safeFocus = focus && !/[@<>]|https?:|\.(?:pdf|docx?|pptx?)\b/i.test(focus) ? focus : 'Apply this idea to a fresh example and explain the key step.';
  const progress = /^\s*Progress:\s*(\d+)\/(\d+)\s*$/im.exec(answer);
  const completed = /^\s*Recap:/im.test(answer) || (progress && Number(progress[1]) > state.part);
  if (assessment === 'correct' && !completed) return; // a substep is not skill mastery
  const event = crypto.createHash('sha256').update(sessionId + '\0' + lastKnox + '\0' + question).digest('hex');
  await db.runTransaction(async tx => {
    const ref = refFor(db, uid), snap = await tx.get(ref), data = snap.exists ? snap.data() : {};
    if (data.enabled === false || (Number.isFinite(data.resetAt) && startedAt <= data.resetAt)) return;
    const removed = (Array.isArray(data.removed) ? data.removed : []).filter(v => /^[a-f0-9]{16}$/.test(v?.id || '') && Number.isFinite(v.at)).slice(-12);
    if (removed.some(v => v.id === id && startedAt <= v.at)) return; // don't resurrect a topic removed during this request
    const events = (Array.isArray(data.events) ? data.events : []).filter(v => typeof v === 'string').slice(-39);
    if (events.includes(event)) return;
    const items = itemsOf(data), old = items.find(item => item.id === id);
    if (assessment === 'correct' && !old) return; // don't create a dossier of every correct answer
    let next;
    if (assessment === 'partial' || assessment === 'retry') {
      next = { id, label, focus: safeFocus, dueAt: now, updatedAt: now, stage: 0, pending: true,
        lastCorrectSession: old?.lastCorrectSession || '', lastStruggleSession: sessionId };
    } else {
      if (old.lastCorrectSession === sessionId && !old.pending) return;
      const stage = old.pending || old.lastStruggleSession === sessionId ? 0 : now >= old.dueAt ? Math.min(3, old.stage + 1) : old.stage;
      next = { ...old, dueAt: now + INTERVALS[stage] * DAY, updatedAt: now, stage, pending: false, lastCorrectSession: sessionId };
    }
    tx.set(ref, { enabled: true, resetAt: Number(data.resetAt) || 0, items: [next, ...items.filter(item => item.id !== id)].sort((a,b) => b.updatedAt-a.updatedAt).slice(0, MAX_SKILLS), events: [...events,event], removed: removed.filter(v => v.id !== id) });
  });
}

export async function learnReviewRoute(req, res, { db, auth }) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ error: 'Method not allowed.' }); }
  const bearer = /^Bearer\s+(.+)$/i.exec(req.headers?.authorization || '')?.[1];
  if (!bearer) return res.status(401).json({ error: 'Sign in to see your review topics.' });
  let uid;
  try { uid = (await auth.verifyIdToken(bearer)).uid; } catch { return res.status(401).json({ error: 'Please sign in again.' }); }
  if (!uid) return res.status(401).json({ error: 'Please sign in again.' });
  try {
    if (req.method === 'POST') {
      const body = req.body;
      const setting = body && Object.keys(body).length === 1 && typeof body.enabled === 'boolean';
      if (!body || typeof body !== 'object' || Array.isArray(body) || (!setting && (Object.keys(body).some(k => k !== 'remove') || typeof body.remove !== 'string' || !/^[a-f0-9]{16}$/.test(body.remove)))) {
        return res.status(400).json({ error: 'Choose a review topic to remove.' });
      }
      await db.runTransaction(async tx => {
        const ref = refFor(db, uid), snap = await tx.get(ref), data = snap.exists ? snap.data() : {};
        if (setting) {
          tx.set(ref, {enabled:body.enabled,items:[],events:[],removed:[],resetAt:Date.now()});
          return;
        }
        const items = itemsOf(data);
        if (!items.some(item => item.id === body.remove)) return;
        const removed = (Array.isArray(data.removed) ? data.removed : []).filter(v => v.id !== body.remove).slice(-11);
        tx.set(ref, { enabled:data.enabled !== false, resetAt:Number(data.resetAt)||0, items: items.filter(item => item.id !== body.remove), events: Array.isArray(data.events) ? data.events.slice(-40) : [], removed: [...removed,{id:body.remove,at:Date.now()}] });
      });
    }
    const {items,enabled} = await loadReviewData(db, uid);
    return res.status(200).json({ enabled, items: items.map(({id,label,focus,dueAt}) => ({id,label,focus,dueAt})) });
  } catch { return res.status(503).json({ error: 'Review topics are temporarily unavailable. You can still start a lesson.' }); }
}
