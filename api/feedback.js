import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  initializeApp({ credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }) });
}

const auth = getAdminAuth();
const db = getFirestore();
const allowedModes = new Set(["answer", "learn"]);
const FEEDBACK_LIMIT = 20;
const FEEDBACK_WINDOW_MS = 24 * 60 * 60 * 1000;

async function reserveFeedbackSlot(uid) {
  const ref = db.collection("feedbackRate").doc(uid);
  const now = Date.now();
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const recent = (snap.exists ? (snap.data().log || []) : []).filter(ts => now - ts < FEEDBACK_WINDOW_MS);
    if (recent.length >= FEEDBACK_LIMIT) return false;
    recent.push(now);
    tx.set(ref, { log: recent, updatedAt: now });
    return true;
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });
  let decoded;
  try { decoded = await auth.verifyIdToken(header.slice(7)); }
  catch { return res.status(401).json({ error: "Unauthorized" }); }

  const { rating, question, answer, mode = "answer" } = req.body || {};
  if (![1, -1].includes(rating) || typeof question !== "string" || typeof answer !== "string" || !allowedModes.has(mode)) {
    return res.status(400).json({ error: "Invalid feedback" });
  }
  try {
  if (!(await reserveFeedbackSlot(decoded.uid))) {
    return res.status(429).json({ error: "Feedback limit reached. Please try again tomorrow." });
  }
  const user = await db.collection("users").doc(decoded.uid).get();
  const plan = user.exists && ["super", "max", "plus", "pro"].includes(user.data().plan) ? user.data().plan : "free";
  const payload = { rating, question: question.slice(0, 1000), answer: answer.slice(0, 5000), mode, plan, ts: Date.now() };
    await Promise.all([
      db.collection("feedback").add({ ...payload, uid: decoded.uid }),
      db.collection("users").doc(decoded.uid).collection("feedback").add(payload),
    ]);
    return res.status(201).json({ saved: true });
  } catch (error) {
    console.error("Feedback save failed:", error.message);
    return res.status(500).json({ error: "Could not save feedback" });
  }
}
