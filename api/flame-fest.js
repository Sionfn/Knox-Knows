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
// POST { style: 'classic' | 'purple' | 'blue' | 'gold' | 'slime' | 'diamond' | 'galaxy' } → pick an unlocked flame look
//   (🟢 Slime Flame: anyone who links their Discord with /link in the Knox server)
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
import { advanceStudyStreak, FLAME_FEST_START, FLAME_FEST_END, ADVENT_START, ADVENT_END, BAGS_START, BAGS_END } from "./_streak.js";

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
// What each plan gets for the same goal: Free gets bonus questions (Plus and
// Mega are already unlimited), Plus and Mega get more Flame Shields and flame
// looks, and Mega gets the exclusive 💎 Diamond Flame.
const REWARDS = [
  { id: "w1", name: "Spark",    start: "2026-11-01", end: "2026-11-07", need: 4,
    free: { gives: { bonus: 10 }, label: "+10 bonus questions" },
    plus: { gives: { style: "purple" }, label: "💜 Purple Flame" },
    mega: { gives: { style: "purple", shields: 1 }, label: "💜 Purple Flame + 🛡️ Flame Shield" }, },
  { id: "w2", name: "Kindling", start: "2026-11-08", end: "2026-11-14", need: 4,
    free: { gives: { shields: 1 }, label: "🛡️ Flame Shield" },
    plus: { gives: { shields: 2 }, label: "🛡️🛡️ 2 Flame Shields" },
    mega: { gives: { shields: 2, style: "diamond" }, label: "🛡️🛡️ 2 Flame Shields + 💎 Diamond Flame" }, },
  { id: "w3", name: "Blaze",    start: "2026-11-15", end: "2026-11-21", need: 4,
    free: { gives: { bonus: 10, style: "blue" }, label: "+10 bonus questions + 💙 Blue Flame" },
    plus: { gives: { shields: 1, style: "blue" }, label: "🛡️ Flame Shield + 💙 Blue Flame" },
    mega: { gives: { shields: 2, style: "blue" }, label: "🛡️🛡️ 2 Flame Shields + 💙 Blue Flame" }, },
  { id: "w4", name: "Bonfire",  start: "2026-11-22", end: "2026-11-28", need: 3,
    free: { gives: { shields: 1 }, label: "🛡️ Flame Shield" },
    plus: { gives: { shields: 2 }, label: "🛡️🛡️ 2 Flame Shields" },
    mega: { gives: { shields: 3 }, label: "🛡️🛡️🛡️ 3 Flame Shields" }, },
  { id: "month", name: "Phoenix", start: "2026-11-01", end: "2026-11-30", need: 20,
    free: { gives: { megaDays: 7, style: "gold" }, label: "7 days of Mega Knox + 🟡 Golden Flame" },
    plus: { gives: { megaDays: 14, style: "gold" }, label: "14 days of Mega Knox + 🟡 Golden Flame" },
    // Mega Knox members already have Mega: a week to gift a friend instead.
    mega: { gives: { gift: 7, style: "gold" }, label: "🎁 A Mega Knox week to gift a friend + 🟡 Golden Flame" }, },
];
const STYLES = ["classic", "purple", "blue", "gold", "slime", "diamond", "galaxy", "frost", "ruby"]; // ❄️ Frost and ❤️ Ruby come from the Advent Calendar
// 🌌 Galaxy Flame: for students who subscribe on the website (Stripe). Theirs to keep
// once a website payment went through (an active subscription or a renewal).
const GALAXY_GIFTED = ["sion22comp@gmail.com"];
const webSupporter = data => data.galaxyFlame === true ||
  (typeof data.stripeCustomerId === "string" && !!data.stripeCustomerId &&
    ((data.planStatus === "active" && !!data.stripeSubscription) || !!data.planRenewedAt));
const GIFT_DAYS = 7;
// Which prizes a member gets: their real plan (paid or comped) — a gift or
// Flame Fest week still gets the free-member prizes. Mega is plan 'max', or a
// Mega comp (a paying Plus subscriber keeps plan 'super' with compedTier 'mega').
function prizeTier(d) {
  const now = Date.now();
  const apple = Number(d?.appleUntil) > now ? d?.appleTier : null;
  if (d?.plan === MEGA_PLAN || (d?.comped === true && d?.compedTier === "mega") ||
      apple === "mega" || Number(d?.appleMegaUntil) > now) return "mega";
  if (["super", "plus"].includes(d?.plan) || d?.comped === true ||
      apple === "plus" || Number(d?.applePlusUntil) > now) return "plus";
  return "free";
}
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
    // Always the prizes for the account's own plan — also for the tester, who
    // switches plans on the preview to try each plan's prizes.
    rewards: REWARDS.map(({ free, plus: p, mega, ...r }) => ({ ...r, label: pick({ free, plus: p, mega }, tier).label, flames: flamesIn(days, r) })),
    days,
    shielded: Array.isArray(fest.shielded) ? fest.shielded : [],
    claimed: fest.claimed && typeof fest.claimed === "object" ? fest.claimed : {},
    shields: Math.max(0, Math.floor(Number(data.flameShields) || 0)),
    flameStyle: STYLES.includes(data.flameStyle) ? data.flameStyle : "classic",
    flameStyles: [...new Set(["classic", ...(Array.isArray(data.flameStyles) ? data.flameStyles.filter(s => STYLES.includes(s) && s !== "classic") : []), ...(typeof data.discordId === "string" && data.discordId ? ["slime"] : []), ...(webSupporter(data) ? ["galaxy"] : [])])],
    plusUntil: Number(data.plusUntil) || 0,
    megaUntil: Number(data.megaUntil) || 0,
    giftCode: typeof fest.giftCode === "string" ? fest.giftCode : "",
    giftRedeemed: !!data.giftRedeemedAt,
    ...(tester ? { tester: true } : {}),
  };
}

// ── Advent Calendar (December 2026) ─────────────────────────────────────────
// 25 doors, Dec 1–25. Studying on a day (or a Flame Shield covering it)
// unlocks that day's door; opening it gives its surprise. Doors stay
// openable until Dec 31. Free members mostly get bonus questions; Plus and
// Mega (already unlimited) get Flame Shields and looks on the big doors.
// GET ?event=advent → { event, tier, doors: [{ n, day, studied, opened, label }], shields, flameStyle, flameStyles, giftCode }
// POST { advent: 'open', door: n } → same, plus { opened: n }
const ADVENT = { name: "Advent Calendar", start: ADVENT_START, end: ADVENT_END, openUntil: "2026-12-31" };
const adventDay = n => `2026-12-${String(n).padStart(2, "0")}`;
const BIG = {
  6:  { free: { gives: { shields: 1 }, label: "🛡️ Flame Shield" }, plus: { gives: { shields: 1 }, label: "🛡️ Flame Shield" }, mega: { gives: { shields: 2 }, label: "🛡️🛡️ 2 Flame Shields" } },
  7:  { all: { gives: { style: "frost" }, label: "❄️ Frost Flame" } },
  13: { free: { gives: { bonus: 10, shields: 1 }, label: "+10 bonus questions + 🛡️ Flame Shield" }, plus: { gives: { shields: 2 }, label: "🛡️🛡️ 2 Flame Shields" }, mega: { gives: { shields: 2 }, label: "🛡️🛡️ 2 Flame Shields" } },
  17: { all: { gives: { style: "ruby" }, label: "❤️ Ruby Flame" } },
  20: { free: { gives: { shields: 1 }, label: "🛡️ Flame Shield" }, plus: { gives: { shields: 2 }, label: "🛡️🛡️ 2 Flame Shields" }, mega: { gives: { shields: 2 }, label: "🛡️🛡️ 2 Flame Shields" } },
  24: { free: { gives: { bonus: 15, shields: 1 }, label: "+15 bonus questions + 🛡️ Flame Shield" }, plus: { gives: { shields: 3 }, label: "🛡️🛡️🛡️ 3 Flame Shields" }, mega: { gives: { shields: 3 }, label: "🛡️🛡️🛡️ 3 Flame Shields" } },
  25: { free: { gives: { megaDays: 5 }, label: "🎁 5 days of Mega Knox" }, plus: { gives: { megaDays: 7 }, label: "🎁 7 days of Mega Knox" },
        mega: { gives: { gift: 7 }, label: "🎁 A Mega Knox week to gift a friend" } },
};
// The small doors: Free gets bonus questions; Plus and Mega get a treat
// (a winter fact or study tip, shown by the app) — they're already unlimited.
// Every door also holds a Knox blind bag (the only way to get them).
const adventPrize = (n, tier) => {
  const b = BIG[n];
  const base = b ? (b.all || (tier === "mega" && b.mega) || (tier === "free" ? b.free : b.plus))
    : tier === "free" ? { gives: { bonus: 5 }, label: "+5 bonus questions" } : { gives: {}, label: "" };
  return { gives: { ...base.gives, bag: 1 }, label: base.label ? base.label + " + 🛍️ Blind bag" : "🛍️ A Knox blind bag" };
};
function adventStatus(data, tester = false) {
  const adv = data.advent && typeof data.advent === "object" ? data.advent : {};
  const days = new Set(Array.isArray(adv.days) ? adv.days : []);
  const opened = adv.opened && typeof adv.opened === "object" ? adv.opened : {};
  const tier = prizeTier(data), base = status(data);
  return {
    event: ADVENT, tier,
    doors: Array.from({ length: 25 }, (_, k) => { const n = k + 1, day = adventDay(n); return { n, day, studied: tester || days.has(day), opened: !!opened[n], label: adventPrize(n, tier).label }; }),
    shields: base.shields, flameStyle: base.flameStyle, flameStyles: base.flameStyles,
    giftCode: typeof adv.giftCode === "string" ? adv.giftCode : "", megaUntil: base.megaUntil,
    ...(tester ? { tester: true } : {}),
  };
}

// ── Blind bags, Series 1 "Knox's Christmas" (Dec 2026 – Jan 2027) ──────────
// Bags are earned, never sold: one behind every Advent Calendar door, one for
// every 10 questions asked in December (up to 3 a day, api/_streak.js), or 3
// duplicates traded in for a new one.
// Odds favor figures you don't have yet; ✨ Golden Knox drops only once you
// have 8 of the other 11 (and is certain when it's the last one missing).
// Collect all 12: 30 days of Mega Knox (a Mega month to gift if already Mega),
// the Collector badge (knoxBags.collector) and the 🟡 Golden Flame.
// GET ?event=bags → { series, unopened, got, dupes, complete, claimed, giftCode }
// POST { bags: 'open' | 'trade' | 'claim' }
const BAG_SERIES = [
  ["elf", "Elf Knox", "common"], ["snowman", "Snowman Knox", "common"], ["reindeer", "Reindeer Knox", "common"],
  ["gingerbread", "Gingerbread Knox", "common"], ["cocoa", "Hot Cocoa Knox", "common"], ["sweater", "Ugly Sweater Knox", "common"],
  ["skater", "Ice Skater Knox", "rare"], ["caroler", "Caroler Knox", "rare"], ["snowball", "Snowball Knox", "rare"],
  ["santa", "Santa Knox", "epic"], ["nutcracker", "Nutcracker Knox", "epic"], ["golden", "Golden Knox", "secret"],
].map(([id, name, rarity]) => ({ id, name, rarity }));
const RARITY_WEIGHT = { common: 6, rare: 3, epic: 1.5 };
function bagStatus(data) {
  const kb = data.knoxBags && typeof data.knoxBags === "object" ? data.knoxBags : {};
  const got = {};
  for (const c of BAG_SERIES) { const n = Math.max(0, Math.floor(Number(kb.got?.[c.id]) || 0)); if (n) got[c.id] = n; }
  return {
    series: { name: "Knox's Christmas", start: BAGS_START, end: BAGS_END, figures: BAG_SERIES },
    unopened: Math.max(0, Math.floor(Number(kb.unopened) || 0)), got,
    dupes: Object.values(got).reduce((t, n) => t + n - 1, 0),
    complete: BAG_SERIES.every(c => got[c.id]), claimed: !!kb.claimed, giftCode: typeof kb.giftCode === "string" ? kb.giftCode : "",
    questions: Math.max(0, Number(kb.questions) || 0) % 10, // toward the next bag
  };
}
function pickFigure(got) {
  const regular = BAG_SERIES.filter(c => c.rarity !== "secret"), golden = BAG_SERIES.find(c => c.rarity === "secret");
  const missing = regular.filter(c => !got[c.id]);
  if (!got.golden && !missing.length) return golden;
  if (!got.golden && regular.length - missing.length >= 8 && Math.random() < 0.25) return golden;
  const pool = missing.length && Math.random() < 0.75 ? missing : regular;
  let r = Math.random() * pool.reduce((t, c) => t + RARITY_WEIGHT[c.rarity], 0);
  for (const c of pool) { r -= RARITY_WEIGHT[c.rarity]; if (r <= 0) return c; }
  return pool[pool.length - 1];
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
  // Tester mode only when the page asks for it (?flamefest=test sends this
  // header), so the admin account is a normal account everywhere else,
  // including the Chrome extension.
  const tester = isTester(decoded) && String(req.headers["x-knox-flame-test"] || "") === "1";
  const userRef = db.collection("users").doc(uid);
  // The owner's account has the 🌌 Galaxy Flame (given by hand; verified email only).
  if (decoded.email_verified === true && GALAXY_GIFTED.includes(String(decoded.email || "").toLowerCase())) {
    await userRef.set({ galaxyFlame: true }, { merge: true }).catch(() => {});
  }
  // testerReady: false when this deployment has no ADMIN_UID (so ?flamefest=test
  // can say why tester mode is missing).
  const testerReady = !!(process.env.ADMIN_UID || "").trim();
  const send = (data, extra = {}) => res.status(200).json({ ...status(data, tester), ...(testerReady ? {} : { testerReady }), ...extra });

  try {
    if (req.method === "GET") {
      const snap = await userRef.get();
      if (req.query?.event === "advent") return res.status(200).json(adventStatus(snap.exists ? snap.data() : {}, tester));
      if (req.query?.event === "bags") return res.status(200).json({ ...bagStatus(snap.exists ? snap.data() : {}), ...(tester ? { unlimited: true, unopened: 99 } : {}) });
      return send(snap.exists ? snap.data() : {});
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};

    // Blind bags: open one, trade 3 duplicates, or the complete-set reward.
    if (["open", "trade", "claim"].includes(body.bags)) {
      const giftCode = body.bags === "claim" ? newGiftCode().slice(0, 8) : "";
      const giftRef = giftCode ? db.collection("giftCodes").doc(giftCode) : null;
      const out = await db.runTransaction(async tx => {
        const [snap, taken] = await Promise.all([tx.get(userRef), giftRef ? tx.get(giftRef) : null]);
        const data = snap.exists ? snap.data() : {};
        const st = bagStatus(data), kb = data.knoxBags && typeof data.knoxBags === "object" ? data.knoxBags : {};
        let next = { ...kb, got: { ...st.got }, unopened: st.unopened }, extra = {}, result = {};
        if (body.bags === "open") {
          // Tester mode (the admin account with ?flamefest=test): unlimited bags.
          if (!st.unopened && !tester) return { error: "You don't have a bag to open yet. Keep studying to earn one!", code: 403 };
          const fig = pickFigure(st.got);
          next.unopened = tester ? st.unopened : st.unopened - 1;
          next.got[fig.id] = (st.got[fig.id] || 0) + 1;
          result = { figure: fig.id, isNew: !st.got[fig.id] };
        } else if (body.bags === "trade") {
          if (st.dupes < 3) return { error: "Trading needs 3 duplicates.", code: 403 };
          let left = 3;
          for (const c of [...BAG_SERIES].reverse()) while (left && next.got[c.id] > 1) { next.got[c.id]--; left--; }
          next.unopened = st.unopened + 1;
        } else {
          if (!st.complete) return { error: "Collect all 12 figures to claim the reward.", code: 403 };
          if (st.claimed) return { error: "You already claimed the collector reward.", code: 409 };
          next.claimed = new Date().toISOString(); next.collector = true;
          const styles = status(data).flameStyles;
          extra.flameStyles = [...new Set([...styles.filter(x => x !== "classic"), "gold"])];
          if (prizeTier(data) === "mega") {
            if (taken?.exists) return { error: "Please try again.", code: 503 };
            tx.set(giftRef, { source: "blindbags", tier: "mega", from: uid, days: 30, createdAt: new Date().toISOString(), redeemedBy: null });
            next.giftCode = giftCode;
          } else extra.megaUntil = Math.max(Date.now(), Number(data.megaUntil) || 0) + 30 * DAY_MS;
        }
        tx.set(userRef, { knoxBags: next, ...extra }, { merge: true });
        return { data: { ...data, knoxBags: next, ...extra }, result };
      });
      if (out.error) return res.status(out.code).json({ error: out.error });
      return res.status(200).json({ ...bagStatus(out.data), ...out.result, ...(tester ? { unlimited: true, unopened: 99 } : {}) });
    }

    // Advent Calendar: open a door.
    if (body.advent === "open") {
      const n = Number(body.door);
      if (!Number.isInteger(n) || n < 1 || n > 25) return res.status(400).json({ error: "That door doesn't exist." });
      const day = adventDay(n), now = utcDay();
      if (!tester && now > ADVENT.openUntil) return res.status(410).json({ error: "The Advent Calendar closed on December 31." });
      // The day's own date (a day of slack for time zones).
      if (!tester && day > addDays(now, 1)) return res.status(403).json({ error: `Door ${n} opens on December ${n}.` });
      const bankRef = userRef.collection("usage").doc("bank");
      const giftCode = n === 25 ? newGiftCode().slice(0, 8) : "";
      const giftRef = giftCode ? db.collection("giftCodes").doc(giftCode) : null;
      const out = await db.runTransaction(async tx => {
        const [snap, bank, taken] = await Promise.all([tx.get(userRef), tx.get(bankRef), giftRef ? tx.get(giftRef) : null]);
        const data = snap.exists ? snap.data() : {};
        const st = adventStatus(data, tester), door = st.doors[n - 1];
        if (door.opened) return { error: "You already opened this door.", code: 409 };
        if (!door.studied) return { error: `Study on December ${n} to open this door.`, code: 403 };
        const g = { ...adventPrize(n, st.tier).gives };
        const adv = data.advent && typeof data.advent === "object" ? data.advent : {};
        const update = { advent: { ...adv, opened: { ...(adv.opened || {}), [n]: new Date().toISOString() } } };
        if (g.gift && taken?.exists) return { error: "The Advent Calendar is busy right now. Please try again.", code: 503 };
        if (g.gift) {
          tx.set(giftRef, { source: "advent", tier: "mega", from: uid, days: g.gift, createdAt: new Date().toISOString(), redeemedBy: null });
          update.advent.giftCode = giftCode;
        }
        if (g.shields) update.flameShields = st.shields + g.shields;
        if (g.style) { update.flameStyles = [...new Set([...st.flameStyles.filter(s => s !== "classic"), g.style])]; update.flameStyle = g.style; }
        if (g.megaDays) update.megaUntil = Math.max(Date.now(), st.megaUntil) + g.megaDays * DAY_MS;
        if (g.bag) { const kb = data.knoxBags && typeof data.knoxBags === "object" ? data.knoxBags : {}; update.knoxBags = { ...kb, unopened: Math.max(0, Number(kb.unopened) || 0) + g.bag }; }
        if (g.bonus) {
          const b = bank.exists ? bank.data() : {};
          const balance = typeof b.balance === "number" ? b.balance : FREE_STARTING_BALANCE;
          tx.set(bankRef, { balance: balance + g.bonus, lastRegenAt: b.lastRegenAt || Date.now(), updatedAt: new Date().toISOString() }, { merge: true });
        }
        tx.set(userRef, update, { merge: true });
        return { data: { ...data, ...update } };
      });
      if (out.error) return res.status(out.code).json({ error: out.error });
      return res.status(200).json({ ...adventStatus(out.data, tester), opened: n });
    }

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
        } else if (body.test === "slime") {
          // The Slime Flame without Discord (the preview's test accounts can't
          // /link): unlock it and turn it on, like linking does.
          update = { flameStyles: [...new Set([...(Array.isArray(data.flameStyles) ? data.flameStyles : []), "slime"])], flameStyle: "slime" };
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
        if (!status(data).flameStyles.includes(body.style)) return { error: "Unlock that flame first (Flame Fest or the Advent Calendar)." };
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

      // The prize for the account's own plan (the tester picks a plan on the
      // preview to try each plan's prizes; tester mode only lifts the dates).
      const g = { ...pick(reward, now.tier).gives };
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
