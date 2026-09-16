import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  initializeApp({ credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }) });
}

const auth = getAdminAuth();
const db = getFirestore();
const dayKey = () => new Date().toISOString().slice(0, 10);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });

  let decoded;
  try { decoded = await auth.verifyIdToken(header.slice(7)); }
  catch { return res.status(401).json({ error: "Unauthorized" }); }

  const action = req.body?.action;
  if (action !== "active" && action !== "study") {
    return res.status(400).json({ error: "Invalid activity action" });
  }

  const ref = db.collection("users").doc(decoded.uid);
  try {
    if (action === "active") {
      await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        const patch = { lastActiveAt: FieldValue.serverTimestamp() };
        if (!snap.exists || !snap.data().firstSeenAt) patch.firstSeenAt = FieldValue.serverTimestamp();
        tx.set(ref, patch, { merge: true });
      });
      return res.status(204).end();
    }

    const today = dayKey();
    const result = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : {};
      const lastDay = data.streakLastDay || null;
      let count = Number.isInteger(data.streakCount) ? data.streakCount : 0;
      if (lastDay !== today) {
        const previousDay = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        count = lastDay === previousDay ? count + 1 : 1;
        tx.set(ref, { streakCount: count, streakLastDay: today }, { merge: true });
      }
      return { count, studiedToday: true };
    });
    return res.status(200).json(result);
  } catch (error) {
    console.error("Activity update failed:", error.message);
    return res.status(500).json({ error: "Could not update activity" });
  }
}
