// api/_share-deck.js — share a flashcard deck by link.
// Served by api/me.js (?route=share-deck) to stay within Vercel's function
// limit. Shared decks live in sharedDecks/{id}; the owner's link for each of
// their decks is remembered in users/{uid}/sharedDecks/{deckId}, so sharing the
// same deck again updates it and keeps the same link. Read and written only
// here with the Admin SDK, so the Firestore rules don't change.
//
//   GET  ?route=share-deck&id=<id>                         (anyone)    → { deck: { id, title, cards, cardCount, by, updatedAt } }
//   POST { action: 'share', deckId, title, cards }         (signed in) → { id, url }
//   POST { action: 'unshare', deckId }                     (signed in) → { ok: true }
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import crypto from "crypto";

const SITE = "https://www.knoxknowsapp.com";
const SHARE_ID = /^[A-Za-z0-9]{12}$/;
const DECK_ID = /^[A-Za-z0-9_-]{1,80}$/;
const IMAGE_URL = /^https:\/\/(upload|thumb)\.wikimedia\.org\/[^\s"'<>]+$/;
const IMAGE_DATA = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_CARDS = 300;
const MAX_BYTES = 900000;          // one Firestore record stays under 1 MB
const NEW_SHARES_PER_DAY = 30;     // keeps spam out; re-sharing a deck doesn't count

const text = (s, max) => String(s ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const newId = () => Array.from(crypto.randomBytes(12), b => ALPHABET[b % ALPHABET.length]).join("");

// The same checks as flashcards-core.js validateDeck, plus pictures.
export function cleanDeck(title, cards) {
  const t = text(title, 100);
  if (!t) throw Object.assign(new Error("Give the deck a title before sharing it."), { status: 400 });
  if (!Array.isArray(cards) || !cards.length) throw Object.assign(new Error("Add a card before sharing this deck."), { status: 400 });
  const out = cards.slice(0, MAX_CARDS).map(c => {
    const front = text(c?.front, 2000), back = text(c?.back, 4000);
    if (!front || !back) return null;
    const card = { front, back };
    const img = typeof c.image === "string" ? c.image : "";
    if (img && img.length <= 200000 && (IMAGE_URL.test(img) || IMAGE_DATA.test(img))) {
      card.image = img;
      const credit = text(c.imageCredit, 200);
      if (credit) card.imageCredit = credit;
    }
    return card;
  }).filter(Boolean);
  if (!out.length) throw Object.assign(new Error("Add a card before sharing this deck."), { status: 400 });
  // Too big with the student's own photos? Share it without them.
  let size = JSON.stringify(out).length;
  if (size > MAX_BYTES) {
    out.forEach(c => { if (c.image?.startsWith("data:")) { delete c.image; delete c.imageCredit; } });
    size = JSON.stringify(out).length;
  }
  if (size > MAX_BYTES) throw Object.assign(new Error("This deck is too big to share. Split it into smaller decks."), { status: 413 });
  return { title: t, cards: out };
}

export default async function shareDeck(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  const db = getFirestore();

  // Anyone with the link can see the deck.
  if (req.method === "GET") {
    const id = String(req.query?.id || "");
    if (!SHARE_ID.test(id)) return res.status(404).json({ error: "That deck link isn’t right. Ask for the link again." });
    try {
      const snap = await db.collection("sharedDecks").doc(id).get();
      const d = snap.exists ? snap.data() : null;
      if (!d || d.removed) return res.status(404).json({ error: "This deck isn’t shared anymore." });
      res.setHeader("Cache-Control", "public, max-age=30");
      return res.status(200).json({ deck: { id, title: d.title, cards: d.cards || [], cardCount: (d.cards || []).length, by: d.by || "", updatedAt: d.updatedAt || 0 } });
    } catch (err) {
      console.error("share-deck get failed", err);
      return res.status(503).json({ error: "Decks can’t be opened right now. Please try again." });
    }
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return res.status(401).json({ error: "Sign in to share a deck." });
  let uid, name = "";
  try {
    const token = await getAuth().verifyIdToken(auth.slice(7));
    uid = token.uid;
    name = text(String(token.name || "").split(/\s+/)[0], 40);
  } catch { return res.status(401).json({ error: "Please sign in again." }); }

  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const deckId = String(body.deckId || "");
  if (!DECK_ID.test(deckId)) return res.status(400).json({ error: "That deck can’t be shared." });
  const mine = db.collection("users").doc(uid).collection("sharedDecks").doc(deckId);

  try {
    if (body.action === "unshare") {
      const link = await mine.get();
      if (link.exists && SHARE_ID.test(link.data().shareId || "")) {
        await db.collection("sharedDecks").doc(link.data().shareId).set({ removed: true, cards: [], updatedAt: Date.now() }, { merge: true });
        await mine.delete();
      }
      return res.status(200).json({ ok: true });
    }

    if (body.action !== "share") return res.status(400).json({ error: "Unknown action." });
    const deck = cleanDeck(body.title, body.cards);
    const now = Date.now(), day = new Date(now).toISOString().slice(0, 10);
    const shareId = await db.runTransaction(async tx => {
      const link = await tx.get(mine);
      let id = link.exists ? link.data().shareId : null;
      if (id && SHARE_ID.test(id)) {
        const existing = await tx.get(db.collection("sharedDecks").doc(id));
        if (existing.exists && existing.data().owner === uid) {
          tx.set(existing.ref, { title: deck.title, cards: deck.cards, by: name, updatedAt: now, removed: false }, { merge: true });
          return id;
        }
      }
      // A new link: a few a day per account.
      const limitRef = db.collection("users").doc(uid).collection("meta").doc("deckShares");
      const limit = await tx.get(limitRef);
      const used = limit.exists && limit.data().day === day ? limit.data().count || 0 : 0;
      if (used >= NEW_SHARES_PER_DAY) throw Object.assign(new Error("You’ve shared a lot of decks today. Try again tomorrow."), { status: 429 });
      id = newId();
      tx.set(db.collection("sharedDecks").doc(id), { owner: uid, deckId, title: deck.title, cards: deck.cards, by: name, createdAt: now, updatedAt: now, removed: false });
      tx.set(mine, { shareId: id, createdAt: now });
      tx.set(limitRef, { day, count: used + 1 });
      return id;
    });
    return res.status(200).json({ id: shareId, url: `${SITE}/deck/${shareId}` });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error("share-deck failed", err);
    return res.status(503).json({ error: "The deck couldn’t be shared right now. Please try again." });
  }
}
