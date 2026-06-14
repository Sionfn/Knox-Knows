// /api/me.js — Knox Knows
// Lightweight "who am I" endpoint for the browser extension (and anything
// else that needs the user's current plan + today's usage in one call).
// Verifies the Firebase ID token, then reads the user doc + today's usage.

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

// UTC day key — must match todayKey() in api/ask.js
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
    const [userSnap, usageSnap] = await Promise.all([
      userRef.get(),
      userRef.collection("usage").doc(todayKey()).get(),
    ]);

    const userData = userSnap.exists ? userSnap.data() : {};
    const usageData = usageSnap.exists ? usageSnap.data() : { hw: 0, learn: 0, chat: 0 };

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
      plan: userData.plan || "free",
      planStatus: userData.planStatus || "none",
      usage: {
        hw:    usageData.hw    || 0,
        learn: usageData.learn || 0,
        chat:  usageData.chat  || 0,
      },
      streak,
      studiedToday,
    });
  } catch (e) {
    console.error("/api/me error:", e.message);
    return res.status(500).json({ error: "Could not load account." });
  }
}
