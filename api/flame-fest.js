// /api/flame-fest.js — Flame Fest, Knox's November 2026 study event.
//
// Every day a student studies in November lights a flame on their calendar
// (api/ask.js saves the day in users/{uid}.flameFest.days, using the same
// day as the 🔥 streak). Lighting enough flames in a week, or in the whole
// month, unlocks a reward the student claims here.
//
// GET  → { event, rewards, days, shielded, claimed, shields, flameStyle, flameStyles, plusUntil }
// POST { claim: 'w1' | 'w2' | 'w3' | 'w4' | 'month' } → same shape, reward applied
// POST { style: 'classic' | 'blue' | 'gold' }          → pick an unlocked flame look
//
// Everything is checked and written here with the Admin SDK — the Firestore
// rules don't let the browser touch these fields.
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

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

// Keep the dates in sync with FLAME_FEST_START/END in api/ask.js.
const EVENT = { name: "Flame Fest", start: "2026-11-01", end: "2026-11-30", claimUntil: "2026-12-07" };
const REWARDS = [
  { id: "w1", name: "Spark",    start: "2026-11-01", end: "2026-11-07", need: 4,  gives: { bonus: 10 },              label: "+10 bonus questions" },
  { id: "w2", name: "Kindling", start: "2026-11-08", end: "2026-11-14", need: 4,  gives: { shields: 1 },             label: "🛡️ Flame Shield" },
  { id: "w3", name: "Blaze",    start: "2026-11-15", end: "2026-11-21", need: 4,  gives: { bonus: 10, style: "blue" }, label: "+10 bonus questions + 💙 Blue Flame" },
  { id: "w4", name: "Bonfire",  start: "2026-11-22", end: "2026-11-28", need: 3,  gives: { shields: 1 },             label: "🛡️ Flame Shield" },
  { id: "month", name: "Phoenix", start: "2026-11-01", end: "2026-11-30", need: 20, gives: { plusDays: 7, style: "gold" }, label: "7 days of Knox Plus + 👑 Golden Flame" },
];
const STYLES = ["classic", "blue", "gold"];
const FREE_STARTING_BALANCE = 10; // keep in sync with api/ask.js
const DAY_MS = 86400000;

const utcDay = () => new Date().toISOString().slice(0, 10);
const flamesIn = (days, r) => days.filter(d => d >= r.start && d <= r.end).length;

function status(data) {
  const fest = data.flameFest && typeof data.flameFest === "object" ? data.flameFest : {};
  const days = Array.isArray(fest.days) ? fest.days.filter(d => typeof d === "string") : [];
  return {
    event: EVENT,
    rewards: REWARDS.map(({ gives, ...r }) => ({ ...r, flames: flamesIn(days, r) })),
    days,
    shielded: Array.isArray(fest.shielded) ? fest.shielded : [],
    claimed: fest.claimed && typeof fest.claimed === "object" ? fest.claimed : {},
    shields: Math.max(0, Math.floor(Number(data.flameShields) || 0)),
    flameStyle: STYLES.includes(data.flameStyle) ? data.flameStyle : "classic",
    flameStyles: ["classic", ...(Array.isArray(data.flameStyles) ? data.flameStyles.filter(s => STYLES.includes(s) && s !== "classic") : [])],
    plusUntil: Number(data.plusUntil) || 0,
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) return res.status(401).json({ error: "Sign in to join Flame Fest." });
  let uid;
  try { uid = (await adminAuth.verifyIdToken(authHeader.slice(7))).uid; }
  catch { return res.status(401).json({ error: "Please sign in again." }); }
  const userRef = db.collection("users").doc(uid);

  try {
    if (req.method === "GET") {
      const snap = await userRef.get();
      return res.status(200).json(status(snap.exists ? snap.data() : {}));
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};

    // Pick a flame look you've unlocked.
    if (body.style != null) {
      if (!STYLES.includes(body.style)) return res.status(400).json({ error: "That flame look doesn't exist." });
      const out = await db.runTransaction(async tx => {
        const snap = await tx.get(userRef);
        const data = snap.exists ? snap.data() : {};
        if (!status(data).flameStyles.includes(body.style)) return { error: "Unlock that flame in Flame Fest first." };
        tx.set(userRef, { flameStyle: body.style }, { merge: true });
        return { data: { ...data, flameStyle: body.style } };
      });
      if (out.error) return res.status(403).json({ error: out.error });
      return res.status(200).json(status(out.data));
    }

    // Claim a reward.
    const reward = REWARDS.find(r => r.id === body.claim);
    if (!reward) return res.status(400).json({ error: "That reward doesn't exist." });
    if (utcDay() > EVENT.claimUntil) return res.status(410).json({ error: "Flame Fest rewards could be claimed until December 7." });
    const bankRef = userRef.collection("usage").doc("bank");
    const out = await db.runTransaction(async tx => {
      const [snap, bank] = await Promise.all([tx.get(userRef), tx.get(bankRef)]);
      const data = snap.exists ? snap.data() : {};
      const now = status(data);
      if (now.claimed[reward.id]) return { error: "You already claimed this reward.", code: 409 };
      const flames = flamesIn(now.days, reward);
      if (flames < reward.need) return { error: `Light ${reward.need - flames} more flame${reward.need - flames === 1 ? "" : "s"} to unlock this reward.`, code: 403 };

      const g = reward.gives;
      const fest = data.flameFest && typeof data.flameFest === "object" ? data.flameFest : {};
      const update = { flameFest: { ...fest, claimed: { ...now.claimed, [reward.id]: new Date().toISOString() } } };
      if (g.shields) update.flameShields = now.shields + g.shields;
      if (g.style) {
        update.flameStyles = [...new Set([...now.flameStyles.filter(s => s !== "classic"), g.style])];
        update.flameStyle = g.style; // show the new flame right away
      }
      if (g.plusDays) update.plusUntil = Math.max(Date.now(), now.plusUntil) + g.plusDays * DAY_MS;
      if (g.bonus) {
        // Bonus questions go into the free daily bank and may sit above its
        // usual cap (ask.js never trims a balance down when it regenerates).
        const b = bank.exists ? bank.data() : {};
        const balance = typeof b.balance === "number" ? b.balance : FREE_STARTING_BALANCE;
        tx.set(bankRef, { balance: balance + g.bonus, lastRegenAt: b.lastRegenAt || Date.now(), updatedAt: new Date().toISOString() }, { merge: true });
      }
      tx.set(userRef, update, { merge: true });
      return { data: { ...data, ...update } };
    });
    if (out.error) return res.status(out.code).json({ error: out.error });
    return res.status(200).json({ ...status(out.data), justClaimed: reward.id });
  } catch (err) {
    console.error("Flame Fest error:", err?.message);
    return res.status(503).json({ error: "Flame Fest is busy right now. Please try again in a moment." });
  }
}
