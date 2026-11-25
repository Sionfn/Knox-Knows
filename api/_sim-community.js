// api/_sim-community.js — the Simulation Lab's Community: simulations students
// publish for anyone to play. Reached through /api/me?route=sim-community.
//
// Safety first (students of every age use Knox):
//   • authors are never shown — every sim says "by a Knox student";
//   • every title, description, name and label is checked by OpenAI's
//     moderation model, and links, emails and phone numbers are refused;
//   • anyone signed in can report one; 3 reports hide it until a person checks.
// Stored only through the Admin SDK (the Firestore rules allow no client access):
//   publicSims/{id}  { type, values, title, desc, uid, createdAt, plays, likes, reports, hidden }
//   publicSims/{id}/marks/{uid}  { liked, reported }
//
//   GET  ?sort=new|played|top         → { sims: [{ id, type, title, desc, plays, likes, createdAt, mine }] }
//   GET  ?id=<id>                     → { sim: { id, type, values, title, desc, plays, likes, liked } }
//   POST { action: 'publish', sim: { type, values, title, desc } }   (signed in) → { id }
//   POST { action: 'play' | 'like' | 'report' | 'unpublish', id }
import crypto from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { SIM_CATALOG } from "./_sim-build.js";

const ID = /^[A-Za-z0-9]{10}$/;
const PER_DAY = 10;
const HIDE_AT = 3;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const newId = () => Array.from(crypto.randomBytes(10), b => ALPHABET[b % ALPHABET.length]).join("");
const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const today = () => new Date().toISOString().slice(0, 10);
const TYPES = new Set([...SIM_CATALOG.map(s => s[0]), "custom"]);
// No ways to reach someone: links, emails, phone numbers, @handles.
const CONTACT = /(https?:\/\/|www\.|\.(com|net|org|gg|io|me|co)\b|@[a-z0-9_]{3,}|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|(\d[\s.-]?){7,})/i;

// Every bit of text a sim shows: title, description, names, labels, equations.
function textOf(sim) {
  const out = [sim.title, sim.desc];
  (function walk(v, depth) { if (depth > 6 || v == null) return; if (typeof v === "string") out.push(v); else if (Array.isArray(v)) v.forEach(x => walk(x, depth + 1)); else if (typeof v === "object") Object.values(v).forEach(x => walk(x, depth + 1)); })(sim.values, 0);
  return out.filter(Boolean).join("\n").slice(0, 8000);
}
async function flagged(text) {
  const r = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "omni-moderation-latest", input: text }), signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error("moderation " + r.status);
  return !!(await r.json()).results?.some(x => x.flagged);
}

export default async function simCommunity(req, res, { db, auth }) {
  res.setHeader("Cache-Control", "no-store");
  const col = db.collection("publicSims");
  let uid = null;
  const h = req.headers.authorization || "";
  if (h.startsWith("Bearer ")) { try { uid = (await auth.verifyIdToken(h.slice(7))).uid; } catch { return res.status(401).json({ error: "Please sign in again." }); } }

  if (req.method === "GET") {
    const id = String(req.query?.id || "");
    if (id) {
      if (!ID.test(id)) return res.status(400).json({ error: "That link isn't right." });
      const snap = await col.doc(id).get();
      const d = snap.exists ? snap.data() : null;
      if (!d || d.hidden) return res.status(404).json({ error: "That simulation isn't available anymore." });
      const mark = uid ? await col.doc(id).collection("marks").doc(uid).get() : null;
      return res.status(200).json({ sim: { id, type: d.type, values: d.values, title: d.title, desc: d.desc, plays: d.plays || 0, likes: d.likes || 0, liked: !!mark?.data()?.liked, mine: d.uid === uid } });
    }
    const sort = req.query?.sort === "top" ? "likes" : req.query?.sort === "played" ? "plays" : "createdAt";
    // One-field ordering (no composite index needed); hidden ones are skipped here.
    const snap = await col.orderBy(sort, "desc").limit(120).get();
    return res.status(200).json({ sims: snap.docs.filter(d => !d.data().hidden).slice(0, 60).map(d => { const x = d.data(); return { id: d.id, type: x.type, title: x.title, desc: x.desc, plays: x.plays || 0, likes: x.likes || 0, createdAt: x.createdAt, mine: x.uid === uid }; }) });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const body = req.body || {}, action = body.action, id = String(body.id || "");

  if (action === "play") {
    if (!ID.test(id)) return res.status(400).json({ error: "Bad id" });
    await col.doc(id).update({ plays: FieldValue.increment(1) }).catch(() => {});
    return res.status(200).json({ ok: true });
  }
  if (!uid) return res.status(401).json({ error: "Sign in to do that." });

  if (action === "publish") {
    const sim = body.sim || {};
    const type = String(sim.type || "");
    if (!TYPES.has(type)) return res.status(400).json({ error: "That simulation can't be published." });
    const title = clean(sim.title, 40), desc = clean(sim.desc, 200);
    if (title.length < 3) return res.status(400).json({ error: "Give it a title (at least 3 letters)." });
    const json = JSON.stringify(sim.values ?? {});
    if (json.length > 20000) return res.status(413).json({ error: "That simulation is too big to publish." });
    const values = JSON.parse(json.replace(/[<>]/g, ""));
    const text = textOf({ title, desc, values });
    if (CONTACT.test(text)) return res.status(400).json({ error: "Take out links, emails, phone numbers and @names — the Community is just for simulations." });
    try { if (await flagged(text)) return res.status(400).json({ error: "Some words in it aren't allowed in the Community. Change the title, description or names and try again." }); }
    catch (e) { console.error("sim-community moderation:", e.message); return res.status(503).json({ error: "Publishing is busy right now. Please try again in a minute." }); }
    const capRef = db.collection("users").doc(uid).collection("usage").doc("simPublish");
    const newRef = col.doc(newId());
    const out = await db.runTransaction(async tx => {
      const cap = await tx.get(capRef), used = cap.exists && cap.data().day === today() ? cap.data().count || 0 : 0;
      if (used >= PER_DAY) return { error: `You can publish ${PER_DAY} simulations a day. Try again tomorrow!`, code: 429 };
      tx.set(capRef, { day: today(), count: used + 1 });
      tx.set(newRef, { type, values, title, desc, uid, createdAt: Date.now(), plays: 0, likes: 0, reports: 0, hidden: false });
      return { id: newRef.id };
    });
    if (out.error) return res.status(out.code).json({ error: out.error });
    return res.status(200).json({ id: out.id });
  }

  if (!ID.test(id)) return res.status(400).json({ error: "Bad id" });
  const ref = col.doc(id), markRef = ref.collection("marks").doc(uid);
  if (action === "like" || action === "report") {
    const out = await db.runTransaction(async tx => {
      const [snap, mark] = await Promise.all([tx.get(ref), tx.get(markRef)]);
      if (!snap.exists) return { error: "That simulation isn't available anymore.", code: 404 };
      const m = mark.exists ? mark.data() : {}, d = snap.data();
      if (action === "like") { const liked = !m.liked; tx.set(markRef, { liked }, { merge: true }); tx.update(ref, { likes: Math.max(0, (d.likes || 0) + (liked ? 1 : -1)) }); return { liked, likes: Math.max(0, (d.likes || 0) + (liked ? 1 : -1)) }; }
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
    if (!snap.exists || snap.data().uid !== uid) return res.status(403).json({ error: "You can only take down your own simulations." });
    await ref.delete();
    return res.status(200).json({ ok: true });
  }
  return res.status(400).json({ error: "Unknown action." });
}
