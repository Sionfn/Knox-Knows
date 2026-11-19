import crypto from "node:crypto";

// Signed in on the iPhone app → signed in on the website as the same account.
// The app asks for a one-time code (route=handoff, with its ID token) and opens
// the website with ?handoff=<code>. The page trades the code once
// (route=handoff-redeem) for a Firebase custom token and signs in with it.
// Only a hash of the code is stored, it works once, and it expires in 2 minutes,
// so a link that's shared or found in history later signs no one in.
export const HANDOFF_TTL_MS = 2 * 60 * 1000;
const hash = code => crypto.createHash("sha256").update(code).digest("hex");

export default async function handoff(req, res, { db, auth, now = Date.now(), newCode = () => crypto.randomBytes(24).toString("base64url") }) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  const codes = db.collection("appHandoffs");

  if (req.query?.route === "handoff") {
    const header = String(req.headers?.authorization || "");
    if (!/^Bearer\s+/i.test(header)) return res.status(401).json({ error: "Sign in first." });
    let uid;
    try { uid = (await auth.verifyIdToken(header.replace(/^Bearer\s+/i, ""))).uid; }
    catch { return res.status(401).json({ error: "Sign in again, then try once more." }); }
    const code = newCode();
    try { await codes.doc(hash(code)).set({ uid, expiresAt: now + HANDOFF_TTL_MS }); }
    catch { return res.status(503).json({ error: "Try again in a moment." }); }
    return res.status(200).json({ code });
  }

  // route=handoff-redeem
  const body = typeof req.body === "string" ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : (req.body || {});
  const code = typeof body.code === "string" ? body.code : "";
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(code)) return res.status(400).json({ error: "That link has expired." });
  const ref = codes.doc(hash(code));
  let uid;
  try {
    uid = await db.runTransaction(async t => {
      const snap = await t.get(ref);
      if (!snap.exists) return null;
      const d = snap.data();
      t.delete(ref); // once only, even if it's expired
      return d.expiresAt > now && typeof d.uid === "string" ? d.uid : null;
    });
  } catch { return res.status(503).json({ error: "Try again in a moment." }); }
  if (!uid) return res.status(400).json({ error: "That link has expired." });
  try { return res.status(200).json({ uid, customToken: await auth.createCustomToken(uid) }); }
  catch { return res.status(503).json({ error: "Try again in a moment." }); }
}
