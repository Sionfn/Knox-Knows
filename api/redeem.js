// /api/redeem.js — use a Mega Knox gift code.
//
// GET           → { gifts: [codes you bought], plusUntil }
// POST { code } → adds the gift's days of Mega Knox to your account
//
// Works for bought gift cards (KNOX-XXXX-XXXX-XXXX), codes made on the admin
// page, and Flame Fest friend links (8 characters). Gift Mega Knox is time-limited
// Mega Knox (users/{uid}.plusUntil) — no subscription, nothing renews. Someone who
// already has Mega Knox (paid or comped) is asked to keep the code for later.
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { normalizeCode } from "./_gifts.js";

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

const DAY_MS = 86400000;
const TRIES_PER_HOUR = 10; // stops anyone guessing codes
const isPaid = d => ["super", "max", "plus"].includes(d?.plan) || d?.comped === true;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) return res.status(401).json({ error: "Sign in to use a gift code." });
  let uid;
  try { uid = (await adminAuth.verifyIdToken(authHeader.slice(7))).uid; }
  catch { return res.status(401).json({ error: "Please sign in again." }); }
  const userRef = db.collection("users").doc(uid);

  try {
    if (req.method === "GET") {
      const snap = await userRef.get();
      const data = snap.exists ? snap.data() : {};
      return res.status(200).json({ gifts: Array.isArray(data.giftsBought) ? data.giftsBought : [], plusUntil: Number(data.plusUntil) || 0 });
    }

    // Limit tries (a wrong code counts too) before looking anything up.
    const triesRef = userRef.collection("usage").doc("redeem");
    const allowed = await db.runTransaction(async tx => {
      const snap = await tx.get(triesRef);
      const now = Date.now(), d = snap.exists ? snap.data() : {};
      const fresh = !d.windowStart || now - d.windowStart > 3600000;
      const count = fresh ? 0 : d.count || 0;
      if (count >= TRIES_PER_HOUR) return false;
      tx.set(triesRef, { windowStart: fresh ? now : d.windowStart, count: count + 1 });
      return true;
    });
    if (!allowed) return res.status(429).json({ error: "Too many tries — please wait an hour and try again." });

    const code = normalizeCode(req.body?.code);
    if (!code) return res.status(400).json({ error: "That doesn't look like a Knox gift code. Check it and try again." });
    const giftRef = db.collection("giftCodes").doc(code);
    const out = await db.runTransaction(async tx => {
      const [gift, snap] = await Promise.all([tx.get(giftRef), tx.get(userRef)]);
      const data = snap.exists ? snap.data() : {};
      if (!gift.exists) return { error: "That code isn't valid. Check it and try again.", code: 404 };
      const g = gift.data();
      if (g.disabled) return { error: "This gift code was canceled. Ask the person who gave it to you.", code: 410 };
      if (g.redeemedBy) return { error: g.redeemedBy === uid ? "You already used this code." : "This code was already used.", code: 409 };
      const flameLink = g.source === "flamefest";
      if (flameLink && g.from === uid) return { error: "That's your own gift — send the link to a friend!", code: 400 };
      if (isPaid(data)) return { error: "You already have Mega Knox! Save this code for later, or give it to a friend — it never expires.", code: 409 };
      if (flameLink && data.giftRedeemedAt) return { error: "You've already used a Flame Fest gift.", code: 409 };
      const days = Math.max(1, Math.min(400, Number(g.days) || 7));
      const plusUntil = Math.max(Date.now(), Number(data.plusUntil) || 0) + days * DAY_MS; // stacks with time left
      const at = new Date().toISOString();
      tx.set(giftRef, { redeemedBy: uid, redeemedAt: at }, { merge: true });
      tx.set(userRef, { plusUntil, ...(flameLink ? { giftRedeemedAt: at } : {}) }, { merge: true });
      return { plusUntil, days };
    });
    if (out.error) return res.status(out.code).json({ error: out.error });
    return res.status(200).json({ redeemed: true, days: out.days, plusUntil: out.plusUntil });
  } catch (err) {
    console.error("Redeem error:", err?.message);
    return res.status(503).json({ error: "Couldn't check that code right now. Please try again in a moment." });
  }
}
