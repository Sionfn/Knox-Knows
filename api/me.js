// /api/me.js — Knox Knows
// Lightweight "who am I" endpoint for the browser extension (and anything
// else that needs the user's current plan + rolling usage in one call).
// Verifies the Firebase ID token, then reads the user doc + rolling usage log.

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import crypto from "crypto";
import { tierOf, LIMITS, MEGA_PLAN } from "./_plans.js";
import discordLink from "./_discord-link.js";
import testerPlan from "./_tester-plan.js";
import support from "./_support.js";

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
const db = getFirestore();

// Must match api/ask.js's checkAndIncrementUsage exactly, or the displayed
// "credits left" will disagree with what actually happens when you ask.
// This endpoint only READS the balance — it never deducts — so it doesn't
// need to know about per-action costs (a photo now costs more credits than
// a text question; see PHOTO_CREDIT_COST in ask.js). The regen/cap numbers
// below are what matter for display and are unaffected by that weighting.
const FREE_DAILY_REGEN      = 5;
const FREE_MAX_BALANCE      = 20;
const FREE_STARTING_BALANCE = 10;
const PLUS_LIMIT            = 500;              // effectively unlimited; abuse-only ceiling
const PLUS_WINDOW_MS        = 3 * 60 * 60 * 1000; // 3 hours
const oneDayMs = () => 24 * 60 * 60 * 1000;

// Guests: must match api/ask.js (GUEST_QUESTION_LIMIT per day in
// guestUsage/<ip hash>/log/question, GUEST_HARD_LIMIT requests per hour in
// requestBudgets/g_<ip hash>) so the free-question pill never promises a
// question the server would refuse.
const GUEST_QUESTION_LIMIT = 3;
const GUEST_HOURLY_LIMIT   = 3;
const HOUR_MS              = 60 * 60 * 1000;
function guestIpHash(req) {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.headers["x-real-ip"] || req.socket?.remoteAddress || "unknown";
  return crypto.createHash("sha256").update(String(ip)).digest("hex");
}
async function guestStatus(req) {
  const ipHash = guestIpHash(req);
  const now = Date.now();
  const [questions, budget] = await Promise.all([
    db.collection("guestUsage").doc(ipHash).collection("log").doc("question").get(),
    db.collection("requestBudgets").doc("g_" + ipHash).get(),
  ]);
  const usedToday = (questions.exists ? questions.data().log || [] : []).filter(ts => now - ts < oneDayMs()).length;
  const b = budget.exists ? budget.data() : {};
  const hourActive = Number.isFinite(b.startedAt) && now - b.startedAt < HOUR_MS;
  const usedThisHour = hourActive ? (b.count || 0) : 0;
  return { guest: true, canAsk: usedToday < GUEST_QUESTION_LIMIT && usedThisHour < GUEST_HOURLY_LIMIT };
}

function planTier(plan) {
  // Paid allowlist — anything not explicitly a paid plan is free, so a
  // missing/blank plan can never accidentally unlock Knox Plus limits.
  return (plan === 'super' || plan === 'max' || plan === 'plus') ? 'paid' : 'free';
}

// UTC day key — used only for streak freshness, unrelated to usage now
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// Local-day helper for streak freshness (best-effort; the client also checks)
function daysBetween(aKey, bKey) {
  const a = new Date(aKey + "T00:00:00Z");
  const b = new Date(bKey + "T00:00:00Z");
  return Math.round((b - a) / 86400000);
}

export default async function handler(req, res) {
  // /api/discord-link is rewritten here (see api/_discord-link.js).
  if (req.query?.route === "discord-link") return discordLink(req, res);
  // Preview site only: testers pick their own plan (see api/_tester-plan.js).
  if (req.query?.route === "tester-plan") return testerPlan(req, res);
  // Knox Support chat + the team's inbox (see api/_support.js).
  if (req.query?.route === "support") return support(req, res);
  res.setHeader('Cache-Control', 'no-store');
  // ── CORS for the extension (chrome-extension:// origin) ──
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  // ── Verify token ──
  const authHeader = req.headers.authorization || "";
  // Signed out: report only whether this visitor can ask right now (no
  // personal data), so the guest pill matches what the server will allow.
  if (!authHeader) {
    try { return res.status(200).json(await guestStatus(req)); }
    catch (e) { return res.status(503).json({ error: "Usage service is temporarily unavailable." }); }
  }
  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
  } catch (e) {
    return res.status(401).json({ error: "Unauthorized — invalid token." });
  }
  const uid = decoded.uid;

  try {
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() : {};
    // Free / Knox Plus / Mega Knox, including comps and gift or Flame Fest
    // time (api/_plans.js). Mega is plan 'max' (paid everywhere, extension too).
    const planTierName = tierOf(userData);
    const plan     = planTierName === "mega" ? MEGA_PLAN : planTierName === "plus" ? (planTier(userData.plan) === "paid" ? userData.plan : "plus") : "free";
    const tier     = planTier(plan);
    const now      = Date.now();

    let used, limit, remaining, resetInMs;

    if (tier === "paid") {
      const usageSnap = await userRef.collection("usage").doc("rolling").get();
      const log    = usageSnap.exists ? (usageSnap.data().log || []) : [];
      const recent = log.filter(ts => now - ts < PLUS_WINDOW_MS);
      used      = recent.length;
      limit     = planTierName === "mega" ? LIMITS.mega.askPer3h : PLUS_LIMIT;
      remaining = Math.max(0, limit - used);
      resetInMs = recent.length > 0
        ? Math.max(0, PLUS_WINDOW_MS - (now - Math.min(...recent)))
        : 0;
    } else {
      // Free — read the daily bank. If it doesn't exist yet (the user
      // hasn't asked a real question via ask.js, which is what normally
      // creates it), CREATE it right here with a real, persisted timestamp
      // — using the server's own write access, since the browser must never
      // be able to set its own balance/lastRegenAt (that would let anyone
      // grant themselves free questions from DevTools). Without this,
      // every page load with no existing record would invent a fresh
      // "starts now" countdown, which is why the timer looked like it kept
      // resetting to 24h — it genuinely was, because nothing was ever saved.
      const bankRef = userRef.collection("usage").doc("bank");
      // The read and any regeneration must be atomic with /api/ask's spend;
      // otherwise a simultaneous page refresh can overwrite a new charge.
      const { balance, lastRegenAt } = await db.runTransaction(async tx => {
        const bankSnap = await tx.get(bankRef);
        if (!bankSnap.exists) {
          tx.set(bankRef, { balance: FREE_STARTING_BALANCE, lastRegenAt: now, updatedAt: new Date().toISOString() });
          return { balance: FREE_STARTING_BALANCE, lastRegenAt: now };
        }
        const d = bankSnap.data();
        let balance = typeof d.balance === 'number' ? d.balance : FREE_STARTING_BALANCE;
        let lastRegenAt = d.lastRegenAt || now;
        const daysElapsed = Math.floor((now - lastRegenAt) / oneDayMs());
        if (daysElapsed > 0) {
          balance = Math.max(balance, Math.min(FREE_MAX_BALANCE, balance + daysElapsed * FREE_DAILY_REGEN)); // keeps Flame Fest bonus questions
          lastRegenAt += daysElapsed * oneDayMs();
          tx.set(bankRef, { balance, lastRegenAt, updatedAt: new Date().toISOString() }, { merge: true });
        }
        return { balance, lastRegenAt };
      });
      remaining = balance;
      limit     = FREE_MAX_BALANCE;
      used      = Math.max(0, limit - balance);
      resetInMs = balance < limit ? Math.max(0, (lastRegenAt + oneDayMs()) - now) : 0;
    }

    // streak freshness
    let streak = userData.streakCount || 0;
    let studiedToday = false;
    if (userData.streakLastDay) {
      const gap = daysBetween(userData.streakLastDay, todayKey());
      // Days are the student's local dates, up to a day off UTC either way.
      if (gap > 2) streak = 0;            // broken
      else if (gap <= 0) studiedToday = true;
    }

    return res.status(200).json({
      uid,
      email: decoded.email || userData.email || null,
      name: userData.displayName || decoded.name || null,
      plan,
      tier: planTierName, // 'free' | 'plus' | 'mega'
      planStatus: userData.planStatus || "none",
      usage: { used, limit, remaining, resetInMs, isDailyBank: tier === "free" },
      streak,
      studiedToday,
    });
  } catch (e) {
    console.error("/api/me error:", e.message);
    return res.status(500).json({ error: "Could not load account." });
  }
}
