// /api/flame-fest.js — Flame Fest, Knox's November 2026 study event.
//
// Every day a student studies in November lights a flame on their calendar
// (api/ask.js saves the day in users/{uid}.flameFest.days, using the same
// day as the 🔥 streak). Lighting enough flames in a week, or in the whole
// month, unlocks a reward the student claims here.
//
// Free and Knox Plus members get different prizes for the same goals (a Knox Plus
// member has no use for bonus questions or a free Knox Plus week): see REWARDS.
//
// GET  → { event, plus, rewards, days, shielded, claimed, shields, flameStyle, flameStyles, plusUntil, giftCode }
// POST { claim: 'w1' | 'w2' | 'w3' | 'w4' | 'month' } → same shape, reward applied
// POST { style: 'classic' | 'purple' | 'blue' | 'gold' } → pick an unlocked flame look
// POST { studied: 'flashcards', localDay }             → a Flashcards review lights today's flame
//
// Tester (the ADMIN_UID account only, opened with ?flamefest=test): try every
// reward for real before November. Claims give both the free and the Knox Plus
// prizes and ignore the event dates.
// POST { test: 'fill' }            → light every November flame
// POST { test: 'miss', localDay }  → pretend yesterday was missed, so the next
//                                    question uses a 🛡️ Flame Shield
// POST { test: 'reset' }           → clear flames, claims, shields, flame looks
//                                    and the Flame Fest Knox Plus week
//
// Everything is checked and written here with the Admin SDK — the Firestore
// rules don't let the browser touch these fields.
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { newGiftCode } from "./_gifts.js";
import { MEGA_PLAN } from "./_plans.js";
import { advanceStudyStreak, FLAME_FEST_START, FLAME_FEST_END } from "./_streak.js";

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

const EVENT = { name: "Flame Fest", start: FLAME_FEST_START, end: FLAME_FEST_END, claimUntil: "2026-12-07" };
// free / plus: what each kind of member gets for the same goal.
const REWARDS = [
  { id: "w1", name: "Spark",    start: "2026-11-01", end: "2026-11-07", need: 4,
    free: { gives: { bonus: 10 }, label: "+10 bonus questions" },
    plus: { gives: { style: "purple" }, label: "💜 Purple Flame" },
    test: "+10 bonus questions + 💜 Purple Flame" },
  { id: "w2", name: "Kindling", start: "2026-11-08", end: "2026-11-14", need: 4,
    free: { gives: { shields: 1 }, label: "🛡️ Flame Shield" },
    plus: { gives: { shields: 1 }, label: "🛡️ Flame Shield" },
    test: "🛡️ Flame Shield" },
  { id: "w3", name: "Blaze",    start: "2026-11-15", end: "2026-11-21", need: 4,
    free: { gives: { bonus: 10, style: "blue" }, label: "+10 bonus questions + 💙 Blue Flame" },
    plus: { gives: { shields: 1, style: "blue" }, label: "🛡️ Flame Shield + 💙 Blue Flame" },
    test: "+10 bonus questions + 🛡️ Flame Shield + 💙 Blue Flame" },
  { id: "w4", name: "Bonfire",  start: "2026-11-22", end: "2026-11-28", need: 3,
    free: { gives: { shields: 1 }, label: "🛡️ Flame Shield" },
    plus: { gives: { shields: 1 }, label: "🛡️ Flame Shield" },
    test: "🛡️ Flame Shield" },
  { id: "month", name: "Phoenix", start: "2026-11-01", end: "2026-11-30", need: 20,
    free: { gives: { megaDays: 7, style: "gold" }, label: "7 days of Mega Knox + 👑 Golden Flame" },
    plus: { gives: { megaDays: 7, style: "gold" }, label: "7 days of Mega Knox + 👑 Golden Flame" },
    // Mega Knox members already have Mega: a week to gift a friend instead.
    mega: { gives: { gift: 7, style: "gold" }, label: "🎁 A Mega Knox week to gift a friend + 👑 Golden Flame" },
    test: "7 days of Mega Knox + 🎁 a Mega Knox week to gift + 👑 Golden Flame" },
];
const STYLES = ["classic", "purple", "blue", "gold"];
const GIFT_DAYS = 7;
// Which prizes a member gets: their real plan (paid or comped) — a gift or
// Flame Fest week still gets the free-member prizes. Mega is plan 'max'.
const prizeTier = d => d?.plan === MEGA_PLAN ? "mega" : (["super", "plus"].includes(d?.plan) || d?.comped === true) ? "plus" : "free";
const pick = (r, tier) => (tier === "mega" && r.mega) || (tier === "free" ? r.free : r.plus);
const FREE_STARTING_BALANCE = 10; // keep in sync with api/ask.js
const DAY_MS = 86400000;

const utcDay = () => new Date().toISOString().slice(0, 10);
const flamesIn = (days, r) => days.filter(d => d >= r.start && d <= r.end).length;

const ALL_DAYS = Array.from({ length: 30 }, (_, k) => `2026-11-${String(k + 1).padStart(2, "0")}`);
const addDays = (day, n) => new Date(Date.parse(day + "T00:00:00Z") + n * DAY_MS).toISOString().slice(0, 10);
const isTester = decoded => {
  const ADMIN_UID = (process.env.ADMIN_UID || "").trim();
  return !!ADMIN_UID && decoded.uid === ADMIN_UID && decoded.email_verified === true;
};

function status(data, tester = false) {
  const fest = data.flameFest && typeof data.flameFest === "object" ? data.flameFest : {};
  const days = Array.isArray(fest.days) ? fest.days.filter(d => typeof d === "string") : [];
  const tier = prizeTier(data), plus = tier !== "free";
  return {
    event: EVENT,
    plus,
    tier,
    rewards: REWARDS.map(({ free, plus: p, mega, test, ...r }) => ({ ...r, label: tester ? test : pick({ free, plus: p, mega }, tier).label, flames: flamesIn(days, r) })),
    days,
    shielded: Array.isArray(fest.shielded) ? fest.shielded : [],
    claimed: fest.claimed && typeof fest.claimed === "object" ? fest.claimed : {},
    shields: Math.max(0, Math.floor(Number(data.flameShields) || 0)),
    flameStyle: STYLES.includes(data.flameStyle) ? data.flameStyle : "classic",
    flameStyles: ["classic", ...(Array.isArray(data.flameStyles) ? data.flameStyles.filter(s => STYLES.includes(s) && s !== "classic") : [])],
    plusUntil: Number(data.plusUntil) || 0,
    megaUntil: Number(data.megaUntil) || 0,
    giftCode: typeof fest.giftCode === "string" ? fest.giftCode : "",
    giftRedeemed: !!data.giftRedeemedAt,
    ...(tester ? { tester: true } : {}),
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) return res.status(401).json({ error: "Sign in to join Flame Fest." });
  let decoded;
  try { decoded = await adminAuth.verifyIdToken(authHeader.slice(7)); }
  catch { return res.status(401).json({ error: "Please sign in again." }); }
  const uid = decoded.uid;
  const tester = isTester(decoded);
  const userRef = db.collection("users").doc(uid);
  // testerReady: false when this deployment has no ADMIN_UID (so ?flamefest=test
  // can say why tester mode is missing).
  const testerReady = !!(process.env.ADMIN_UID || "").trim();
  const send = (data, extra = {}) => res.status(200).json({ ...status(data, tester), ...(testerReady ? {} : { testerReady }), ...extra });

  try {
    if (req.method === "GET") {
      const snap = await userRef.get();
      return send(snap.exists ? snap.data() : {});
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};

    // A Flashcards review session lights today's flame (and keeps the streak),
    // the same as asking Knox a question.
    if (body.studied === "flashcards") {
      await advanceStudyStreak(db, uid, body.localDay);
      const snap = await userRef.get();
      return send(snap.exists ? snap.data() : {});
    }

    if (body.test != null) {
      if (!tester) return res.status(403).json({ error: "Tester mode is only for the Knox admin account." });
      const out = await db.runTransaction(async tx => {
        const snap = await tx.get(userRef);
        const data = snap.exists ? snap.data() : {};
        const fest = data.flameFest && typeof data.flameFest === "object" ? data.flameFest : {};
        let update;
        if (body.test === "fill") {
          update = { flameFest: { ...fest, days: ALL_DAYS } };
        } else if (body.test === "miss") {
          if (!status(data).shields) return { error: "Claim a reward with a 🛡️ Flame Shield first." };
          const today = /^\d{4}-\d{2}-\d{2}$/.test(body.localDay) ? body.localDay : utcDay();
          // Last studied two days ago → yesterday was missed. The next question
          // (or Flashcards review) spends one shield and keeps the streak.
          update = { streakLastDay: addDays(today, -2), streakCount: Math.max(1, Number(data.streakCount) || 0) };
        } else if (body.test === "reset") {
          update = { flameFest: {}, flameShields: 0, flameStyles: [], flameStyle: "classic", plusUntil: 0, megaUntil: 0 };
        } else return { error: "Unknown test." };
        tx.set(userRef, update, { merge: true });
        return { data: { ...data, ...update } };
      });
      if (out.error) return res.status(400).json({ error: out.error });
      return send(out.data);
    }


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
      return send(out.data);
    }

    // Claim a reward.
    const reward = REWARDS.find(r => r.id === body.claim);
    if (!reward) return res.status(400).json({ error: "That reward doesn't exist." });
    if (!tester && utcDay() > EVENT.claimUntil) return res.status(410).json({ error: "Flame Fest rewards could be claimed until December 7." });
    const bankRef = userRef.collection("usage").doc("bank");
    // An 8-character friend link code, from the gift-card alphabet (no 0/O, 1/I).
    const giftCode = reward.id === "month" ? newGiftCode().slice(0, 8) : "";
    const giftRef = giftCode ? db.collection("giftCodes").doc(giftCode) : null;
    const out = await db.runTransaction(async tx => {
      const [snap, bank, taken] = await Promise.all([tx.get(userRef), tx.get(bankRef), giftRef ? tx.get(giftRef) : null]);
      const data = snap.exists ? snap.data() : {};
      const now = status(data);
      if (now.claimed[reward.id]) return { error: "You already claimed this reward.", code: 409 };
      const flames = flamesIn(now.days, reward);
      if (flames < reward.need) return { error: `Light ${reward.need - flames} more flame${reward.need - flames === 1 ? "" : "s"} to unlock this reward.`, code: 403 };

      // The tester gets both versions of every prize, so all of them can be tried.
      const g = tester ? { ...reward.free.gives, ...reward.plus.gives, ...(reward.mega?.gives || {}) } : pick(reward, now.tier).gives;
      if (tester && reward.free.gives.style && reward.plus.gives.style && reward.free.gives.style !== reward.plus.gives.style) g.styles = [reward.free.gives.style, reward.plus.gives.style];
      const fest = data.flameFest && typeof data.flameFest === "object" ? data.flameFest : {};
      const update = { flameFest: { ...fest, claimed: { ...now.claimed, [reward.id]: new Date().toISOString() } } };
      if (g.gift && taken?.exists) return { error: "Flame Fest is busy right now. Please try again.", code: 503 };
      if (g.gift) {
        // A one-time link: /redeem?code=CODE gives a friend a free Mega Knox week
        // (redeemed in api/redeem.js, like any Knox gift code).
        tx.set(giftRef, { source: "flamefest", tier: "mega", from: uid, days: g.gift, createdAt: new Date().toISOString(), redeemedBy: null });
        update.flameFest.giftCode = giftCode;
      }
      if (g.shields) update.flameShields = now.shields + g.shields;
      if (g.style) {
        update.flameStyles = [...new Set([...now.flameStyles.filter(s => s !== "classic"), ...(g.styles || [g.style])])];
        update.flameStyle = g.style; // show the new flame right away
      }
      if (g.megaDays) update.megaUntil = Math.max(Date.now(), now.megaUntil) + g.megaDays * DAY_MS;
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
    return send(out.data, { justClaimed: reward.id });
  } catch (err) {
    console.error("Flame Fest error:", err?.message);
    return res.status(503).json({ error: "Flame Fest is busy right now. Please try again in a moment." });
  }
}
