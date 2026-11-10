// api/_notes.js — the Binder's notes (notes.js), saved per account.
// Served by api/me.js (?route=notes) to stay within Vercel's function limit;
// files starting with "_" aren't deployed as functions of their own.
//
// Notes live in users/{uid}/notes/{id} and are read and written only here,
// with the Admin SDK, so the Firestore rules don't need to open a new
// collection to the browser.
//
//   POST { action: 'list' }                         → { notes: [{ id, title, subject, snippet, updatedAt }] }
//   POST { action: 'get', id }                       → { note: { id, title, subject, html, updatedAt } }
//   POST { action: 'save', id?, title, subject, html } → { note: { id, updatedAt } }
//   POST { action: 'delete', id }                    → { ok: true }
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import crypto from "crypto";

const MAX_NOTES = 500;
const MAX_HTML = 120000;      // characters of the note's formatted text
const MAX_TITLE = 120;
const MAX_SUBJECT = 30;
const NOTE_ID = /^[A-Za-z0-9_-]{6,40}$/;

const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
// A short plain-text preview for the note cards.
const snippetOf = html => String(html || "").replace(/<\/?(br|p|div|li|ul|ol|h[1-6])\b[^>]*>/gi, " ").replace(/<[^>]+>/g, "")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/\s+/g, " ").trim().slice(0, 160);

export default async function notes(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return res.status(401).json({ error: "Sign in to save notes." });
  let uid;
  try { uid = (await getAuth().verifyIdToken(auth.slice(7))).uid; }
  catch { return res.status(401).json({ error: "Please sign in again." }); }

  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const col = getFirestore().collection("users").doc(uid).collection("notes");

  try {
    if (body.action === "list") {
      const snap = await col.orderBy("updatedAt", "desc").limit(MAX_NOTES).get();
      return res.status(200).json({ notes: snap.docs.map(d => { const n = d.data(); return { id: d.id, title: n.title || "", subject: n.subject || "", snippet: n.snippet || "", updatedAt: n.updatedAt || 0 }; }) });
    }

    const id = body.id == null ? null : String(body.id);
    if (id != null && !NOTE_ID.test(id)) return res.status(400).json({ error: "That note doesn't exist." });

    if (body.action === "get") {
      if (!id) return res.status(400).json({ error: "That note doesn't exist." });
      const snap = await col.doc(id).get();
      if (!snap.exists) return res.status(404).json({ error: "That note was deleted." });
      const n = snap.data();
      return res.status(200).json({ note: { id, title: n.title || "", subject: n.subject || "", html: n.html || "", updatedAt: n.updatedAt || 0 } });
    }

    if (body.action === "save") {
      const html = String(body.html ?? "");
      if (html.length > MAX_HTML) return res.status(413).json({ error: "This note is too long to save. Split it into two notes." });
      const now = Date.now();
      const note = { title: clean(body.title, MAX_TITLE) || "Untitled note", subject: clean(body.subject, MAX_SUBJECT), html, snippet: snippetOf(html), updatedAt: now };
      if (id) {
        const ref = col.doc(id);
        const exists = (await ref.get()).exists;
        if (!exists && (await col.count().get()).data().count >= MAX_NOTES) return res.status(409).json({ error: `You can keep up to ${MAX_NOTES} notes. Delete some old ones first.` });
        await ref.set({ ...note, ...(exists ? {} : { createdAt: now }) }, { merge: true });
        return res.status(200).json({ note: { id, updatedAt: now } });
      }
      if ((await col.count().get()).data().count >= MAX_NOTES) return res.status(409).json({ error: `You can keep up to ${MAX_NOTES} notes. Delete some old ones first.` });
      const newId = crypto.randomBytes(12).toString("base64url");
      await col.doc(newId).set({ ...note, createdAt: now });
      return res.status(200).json({ note: { id: newId, updatedAt: now } });
    }

    if (body.action === "delete") {
      if (!id) return res.status(400).json({ error: "That note doesn't exist." });
      await col.doc(id).delete();
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "Unknown action." });
  } catch (err) {
    console.error("Notes error:", err?.message);
    return res.status(500).json({ error: "Notes are busy right now. Please try again." });
  }
}
