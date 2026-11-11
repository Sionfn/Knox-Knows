// api/_apple.js — Knox plans bought in the iPhone app (Apple in-app subscriptions).
//
//   POST /api/me?route=apple         (signed in)  { action: 'token' }            → { accountToken }
//                                                 { action: 'verify', transactions: [jws, …] } → { tier }
//   POST /api/me?route=apple-notify  (Apple's App Store Server Notifications V2)  { signedPayload }
//
// Every purchase comes signed by Apple (a JWS whose certificate chain ends at
// Apple Root CA - G3). We check that chain and signature here, so no Apple keys
// or secrets are needed. A purchase carries the student's appAccountToken (made
// from their Knox account), so it can only unlock the account that bought it.
// An active Apple subscription sets appleTier/appleUntil, which tierOf() reads.
import crypto from "crypto";

export const APPLE_BUNDLE_ID = "com.knoxknowsapp.app";
export const APPLE_PRODUCTS = {
  "com.knoxknowsapp.plus.monthly": "plus",
  "com.knoxknowsapp.plus.yearly": "plus",
  "com.knoxknowsapp.mega.monthly": "mega",
  "com.knoxknowsapp.mega.yearly": "mega",
};
// SHA-256 of Apple Root CA - G3 (apple.com/certificateauthority).
const APPLE_ROOT_SHA256 = "63343ABFB89A6A03EBB57E9B3F5FA7BE7C4F5C756F3017B3A8C488C3653E9179";

const fromB64url = s => Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");

// Checks an Apple-signed JWS and returns its payload; throws if it isn't Apple's.
export function verifyAppleJws(jws, { rootSha256 = APPLE_ROOT_SHA256 } = {}) {
  const parts = String(jws || "").split(".");
  if (parts.length !== 3) throw Error("Not a signed Apple payload.");
  const header = JSON.parse(fromB64url(parts[0]).toString("utf8"));
  if (header.alg !== "ES256" || !Array.isArray(header.x5c) || header.x5c.length < 2) throw Error("Unexpected Apple signature format.");
  const chain = header.x5c.map(c => new crypto.X509Certificate(Buffer.from(c, "base64")));
  const root = chain[chain.length - 1];
  if (root.fingerprint256.replace(/:/g, "").toUpperCase() !== rootSha256) throw Error("Not signed by Apple.");
  for (let i = 0; i < chain.length - 1; i++) {
    if (!chain[i].checkIssued(chain[i + 1]) || !chain[i].verify(chain[i + 1].publicKey)) throw Error("Broken Apple certificate chain.");
  }
  const ok = crypto.verify("sha256", Buffer.from(parts[0] + "." + parts[1]), { key: chain[0].publicKey, dsaEncoding: "ieee-p1363" }, fromB64url(parts[2]));
  if (!ok) throw Error("Apple signature does not match.");
  return JSON.parse(fromB64url(parts[1]).toString("utf8"));
}

// The UUID a student's purchases carry (Apple's appAccountToken), made from their uid.
export function appleAccountToken(uid) {
  const h = crypto.createHash("sha256").update("knox-apple:" + uid).digest("hex").split("");
  h[12] = "4"; h[16] = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  const s = h.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

// What one Apple transaction means for the plan right now.
export function appleState(tx, now = Date.now()) {
  const tier = APPLE_PRODUCTS[tx?.productId];
  const until = Number(tx?.expiresDate) || 0;
  const active = !!tier && !tx.revocationDate && until > now;
  return { tier: tier || null, active, until: active ? until : 0 };
}

// Saves the Apple subscription on the account (and which account owns it).
async function apply(db, uid, tx, now) {
  const { tier, active, until } = appleState(tx, now);
  const otid = String(tx.originalTransactionId || "");
  const link = db.collection("appleSubscriptions").doc(otid);
  await db.runTransaction(async t => {
    const owner = await t.get(link);
    if (owner.exists && owner.data().uid !== uid) throw Object.assign(Error("This App Store subscription belongs to another Knox account."), { status: 409 });
    t.set(link, { uid, productId: tx.productId, environment: tx.environment || "", updatedAt: now }, { merge: true });
    t.set(db.collection("users").doc(uid), {
      appleTier: active ? tier : null, appleUntil: until, appleProductId: tx.productId,
      appleOriginalTransactionId: otid, appleEnvironment: tx.environment || "", appleUpdatedAt: now,
    }, { merge: true });
  });
  return active ? tier : null;
}

export default async function apple(req, res, { db, auth, now = Date.now(), rootSha256 = APPLE_ROOT_SHA256 }) {
  const verify = jws => verifyAppleJws(jws, { rootSha256 });
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  const body = typeof req.body === "string" ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : (req.body || {});

  // Apple tells us about renewals, expirations and refunds here.
  if (req.query?.route === "apple-notify") {
    try {
      const note = verify(body.signedPayload);
      const data = note?.data || {};
      if (data.bundleId !== APPLE_BUNDLE_ID || !data.signedTransactionInfo) return res.status(200).json({ ok: true, ignored: true });
      const tx = verify(data.signedTransactionInfo);
      const link = await db.collection("appleSubscriptions").doc(String(tx.originalTransactionId || "")).get();
      let uid = link.exists ? link.data().uid : null;
      if (!uid && tx.appAccountToken) {
        const found = await db.collection("users").where("appleAccountToken", "==", String(tx.appAccountToken).toLowerCase()).limit(1).get();
        uid = found.docs[0]?.id || null;
      }
      if (uid) await apply(db, uid, tx, now);
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(400).json({ error: "Invalid notification." });
    }
  }

  // From the app, signed in.
  const token = String(req.headers?.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Sign in first." });
  let uid;
  try { uid = (await auth.verifyIdToken(token)).uid; } catch { return res.status(401).json({ error: "Sign in again, then try once more." }); }
  const accountToken = appleAccountToken(uid);

  if (body.action === "token") {
    await db.collection("users").doc(uid).set({ appleAccountToken: accountToken }, { merge: true });
    return res.status(200).json({ accountToken });
  }
  if (body.action !== "verify" || !Array.isArray(body.transactions) || body.transactions.length > 20) return res.status(400).json({ error: "Invalid request." });

  let best = null;
  for (const jws of body.transactions) {
    let tx;
    try { tx = verify(jws); } catch { continue; }
    if (tx.bundleId !== APPLE_BUNDLE_ID || !APPLE_PRODUCTS[tx.productId]) continue;
    if (String(tx.appAccountToken || "").toLowerCase() !== accountToken) continue; // bought on another Knox account
    const s = appleState(tx, now);
    if (!best || (s.active && (!best.s.active || (s.tier === "mega" && best.s.tier !== "mega") || s.until > best.s.until))) best = { tx, s };
  }
  if (!best) return res.status(200).json({ tier: null });
  try {
    const tier = await apply(db, uid, best.tx, now);
    return res.status(200).json({ tier, until: best.s.until });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.status ? e.message : "Could not save your purchase. Try Restore purchases." });
  }
}
