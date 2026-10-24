// /api/discord-link.js — connects a Discord account to a Knox Knows account,
// so the Discord bot can tell who has Knox Plus.
//
//   Student (signed in, from /app?discord=<code>):
//     POST { code } with "Authorization: Bearer <Firebase ID token>"
//     → links the Discord account in the code to this Knox account (a first
//       link also unlocks the 🟢 Slime Flame for their streak)
//     POST { action: 'flame', style: 'slime' | 'classic' } → turn the Slime Flame
//       on or off (only with a linked Discord)
//   Discord bot (X-Knox-Bot-Key, same key as /api/ask):
//     POST { action: 'status', discordIds: [...] } → { results: { id: { linked, plus } } }
//
// The bot makes the code: "<discordId>.<expiry seconds>.<signature>", signed
// with KNOX_BOT_KEY, so nobody can forge a link for someone else's Discord.
// One Discord account per Knox account (and vice versa): linking again moves it.

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import crypto from "crypto";

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const adminAuth = getAdminAuth();
const db        = getFirestore();

const DISCORD_ID = /^\d{15,25}$/;
const isPlus = plan => plan === "super" || plan === "max" || plan === "plus"; // same allowlist as api/ask.js

function botKey() {
  const key = (process.env.KNOX_BOT_KEY || "").trim();
  return key.length >= 32 ? key : null; // unset or weak = Discord features off
}

function isValidBotKey(provided) {
  const expected = botKey();
  if (!expected || typeof provided !== "string") return false;
  const hash = value => crypto.createHash("sha256").update(value).digest();
  return crypto.timingSafeEqual(hash(provided), hash(expected));
}

// Returns the Discord ID inside a valid, unexpired code, or null.
export function readLinkCode(code, key = botKey(), now = Date.now()) {
  if (!key || typeof code !== "string" || code.length > 200) return null;
  const [discordId, expires, signature] = code.split(".");
  if (!DISCORD_ID.test(discordId || "") || !/^\d+$/.test(expires || "") || !signature) return null;
  if (Number(expires) * 1000 < now) return null;
  const expected = crypto.createHmac("sha256", key).update(`discord-link:${discordId}:${expires}`).digest("base64url");
  const a = Buffer.from(signature), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? discordId : null;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};

  try {
    if (req.headers["x-knox-bot-key"] != null) {
      if (!isValidBotKey(req.headers["x-knox-bot-key"])) return res.status(401).json({ error: "Unauthorized" });
      if (body.action !== "status") return res.status(400).json({ error: "Unknown action." });
      const ids = Array.isArray(body.discordIds) ? body.discordIds : [];
      if (!ids.length || ids.length > 100 || !ids.every(id => DISCORD_ID.test(String(id)))) {
        return res.status(400).json({ error: "Send 1 to 100 Discord IDs." });
      }
      return res.status(200).json({ results: Object.fromEntries(await Promise.all(ids.map(async id => [id, await status(String(id))]))) });
    }

    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) return res.status(401).json({ error: "Please sign in to Knox Knows first." });
    let uid;
    try { uid = (await adminAuth.verifyIdToken(authHeader.slice(7))).uid; }
    catch { return res.status(401).json({ error: "Please sign in again." }); }

    // 🟢 Slime Flame on/off (profile menu): only for an account with a linked Discord.
    if (body.action === "flame") {
      if (!["slime", "classic"].includes(body.style)) return res.status(400).json({ error: "Unknown flame." });
      const userRef = db.collection("users").doc(uid);
      const out = await db.runTransaction(async tx => {
        const snap = await tx.get(userRef);
        if (body.style === "slime" && !(snap.exists && snap.data().discordId)) return null;
        tx.set(userRef, { flameStyle: body.style }, { merge: true });
        return body.style;
      });
      if (!out) return res.status(403).json({ error: "Join the Knox Discord and type /link to unlock the Slime Flame." });
      return res.status(200).json({ ok: true, flameStyle: out });
    }

    const discordId = readLinkCode(body.code);
    if (!discordId) return res.status(400).json({ error: "This link has expired or isn't valid. Run /link in Discord to get a new one." });
    const { plus, slime } = await link(uid, discordId);
    console.log(`✓ Discord linked: uid=${uid} plus=${plus}`);
    return res.status(200).json({ ok: true, plus, slime });
  } catch (err) {
    console.error("Discord link error:", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}

async function status(discordId) {
  const account = await db.collection("discordAccounts").doc(discordId).get();
  if (!account.exists) return { linked: false, plus: false };
  const user = await db.collection("users").doc(account.data().uid).get();
  // The user doc is the source of truth: a stale mapping (they linked a
  // different Discord since) counts as not linked.
  if (!user.exists || user.data().discordId !== discordId) return { linked: false, plus: false };
  return { linked: true, plus: isPlus(user.data().plan) };
}

async function link(uid, discordId) {
  const userRef    = db.collection("users").doc(uid);
  const accountRef = db.collection("discordAccounts").doc(discordId);
  return db.runTransaction(async tx => {
    const [userSnap, accountSnap] = await Promise.all([tx.get(userRef), tx.get(accountRef)]);
    const user = userSnap.exists ? userSnap.data() : {};
    const previousOwner = accountSnap.exists ? accountSnap.data().uid : null;
    // This Discord was linked to a different Knox account: unlink it there.
    if (previousOwner && previousOwner !== uid) {
      tx.set(db.collection("users").doc(previousOwner), { discordId: FieldValue.delete() }, { merge: true });
    }
    // This Knox account was linked to a different Discord: drop that link.
    if (user.discordId && user.discordId !== discordId) tx.delete(db.collection("discordAccounts").doc(user.discordId));
    // A first link unlocks the 🟢 Slime Flame and puts it on their streak right away.
    const slime = !user.discordId;
    tx.set(userRef, { discordId, ...(slime ? { flameStyle: "slime" } : {}) }, { merge: true });
    tx.set(accountRef, { uid, linkedAt: new Date().toISOString() });
    return { plus: isPlus(user.plan), slime };
  });
}
