// /api/admin-stats.js — Knox Knows admin dashboard backend
//
// Aggregates everything important for the brand:
//   • User growth (totals, new today/week, by plan)
//   • Revenue (MRR estimate, paying customer count, conversion rate)
//   • Feedback (👍/👎 ratio, by mode, by plan, worst-rated answers)
//   • Usage (questions asked, by mode, recent activity)
//   • Retention signals (DAU, WAU)
//
// Security model:
//   • Locked to a single allow-listed admin email (env: ADMIN_EMAIL).
//   • Verifies Firebase ID token, checks decoded email matches.
//   • Uses Admin SDK to bypass firestore.rules (so rules can stay locked).
//   • Returns 403 with no body details for any other authenticated user.
//
// Add ADMIN_EMAIL=your@email.com to Vercel env vars before this works.

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

const startOfDay = (offset = 0) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
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

  const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
  if (!ADMIN_EMAIL) {
    return res.status(500).json({ error: "ADMIN_EMAIL not configured" });
  }
  if ((decodedToken.email || "").toLowerCase() !== ADMIN_EMAIL) {
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
      getRevenueStats(),
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
    return res.status(500).json({ error: "Could not load stats", detail: err.message });
  }
}

// ────────────────────────────────────────────────────────────
// USER STATS
// ────────────────────────────────────────────────────────────
async function getUserStats() {
  const usersSnap = await db.collection("users").get();
  const todayStart = startOfDay();
  const weekStart  = startOfDay(7);

  let total = 0, free = 0, superCount = 0, max = 0;
  let newToday = 0, newThisWeek = 0;
  let activeToday = 0, activeThisWeek = 0;
  const dailySignups = {}; // YYYY-MM-DD -> count

  usersSnap.forEach(doc => {
    const u = doc.data() || {};
    total++;

    const plan = u.plan || "free";
    if      (plan === "max")   max++;
    else if (plan === "super") superCount++;
    else                       free++;

    // Created — Firebase Auth provides `createdAt` on the user record,
    // but we don't mirror it to Firestore in the current flow. We DO
    // mirror `planActivatedAt` for paid users. For all users, look at
    // whichever timestamp exists (welcomeSentAt is set on first sign-in).
    const createdMs =
      (u.welcomeSentAt   && toMs(u.welcomeSentAt))   ||
      (u.planActivatedAt && toMs(u.planActivatedAt)) ||
      (u.firstSeenAt     && toMs(u.firstSeenAt))     ||
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
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    signupSeries.push({ date: key, count: dailySignups[key] || 0 });
  }

  // Free → paid conversion %
  const paying      = superCount + max;
  const conversion  = total > 0 ? (paying / total) * 100 : 0;

  return {
    total,
    byPlan: { free, super: superCount, max },
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
  const byMode = { answer: { up: 0, down: 0 }, learn: { up: 0, down: 0 }, chat: { up: 0, down: 0 } };
  const byPlan = { free:   { up: 0, down: 0 }, super: { up: 0, down: 0 }, max:  { up: 0, down: 0 } };
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

    const mode = byMode[f.mode] ? f.mode : "answer";
    const plan = byPlan[f.plan] ? f.plan : "free";
    if (r === 1) { byMode[mode].up++;   byPlan[plan].up++;   }
    else         { byMode[mode].down++; byPlan[plan].down++; }

    if (r === -1 && worstAnswers.length < 25) {
      worstAnswers.push({
        question: (f.question || "").slice(0, 240),
        answer:   (f.answer   || "").slice(0, 500),
        mode:     f.mode,
        plan:     f.plan,
        ts:       f.ts,
      });
    }

    if (recentFeedback.length < 20) {
      recentFeedback.push({
        rating: r,
        question: (f.question || "").slice(0, 140),
        mode: f.mode,
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
    byMode,
    byPlan,
    worstAnswers,
    recentFeedback,
  };
}

// ────────────────────────────────────────────────────────────
// USAGE STATS — derived from per-user daily usage docs
// ────────────────────────────────────────────────────────────
async function getUsageStats() {
  // We don't have a global usage collection (privacy-preserving design).
  // Instead, look at today's per-user usage docs across all users.
  const today    = new Date().toISOString().slice(0, 10);
  const usersSnap = await db.collection("users").get();

  let questionsToday = 0;
  const byModeToday = { answer: 0, learn: 0, chat: 0 };
  let usersWithActivityToday = 0;

  await Promise.all(usersSnap.docs.map(async (userDoc) => {
    const usageDoc = await db
      .collection("users").doc(userDoc.id)
      .collection("usage").doc(today)
      .get();
    if (!usageDoc.exists) return;
    const u = usageDoc.data() || {};
    const hw    = u.hw    || 0;
    const learn = u.learn || 0;
    const chat  = u.chat  || 0;
    const total = hw + learn + chat;
    if (total > 0) usersWithActivityToday++;
    questionsToday      += total;
    byModeToday.answer  += hw;
    byModeToday.learn   += learn;
    byModeToday.chat    += chat;
  }));

  return {
    questionsToday,
    byModeToday,
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

  // Stripe price IDs → labels (matches create-checkout-session.js / webhook.js)
  const PRICE_LABELS = {
    "price_1TTqUyCqlxC7aoKR0C9AM3sX": "super_monthly",
    "price_1TTqW6CqlxC7aoKR8nzCDAF3": "super_yearly",
    "price_1TTqWZCqlxC7aoKRESZls3vU": "max_monthly",
    "price_1TTqXnCqlxC7aoKRsOSwHFBy": "max_yearly",
  };

  let startingAfter = undefined;
  while (true) {
    const page = await stripe.subscriptions.list({
      status: "all",
      limit:  100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });

    for (const sub of page.data) {
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
    mrr: +(mrrCents / 100).toFixed(2),
    mrrCents,
    activeSubscriptions: activeCount,
    trialingSubscriptions: trialingCount,
    pastDueSubscriptions: pastDueCount,
    byPlan,
  };
}

// ── Helpers ────────────────────────────────────────────────
function toMs(maybeTs) {
  // Firestore Timestamps, JS dates, and ms numbers all welcome
  if (!maybeTs) return 0;
  if (typeof maybeTs === "number") return maybeTs;
  if (typeof maybeTs.toMillis === "function") return maybeTs.toMillis();
  if (maybeTs.seconds) return maybeTs.seconds * 1000;
  if (maybeTs instanceof Date) return maybeTs.getTime();
  return 0;
}
