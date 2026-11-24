// api/_deck-community.js — the Flashcards Community: decks students publish
// for anyone to study. Reached through /api/me?route=deck-community.
//
// The same safety as the Simulation Lab's Community (api/_sim-community.js):
// authors are never shown ("by a Knox student"); every title, description and
// card is checked by OpenAI's moderation model; links, emails, phone numbers
// and @handles are refused; the student's own photos are never published (only
// Wikimedia pictures); 3 reports hide a deck until a person checks.
// Plus a fact check: before a deck goes public Knox looks for cards that are
// wrong. The student can fix them, or publish anyway without the
// "Checked by Knox" badge.
//
// Stored only through the Admin SDK (no client access in the Firestore rules):
//   publicDecks/{id}  { title, subject, grade, desc, cards, cardCount, uid, createdAt, adds, likes, reports, hidden, checked }
//   publicDecks/{id}/marks/{uid}  { liked, reported }
//
//   GET  ?sort=new|top|used&subject=&grade=&q=   → { decks: [{ id, title, subject, grade, desc, cardCount, adds, likes, checked, preview, mine }] }
//   GET  ?id=<id>                                → { deck: { …, cards, liked } }
//   POST { action: 'publish', title, subject, grade, desc, cards, ignoreFacts }  (signed in)
//        → { id }  or 409 { needsFix: [{ i, reason }] }
//   POST { action: 'add' | 'like' | 'report' | 'unpublish', id }
import crypto from "crypto";
import { cleanDeck } from "./_share-deck.js";

export const SUBJECTS = ["Math", "Biology", "Chemistry", "Physics", "Earth Science", "English", "Spanish", "French", "Other Languages", "US History", "World History", "Geography", "Government", "Economics", "Psychology", "Computer Science", "Art & Music", "Test Prep", "Other"];
export const GRADES = ["Elementary", "Middle school", "High school", "College", "Any"];
const ID = /^[A-Za-z0-9]{10}$/;
const PER_DAY = 10, HIDE_AT = 3, FACT_CHECK_MAX = 150;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const newId = () => Array.from(crypto.randomBytes(10), b => ALPHABET[b % ALPHABET.length]).join("");
const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const today = () => new Date().toISOString().slice(0, 10);
const CONTACT = /(https?:\/\/|www\.|\.(com|net|org|gg|io|me|co)\b|@[a-z0-9_]{3,}|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|\b(\d[\s.-]?){10,}\b)/i;

async function anyFlagged(texts) {
  // Moderation takes a list: send the deck in chunks so long decks are fully checked.
  const chunks = []; let cur = "";
  for (const t of texts) { if ((cur + "\n" + t).length > 3000) { chunks.push(cur); cur = ""; } cur += "\n" + t; }
  if (cur.trim()) chunks.push(cur);
  for (let i = 0; i < chunks.length; i += 32) {
    const r = await fetch("https://api.openai.com/v1/moderations", { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "omni-moderation-latest", input: chunks.slice(i, i + 32) }), signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error("moderation " + r.status);
    if ((await r.json()).results?.some(x => x.flagged)) return true;
  }
  return false;
}
// Knox looks for cards that are simply wrong (not style or spelling).
async function factCheck(title, subject, cards) {
  const list = cards.slice(0, FACT_CHECK_MAX).map((c, i) => `${i + 1}. ${c.front} → ${c.back}`).join("\n").slice(0, 40000);
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-6-luna", response_format: { type: "json_object" }, max_completion_tokens: 3000,
      messages: [{ role: "system", content: 'You check student flashcards before they are shared publicly. Find only cards whose answer is factually WRONG for the question (not spelling, style, short answers, or reasonable simplifications for school). Reply JSON {"wrong": [{"n": card number, "reason": "one short sentence saying what is wrong and the right answer"}]} — an empty list if they all look right.' },
        { role: "user", content: `Deck: ${title} (${subject})\n${list}` }] }),
    signal: AbortSignal.timeout(45000),
  });
  if (!r.ok) throw new Error("fact check " + r.status);
  const out = JSON.parse((await r.json()).choices?.[0]?.message?.content || "{}");
  return (Array.isArray(out.wrong) ? out.wrong : []).map(w => ({ i: Math.floor(Number(w.n)) - 1, reason: clean(w.reason, 200) })).filter(w => w.i >= 0 && w.i < cards.length).slice(0, 30);
}

export default async function deckCommunity(req, res, { db, auth }) {
  res.setHeader("Cache-Control", "no-store");
  const col = db.collection("publicDecks");
  let uid = null;
  const h = req.headers.authorization || "";
  if (h.startsWith("Bearer ")) { try { uid = (await auth.verifyIdToken(h.slice(7))).uid; } catch { return res.status(401).json({ error: "Please sign in again." }); } }

  if (req.method === "GET") {
    const id = String(req.query?.id || "");
    if (id) {
      if (!ID.test(id)) return res.status(400).json({ error: "That link isn't right." });
      const snap = await col.doc(id).get(), d = snap.exists ? snap.data() : null;
      if (!d || d.hidden) return res.status(404).json({ error: "That deck isn't available anymore." });
      const mark = uid ? await col.doc(id).collection("marks").doc(uid).get() : null;
      return res.status(200).json({ deck: { id, title: d.title, subject: d.subject, grade: d.grade, desc: d.desc, cards: d.cards, cardCount: d.cardCount, adds: d.adds || 0, likes: d.likes || 0, checked: !!d.checked, liked: !!mark?.data()?.liked, mine: d.uid === uid } });
    }
    const sort = req.query?.sort === "top" ? "likes" : req.query?.sort === "used" ? "adds" : "createdAt";
    const subject = SUBJECTS.includes(req.query?.subject) ? req.query.subject : "", grade = GRADES.includes(req.query?.grade) ? req.query.grade : "";
    const q = clean(req.query?.q, 60).toLowerCase();
    const snap = await col.orderBy(sort, "desc").limit(300).get();
    const decks = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(d => !d.hidden && (!subject || d.subject === subject) && (!grade || d.grade === grade || d.grade === "Any") && (!q || (d.title + " " + d.desc).toLowerCase().includes(q)))
      .slice(0, 60).map(d => ({ id: d.id, title: d.title, subject: d.subject, grade: d.grade, desc: d.desc, cardCount: d.cardCount, adds: d.adds || 0, likes: d.likes || 0, checked: !!d.checked, preview: (d.cards || []).slice(0, 2).map(c => c.front.slice(0, 80)), mine: d.uid === uid }));
    return res.status(200).json({ decks });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const body = req.body || {}, action = body.action, id = String(body.id || "");

  if (action === "add") {
    if (!ID.test(id)) return res.status(400).json({ error: "Bad id" });
    const { FieldValue } = await import("firebase-admin/firestore");
    await col.doc(id).update({ adds: FieldValue.increment(1) }).catch(() => {});
    return res.status(200).json({ ok: true });
  }
  if (!uid) return res.status(401).json({ error: "Sign in to do that." });

  if (action === "publish") {
    let deck;
    try { deck = cleanDeck(body.title, body.cards); } catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
    // Never publish a student's own photos (faces, homework, rooms): Wikimedia pictures only.
    deck.cards.forEach(c => { if (c.image && !/^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(c.image)) { delete c.image; delete c.imageCredit; } });
    if (deck.cards.length < 3) return res.status(400).json({ error: "Add at least 3 cards before publishing." });
    const subject = SUBJECTS.includes(body.subject) ? body.subject : "Other", grade = GRADES.includes(body.grade) ? body.grade : "Any", desc = clean(body.desc, 200);
    const texts = [deck.title, desc, ...deck.cards.flatMap(c => [c.front, c.back])];
    if (texts.some(t => CONTACT.test(t))) return res.status(400).json({ error: "Take out links, emails, phone numbers and @names — the Community is just for studying." });
    try { if (await anyFlagged(texts)) return res.status(400).json({ error: "Some words in this deck aren't allowed in the Community. Change them and try again." }); }
    catch (e) { console.error("deck-community moderation:", e.message); return res.status(503).json({ error: "Publishing is busy right now. Please try again in a minute." }); }
    let checked = false;
    if (!body.ignoreFacts) {
      try { const wrong = await factCheck(deck.title, subject, deck.cards); if (wrong.length) return res.status(409).json({ needsFix: wrong }); checked = deck.cards.length <= FACT_CHECK_MAX; }
      catch (e) { console.error("deck-community fact check:", e.message); } // a slow check doesn't block publishing; it just goes up without the badge
    }
    const capRef = db.collection("users").doc(uid).collection("usage").doc("deckPublish"), ref = col.doc(newId());
    const out = await db.runTransaction(async tx => {
      const cap = await tx.get(capRef), used = cap.exists && cap.data().day === today() ? cap.data().count || 0 : 0;
      if (used >= PER_DAY) return { error: `You can publish ${PER_DAY} decks a day. Try again tomorrow!`, code: 429 };
      tx.set(capRef, { day: today(), count: used + 1 });
      tx.set(ref, { ...deck, subject, grade, desc, cardCount: deck.cards.length, uid, createdAt: Date.now(), adds: 0, likes: 0, reports: 0, hidden: false, checked });
      return { id: ref.id, checked };
    });
    if (out.error) return res.status(out.code).json({ error: out.error });
    return res.status(200).json(out);
  }

  if (!ID.test(id)) return res.status(400).json({ error: "Bad id" });
  const ref = col.doc(id), markRef = ref.collection("marks").doc(uid);
  if (action === "like" || action === "report") {
    const out = await db.runTransaction(async tx => {
      const [snap, mark] = await Promise.all([tx.get(ref), tx.get(markRef)]);
      if (!snap.exists) return { error: "That deck isn't available anymore.", code: 404 };
      const m = mark.exists ? mark.data() : {}, d = snap.data();
      if (action === "like") { const liked = !m.liked, likes = Math.max(0, (d.likes || 0) + (liked ? 1 : -1)); tx.set(markRef, { liked }, { merge: true }); tx.update(ref, { likes }); return { liked, likes }; }
      if (m.reported) return { reported: true };
      const reports = (d.reports || 0) + 1;
      tx.set(markRef, { reported: true, reason: clean(body.reason, 120), at: Date.now() }, { merge: true });
      tx.update(ref, { reports, ...(reports >= HIDE_AT ? { hidden: true } : {}) });
      return { reported: true };
    });
    if (out.error) return res.status(out.code).json({ error: out.error });
    return res.status(200).json(out);
  }
  if (action === "unpublish") {
    const snap = await ref.get();
    if (!snap.exists || snap.data().uid !== uid) return res.status(403).json({ error: "You can only take down your own decks." });
    await ref.delete();
    return res.status(200).json({ ok: true });
  }
  return res.status(400).json({ error: "Unknown action." });
}
