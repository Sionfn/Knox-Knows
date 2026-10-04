// /api/admin-comp.js — Knox Knows "Comped Plus" manager (admin only)
//
//   GET  → list every user currently given free Knox Plus
//   POST { action: 'grant',  email, note? } → give free Knox Plus
//   POST { action: 'revoke', uid }          → take it back
//
// A comped user is stored as plan 'super' (what the rest of the app treats
// as Knox Plus) plus comped: true. The webhook keeps Plus for comped users
// if a paid subscription of theirs ends, and revoking never removes Plus
// that someone is actually paying for.
//
// Same lock as /api/admin-stats: the ADMIN_UID account with a verified email.

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

const PAID_PLANS = ["super", "max", "plus"];
const LIVE_SUBSCRIPTION = ["active", "trialing", "past_due"];
const hasLiveSubscription = d => !!d.stripeSubscription && LIVE_SUBSCRIPTION.includes(d.planStatus);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });
  let decoded;
  try { decoded = await adminAuth.verifyIdToken(authHeader.slice(7)); }
  catch { return res.status(401).json({ error: "Unauthorized" }); }

  const ADMIN_UID = (process.env.ADMIN_UID || "").trim();
  if (!ADMIN_UID) return res.status(503).json({ error: "Admin access is not configured." });
  if (decoded.uid !== ADMIN_UID || decoded.email_verified !== true) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    if (req.method === "GET") return res.status(200).json({ comped: await listComped() });

    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (body.action === "grant") return await grant(res, body, decoded.uid);
    if (body.action === "revoke") return await revoke(res, body);
    return res.status(400).json({ error: "Unknown action." });
  } catch (err) {
    console.error("Admin comp error:", err);
    return res.status(500).json({ error: "Could not update Comped Plus. Please try again." });
  }
}

async function listComped() {
  const snap = await db.collection("users").where("comped", "==", true).get();
  const rows = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
  // Emails and names live in Firebase Auth, not the user doc.
  const accounts = new Map();
  for (let i = 0; i < rows.length; i += 100) {
    const batch = await adminAuth.getUsers(rows.slice(i, i + 100).map(r => ({ uid: r.uid })));
    batch.users.forEach(u => accounts.set(u.uid, u));
  }
  return rows
    .map(r => ({
      uid: r.uid,
      email: accounts.get(r.uid)?.email || null,
      name: accounts.get(r.uid)?.displayName || null,
      compedAt: r.compedAt || null,
      note: r.compedNote || "",
      alsoPaying: hasLiveSubscription(r),
    }))
    .sort((a, b) => String(b.compedAt || "").localeCompare(String(a.compedAt || "")));
}

async function grant(res, body, adminUid) {
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const note  = typeof body.note === "string" ? body.note.trim().slice(0, 200) : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }
  let account;
  try { account = await adminAuth.getUserByEmail(email); }
  catch (err) {
    if (err.code === "auth/user-not-found") {
      return res.status(404).json({ error: "No Knox account uses that email yet. They need to sign up first." });
    }
    throw err;
  }

  const ref = db.collection("users").doc(account.uid);
  const already = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const d = snap.exists ? snap.data() : {};
    if (d.comped === true) return true;
    const paying = hasLiveSubscription(d);
    tx.set(ref, {
      comped: true,
      compedAt: new Date().toISOString(),
      compedBy: adminUid,
      compedNote: note,
      plan: PAID_PLANS.includes(d.plan) && paying ? d.plan : "super",
      planStatus: paying ? d.planStatus : "comped",
    }, { merge: true });
    return false;
  });
  console.log(`✓ Comped Plus ${already ? "already active" : "granted"}: uid=${account.uid}`);
  return res.status(200).json({ ok: true, already, uid: account.uid, email: account.email });
}

async function revoke(res, body) {
  const uid = typeof body.uid === "string" ? body.uid.trim() : "";
  if (!uid || uid.length > 128) return res.status(400).json({ error: "Missing user." });

  const ref = db.collection("users").doc(uid);
  const result = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data().comped !== true) return "not-comped";
    const d = snap.data();
    const update = { comped: false, compedRevokedAt: new Date().toISOString() };
    // Someone who also pays keeps the Plus they're paying for.
    if (!hasLiveSubscription(d)) Object.assign(update, { plan: "free", planStatus: "none" });
    tx.set(ref, update, { merge: true });
    return hasLiveSubscription(d) ? "kept-paid" : "revoked";
  });
  if (result === "not-comped") return res.status(404).json({ error: "That user doesn't have Comped Plus." });
  console.log(`✓ Comped Plus removed: uid=${uid} (${result})`);
  return res.status(200).json({ ok: true, result });
}
