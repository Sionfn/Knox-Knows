import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  initializeApp({ credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }) });
}

const db = getFirestore();
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export default async function handler(req, res) {
  const token = req.headers.authorization || "";
  if (req.method !== "GET" || !process.env.CRON_SECRET || token !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const cutoff = Date.now() - RETENTION_MS;
    const [conversations, history] = await Promise.all([
      db.collectionGroup("conversations").where("updatedAt", "<", cutoff).limit(300).get(),
      db.collectionGroup("history").where("ts", "<", cutoff).limit(300).get(),
    ]);
    await Promise.all([
      ...conversations.docs.map(doc => db.recursiveDelete(doc.ref)),
      ...history.docs.map(doc => doc.ref.delete()),
    ]);
    const deleted = conversations.size + history.size;
    return res.status(200).json({ deleted, hasMore: conversations.size === 300 || history.size === 300 });
  } catch (error) {
    console.error("History cleanup failed:", error.message);
    return res.status(500).json({ error: "Could not clean history" });
  }
}
