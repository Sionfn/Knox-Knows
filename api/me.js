// /api/me.js — Knox Knows
// Lightweight "who am I" endpoint for the browser extension (and anything
// else that needs the user's current plan + rolling usage in one call).
// Verifies the Firebase ID token, then reads the user doc + rolling usage log.

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
const db = getFirestore();

// Must match api/ask.js's checkAndIncrementUsage exactly, or the displayed
// "questions left" will disagree with what actually happens when you ask.
const FREE_DAILY_REGEN      = 5;
const FREE_MAX_BALANCE      = 20;
const FREE_STARTING_BALANCE = 10;
const PLUS_LIMIT            = 500;              // effectively unlimited; abuse-only ceiling
const PLUS_WINDOW_MS        = 3 * 60 * 60 * 1000; // 3 hours
const oneDayMs = () => 24 * 60 * 60 * 1000;

function planTier(plan) {
  // Paid allowlist — anything not explicitly a paid plan is free, so a
  // missing/blank plan can never accidentally unlock Plus limits.
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
  // ── CORS for the extension (chrome-extension:// origin) ──
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  // ── Verify token ──
  const authHeader = req.headers.authorization || "";
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
    const plan     = userData.plan || "free";
    const tier     = planTier(plan);
    const now      = Date.now();

    let used, limit, remaining, resetInMs;

    if (tier === "paid") {
      const usageSnap = await userRef.collection("usage").doc("rolling").get();
      const log    = usageSnap.exists ? (usageSnap.data().log || []) : [];
      const recent = log.filter(ts => now - ts < PLUS_WINDOW_MS);
      used      = recent.length;
      limit     = PLUS_LIMIT;
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
      const bankSnap = await bankRef.get();
      let balance, lastRegenAt;
      if (!bankSnap.exists) {
        balance = FREE_STARTING_BALANCE;
        lastRegenAt = now;
        await bankRef.set({ balance, lastRegenAt, updatedAt: new Date().toISOString() }, { merge: true });
      } else {
        const d = bankSnap.data();
        balance = typeof d.balance === "number" ? d.balance : FREE_STARTING_BALANCE;
        lastRegenAt = d.lastRegenAt || now;
        const daysElapsed = Math.floor((now - lastRegenAt) / oneDayMs());
        if (daysElapsed > 0) {
          balance = Math.min(FREE_MAX_BALANCE, balance + daysElapsed * FREE_DAILY_REGEN);
          lastRegenAt = lastRegenAt + daysElapsed * oneDayMs();
          // Persist the advanced regen too, so it's consistent for the next
          // read (by ask.js, me.js, or the header display) instead of
          // silently drifting.
          await bankRef.set({ balance, lastRegenAt, updatedAt: new Date().toISOString() }, { merge: true });
        }
      }
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
      if (gap > 1) streak = 0;            // broken
      else if (gap === 0) studiedToday = true;
    }

    return res.status(200).json({
      uid,
      email: decoded.email || userData.email || null,
      name: userData.displayName || decoded.name || null,
      plan,
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
