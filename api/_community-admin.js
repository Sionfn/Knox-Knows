// api/_community-admin.js — review what students reported in the Communities
// (Simulation Lab and Flashcards). The Knox admin only (ADMIN_UID).
// Reached through /api/me?route=community-admin.
//   GET                                         → { items: [{ kind, id, title, reports, hidden, createdAt, summary }] }
//   POST { kind: 'sim'|'deck', id, action: 'restore'|'delete' }
const COLS = { sim: "publicSims", deck: "publicDecks" };
const ID = /^[A-Za-z0-9]{10}$/;

export default async function communityAdmin(req, res, { db, auth }) {
  res.setHeader("Cache-Control", "no-store");
  const h = req.headers.authorization || "", ADMIN = (process.env.ADMIN_UID || "").trim();
  let decoded;
  try { decoded = await auth.verifyIdToken(h.replace(/^Bearer /, "")); } catch { return res.status(401).json({ error: "Please sign in again." }); }
  if (!ADMIN || decoded.uid !== ADMIN || decoded.email_verified !== true) return res.status(403).json({ error: "Only the Knox admin can review reports." });

  if (req.method === "GET") {
    const items = [];
    for (const [kind, col] of Object.entries(COLS)) {
      const snap = await db.collection(col).orderBy("reports", "desc").limit(50).get();
      for (const d of snap.docs) {
        const x = d.data(); if (!x.reports) continue;
        const reasons = (await d.ref.collection("marks").where("reported", "==", true).limit(10).get()).docs.map(m => m.data().reason || "").filter(Boolean);
        items.push({ kind, id: d.id, title: x.title, desc: x.desc || "", reports: x.reports, hidden: !!x.hidden, createdAt: x.createdAt,
          summary: kind === "deck" ? (x.cards || []).slice(0, 8).map(c => `${c.front} → ${c.back}`) : [`${x.type} simulation`], reasons });
      }
    }
    items.sort((a, b) => b.reports - a.reports);
    return res.status(200).json({ items });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { kind, id, action } = req.body || {};
  if (!COLS[kind] || !ID.test(String(id || ""))) return res.status(400).json({ error: "Bad item." });
  const ref = db.collection(COLS[kind]).doc(id);
  if (action === "restore") { await ref.update({ hidden: false, reports: 0 }); return res.status(200).json({ ok: true }); }
  if (action === "delete") { await ref.delete(); return res.status(200).json({ ok: true }); }
  return res.status(400).json({ error: "Unknown action." });
}
