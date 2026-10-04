// /api/admin-stats.js — Knox Knows admin dashboard backend
//
// Aggregates everything important for the brand:
//   • User growth (totals, new today/week, by plan)
//   • Revenue (MRR estimate, paying customer count, conversion rate)
//   • Free trials (who, when it started/ends, and whether it converted)
//   • Feedback (👍/👎 ratio, by mode, by plan, worst-rated answers)
//   • Usage (questions asked, by mode, recent activity)
//   • Retention signals (DAU, WAU)
//
// Security model:
//   • Locked to a single immutable admin UID (env: ADMIN_UID).
//   • Verifies Firebase ID token and requires a verified email.
//   • Uses Admin SDK to bypass firestore.rules (so rules can stay locked).
//   • Returns 403 with no body details for any other authenticated user.
//
// Set ADMIN_UID to the owner's Firebase Authentication UID before deployment.

import Stripe from "stripe";
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

// ── Time windows ──────────────────────────────────────────────
const DAY_MS  = 24 * 60 * 60 * 1000;
const WEEK_MS = 7  * DAY_MS;

// UTC day boundary — matches how the writers key their day buckets
// (api/ask.js writes stats/{new Date().toISOString().slice(0,10)}, which
// is always the UTC day). Using local time here worked only because
// Vercel runs UTC; if the function were ever deployed to another region,
// "today" and the stats/{today} doc would silently drift out of sync.
const startOfDay = (offset = 0) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime() - (offset * DAY_MS);
};

export default async function handler(req, res) {
  // ── CORS (admin page is on same origin, but be explicit) ────
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── Auth check ────────────────────────────────────────────
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  let decodedToken;
  try {
    decodedToken = await adminAuth.verifyIdToken(authHeader.slice(7));
  } catch (err) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const ADMIN_UID = (process.env.ADMIN_UID || "").trim();
  if (!ADMIN_UID) {
    return res.status(503).json({ error: "Admin access is not configured." });
  }
  if (decodedToken.uid !== ADMIN_UID || decodedToken.email_verified !== true) {
    // Don't reveal anything — looks identical to an unauthenticated request
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    // ── Aggregate everything in parallel for speed ──────────
    const [
      userStats,
      feedbackStats,
      usageStats,
      revenueStats,
    ] = await Promise.all([
      getUserStats(),
      getFeedbackStats(),
      getUsageStats(),
      getRevenueStats().catch(err => {
        // Stripe being down or misconfigured shouldn't take the whole
        // dashboard (and the Comped Plus manager under it) down with it.
        console.error("Admin revenue stats error:", err);
        return { error: "Could not reach Stripe", mrr: 0, activeSubscriptions: 0 };
      }),
    ]);

    return res.status(200).json({
      generatedAt: Date.now(),
      users:    userStats,
      feedback: feedbackStats,
      usage:    usageStats,
      revenue:  revenueStats,
    });
  } catch (err) {
    console.error("Admin stats error:", err);
    return res.status(500).json({ error: "Could not load stats" });
  }
}

// ────────────────────────────────────────────────────────────
// USER STATS
// ────────────────────────────────────────────────────────────
async function getUserStats() {
  const [usersSnap, accountCreated] = await Promise.all([
    db.collection("users").get(),
    getAccountCreationTimes(),
  ]);
  const todayStart = startOfDay();
  const weekStart  = startOfDay(7);

  let total = 0, free = 0, superCount = 0, max = 0, comped = 0, trial = 0;
  let newToday = 0, newThisWeek = 0;
  let activeToday = 0, activeThisWeek = 0;
  const dailySignups = {}; // YYYY-MM-DD -> count

  usersSnap.forEach(doc => {
    const u = doc.data() || {};
    total++;

    const plan = u.plan || "free";
    // Comped Plus users without their own live subscription aren't paying.
    const compedOnly = u.comped === true && !(u.stripeSubscription && ["active", "trialing", "past_due"].includes(u.planStatus));
    if      (compedOnly)       comped++;
    // On a free trial: they have Plus but haven't paid anything yet.
    else if (u.planStatus === "trialing" && u.stripeSubscription) trial++;
    else if (plan === "max")   max++;
    else if (plan === "super" || plan === "plus") superCount++;
    else                       free++;

    // Created — the Firebase Auth account's creation time is the real
    // signup date. Fall back to the earliest Firestore timestamps for any
    // account Auth couldn't list. (planActivatedAt is when they paid,
    // which can be months after signing up, so it's the last resort.)
    const createdMs =
      accountCreated.get(doc.id)                     ||
      (u.welcomeSentAt   && toMs(u.welcomeSentAt))   ||
      (u.firstSeenAt     && toMs(u.firstSeenAt))     ||
      (u.planActivatedAt && toMs(u.planActivatedAt)) ||
      0;
    if (createdMs >= todayStart) newToday++;
    if (createdMs >= weekStart)  newThisWeek++;

    if (createdMs > 0) {
      const key = new Date(createdMs).toISOString().slice(0, 10);
      dailySignups[key] = (dailySignups[key] || 0) + 1;
    }

    // Activity — derived from lastActiveAt (set client-side on app open)
    const lastActiveMs = u.lastActiveAt ? toMs(u.lastActiveAt) : 0;
    if (lastActiveMs >= todayStart) activeToday++;
    if (lastActiveMs >= weekStart)  activeThisWeek++;
  });

  // Build a 14-day signup chart (oldest first)
  const signupSeries = [];
  for (let i = 13; i >= 0; i--) {
    const key = new Date(startOfDay(i)).toISOString().slice(0, 10);
    signupSeries.push({ date: key, count: dailySignups[key] || 0 });
  }

  // Free → paid conversion %
  const paying      = superCount + max;
  const conversion  = total > 0 ? (paying / total) * 100 : 0;

  return {
    total,
    byPlan: { free, super: superCount, max, comped, trial },
    paying,
    conversionPct:  +conversion.toFixed(1),
    newToday,
    newThisWeek,
    activeToday,
    activeThisWeek,
    signupSeries,
  };
}

// ────────────────────────────────────────────────────────────
// FEEDBACK STATS
// ────────────────────────────────────────────────────────────
async function getFeedbackStats() {
  // Pull the last 1000 feedback entries (more than enough for an early app)
  const snap = await db
    .collection("feedback")
    .orderBy("ts", "desc")
    .limit(1000)
    .get();

  let up = 0, down = 0;
  let upToday = 0, downToday = 0;
  let upWeek = 0, downWeek = 0;
  const byPlan = { free:   { up: 0, down: 0 }, super: { up: 0, down: 0 }, max:  { up: 0, down: 0 }, plus: { up: 0, down: 0 } };
  const worstAnswers = []; // collect all down-votes, then take top N by recency
  const recentFeedback = [];

  const todayStart = startOfDay();
  const weekStart  = startOfDay(7);

  snap.forEach(doc => {
    const f = doc.data() || {};
    const r = f.rating;
    if (r !== 1 && r !== -1) return;

    if (r === 1) up++; else down++;
    if (f.ts >= todayStart) { if (r === 1) upToday++; else downToday++; }
    if (f.ts >= weekStart)  { if (r === 1) upWeek++;  else downWeek++;  }

    const plan = byPlan[f.plan] ? f.plan : "free";
    if (r === 1) { byPlan[plan].up++; }
    else         { byPlan[plan].down++; }

    if (r === -1 && worstAnswers.length < 25) {
      worstAnswers.push({
        question: (f.question || "").slice(0, 240),
        answer:   (f.answer   || "").slice(0, 500),
        plan:     f.plan,
        ts:       f.ts,
      });
    }

    if (recentFeedback.length < 20) {
      recentFeedback.push({
        rating: r,
        question: (f.question || "").slice(0, 140),
        plan: f.plan,
        ts:   f.ts,
      });
    }
  });

  const total = up + down;
  const positivePct = total > 0 ? (up / total) * 100 : 0;

  return {
    total,
    up, down,
    upToday, downToday,
    upWeek,  downWeek,
    positivePct: +positivePct.toFixed(1),
    byPlan,
    worstAnswers,
    recentFeedback,
  };
}

// ────────────────────────────────────────────────────────────
// USAGE STATS — real sitewide counters written by api/ask.js
// (stats/daily/{date}), NOT the per-user rolling quota log, which prunes
// itself to a few hours of history by design and can never answer "how
// many questions today" — see the comment beside recordDailyUsage in ask.js.
// ────────────────────────────────────────────────────────────
async function getUsageStats() {
  const today     = new Date().toISOString().slice(0, 10);
  const todayRef  = db.collection("stats").doc(today);

  const [todaySnap, askersSnap] = await Promise.all([
    todayRef.get(),
    todayRef.collection("askers").get(),
  ]);

  const questionsToday          = todaySnap.exists ? (todaySnap.data().questions || 0) : 0;
  const usersWithActivityToday  = askersSnap.size;

  // Last 7 days' totals for a quick trend — same collection, just older docs.
  const trendDays = [];
  for (let i = 6; i >= 0; i--) {
    trendDays.push(new Date(startOfDay(i)).toISOString().slice(0, 10));
  }
  const trendSnaps = await Promise.all(trendDays.map(date => db.collection("stats").doc(date).get()));
  const questionsThisWeek = trendSnaps.reduce((sum, s) => sum + (s.exists ? (s.data().questions || 0) : 0), 0);

  return {
    questionsToday,
    questionsThisWeek,
    usersWithActivityToday,
    avgQuestionsPerActiveUser:
      usersWithActivityToday > 0
        ? +(questionsToday / usersWithActivityToday).toFixed(1)
        : 0,
  };
}

// ────────────────────────────────────────────────────────────
// REVENUE STATS — pulled live from Stripe (single source of truth)
// ────────────────────────────────────────────────────────────
async function getRevenueStats() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return { error: "STRIPE_SECRET_KEY not configured", mrr: 0, activeSubscriptions: 0 };
  }

  const stripe = new Stripe(key);

  // List all active subscriptions (paginate).
  // For an early app this fits in one page; for scale, paginate properly.
  let mrrCents = 0;
  let activeCount = 0;
  let trialingCount = 0;
  let pastDueCount = 0;
  const byPlan = { super_monthly: 0, super_yearly: 0, max_monthly: 0, max_yearly: 0 };

  // Stripe price IDs → labels (matches webhook.js's PRICE_TO_PLAN — every
  // price ID that's ever been live needs an entry here too, or grandfathered
  // subscribers on older prices silently vanish from this breakdown even
  // though they still count toward mrr/activeSubscriptions above).
  const PRICE_LABELS = {
    // OLDEST prices (early 2026 — grandfathered)
    "price_1TTqUyCqlxC7aoKR0C9AM3sX": "super_monthly",
    "price_1TTqW6CqlxC7aoKR8nzCDAF3": "super_yearly",
    "price_1TTqWZCqlxC7aoKRESZls3vU": "max_monthly",
    "price_1TTqXnCqlxC7aoKRsOSwHFBy": "max_yearly",
    // MID prices (mid-2026 — grandfathered)
    "price_1Tb16gCqlxC7aoKRxPv4z4BP": "super_monthly",
    "price_1Tb17FCqlxC7aoKRIE0BZaWg": "super_yearly",
    "price_1Tb17fCqlxC7aoKRgQ3uxxlK": "max_monthly",
    "price_1Tb17zCqlxC7aoKRNOYaO73B": "max_yearly",
    // CURRENT prices (Sept 2026 reset — one plan: Knox Plus)
    "price_1UBcoACqlxC7aoKRR3DFKNhJ": "super_monthly",
    "price_1UBcpYCqlxC7aoKR7FUFZ0e2": "super_yearly",
  };

  const trials = [];

  let startingAfter = undefined;
  while (true) {
    const page = await stripe.subscriptions.list({
      status: "all",
      limit:  100,
      expand: ["data.customer"],
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });

    for (const sub of page.data) {
      if (sub.trial_start) trials.push(trialRow(sub));

      if (sub.status === "active")    activeCount++;
      if (sub.status === "trialing")  trialingCount++;
      if (sub.status === "past_due")  pastDueCount++;

      // Count toward MRR only if active (not cancelled/incomplete/past_due)
      if (sub.status !== "active") continue;

      for (const item of sub.items.data) {
        const priceId = item.price.id;
        const label   = PRICE_LABELS[priceId];
        if (label) byPlan[label]++;

        // Normalize to monthly cents
        const interval = item.price.recurring?.interval;
        const amount   = item.price.unit_amount || 0;
        const qty      = item.quantity || 1;
        if (interval === "month") mrrCents += amount * qty;
        else if (interval === "year") mrrCents += Math.round((amount * qty) / 12);
      }
    }

    if (!page.has_more) break;
    startingAfter = page.data[page.data.length - 1].id;
  }

  return {
    trials: await summarizeTrials(trials),
    mrr: +(mrrCents / 100).toFixed(2),
    mrrCents,
    activeSubscriptions: activeCount,
    trialingSubscriptions: trialingCount,
    pastDueSubscriptions: pastDueCount,
    byPlan,
  };
}

// ────────────────────────────────────────────────────────────
// FREE TRIALS — every subscription that started with a trial
// ────────────────────────────────────────────────────────────
// Where a trial stands today:
//   trialing   — in the trial, will be charged when it ends
//   cancelling — in the trial, but cancelled; ends without a charge
//   converted  — trial ended and they're paying
//   payment_failed — trial ended but the first charge didn't go through
//   cancelled  — cancelled during the trial (never paid)
//   paid_then_cancelled — paid after the trial, cancelled later
function trialOutcome(sub) {
  if (sub.status === "trialing") {
    return sub.cancel_at_period_end || sub.cancel_at ? "cancelling" : "trialing";
  }
  if (sub.status === "active") return "converted";
  if (sub.status === "canceled") {
    const endedMs = (sub.ended_at || sub.canceled_at || 0) * 1000;
    // An hour's grace: a cancel-at-trial-end lands exactly on trial_end.
    return endedMs && endedMs <= sub.trial_end * 1000 + 60 * 60 * 1000 ? "cancelled" : "paid_then_cancelled";
  }
  return "payment_failed"; // past_due, unpaid, paused, incomplete_expired
}

function trialRow(sub) {
  const customer = sub.customer && typeof sub.customer === "object" ? sub.customer : null;
  return {
    id:         sub.id,
    uid:        sub.metadata?.uid || customer?.metadata?.uid || null,
    email:      customer?.email || null,
    name:       customer?.name || null,
    trialStart: sub.trial_start * 1000,
    trialEnd:   sub.trial_end ? sub.trial_end * 1000 : null,
    outcome:    trialOutcome(sub),
  };
}

async function summarizeTrials(rows) {
  // Fill in emails Stripe doesn't have from the linked Knox account.
  const missing = [...new Set(rows.filter(r => !r.email && r.uid).map(r => r.uid))];
  const accounts = new Map();
  try {
    for (let i = 0; i < missing.length; i += 100) {
      const batch = await adminAuth.getUsers(missing.slice(i, i + 100).map(uid => ({ uid })));
      batch.users.forEach(u => accounts.set(u.uid, u));
    }
  } catch (err) {
    console.error("Admin trial account lookup error:", err);
  }
  for (const r of rows) {
    const account = r.uid && accounts.get(r.uid);
    if (account) {
      r.email = r.email || account.email || null;
      r.name  = r.name  || account.displayName || null;
    }
  }

  const now = Date.now();
  const active    = rows.filter(r => r.outcome === "trialing" || r.outcome === "cancelling");
  const finished  = rows.filter(r => r.outcome !== "trialing" && r.outcome !== "cancelling");
  const converted = finished.filter(r => r.outcome === "converted" || r.outcome === "paid_then_cancelled");
  rows.sort((a, b) => b.trialStart - a.trialStart);

  return {
    active:        active.length,
    cancelling:    active.filter(r => r.outcome === "cancelling").length,
    startedThisWeek:  rows.filter(r => r.trialStart >= now - WEEK_MS).length,
    startedThisMonth: rows.filter(r => r.trialStart >= now - 30 * DAY_MS).length,
    finished:      finished.length,
    converted:     converted.length,
    conversionPct: finished.length ? +((converted.length / finished.length) * 100).toFixed(1) : null,
    list:          rows.slice(0, 200),
  };
}

// ── Helpers ────────────────────────────────────────────────
// uid → Firebase Auth account creation time (ms). Empty if Auth can't be listed.
async function getAccountCreationTimes() {
  const created = new Map();
  try {
    let pageToken;
    do {
      const page = await adminAuth.listUsers(1000, pageToken);
      page.users.forEach(u => {
        const ms = Date.parse(u.metadata?.creationTime || "");
        if (ms) created.set(u.uid, ms);
      });
      pageToken = page.pageToken;
    } while (pageToken);
  } catch (err) {
    console.error("Admin account list error:", err);
  }
  return created;
}

function toMs(maybeTs) {
  // Firestore Timestamps, JS dates, and ms numbers all welcome
  if (!maybeTs) return 0;
  if (typeof maybeTs === "number") return maybeTs;
  if (typeof maybeTs === 'string') return Date.parse(maybeTs) || 0;
  if (typeof maybeTs.toMillis === "function") return maybeTs.toMillis();
  if (maybeTs.seconds) return maybeTs.seconds * 1000;
  if (maybeTs instanceof Date) return maybeTs.getTime();
  return 0;
}
