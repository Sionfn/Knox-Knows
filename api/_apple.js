import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { Environment, SignedDataVerifier, VerificationStatus } from "@apple/app-store-server-library";

export const APPLE_BUNDLE_ID = "com.knoxknowsapp.app";
const APPLE_APP_ID = 6833644500;
export const APPLE_PRODUCTS = Object.freeze({
  "com.knoxknowsapp.plus.monthly": "plus",
  "com.knoxknowsapp.plus.yearly": "plus",
  "com.knoxknowsapp.mega.monthly": "mega",
  "com.knoxknowsapp.mega.yearly": "mega",
});
const roots = [readFileSync(new URL("./certs/AppleRootCA-G3.cer", import.meta.url))];
const production = new SignedDataVerifier(roots, true, Environment.PRODUCTION, APPLE_BUNDLE_ID, APPLE_APP_ID);
const sandbox = new SignedDataVerifier(roots, true, Environment.SANDBOX, APPLE_BUNDLE_ID);

export function appleAccountToken(uid) {
  const h = crypto.createHash("sha256").update("knox-apple:" + uid).digest("hex");
  const variant = ((parseInt(h[16], 16) & 3) | 8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const id = value => typeof value === "string" && /^[0-9]{1,40}$/.test(value);
const sandboxAllowed = uid => (process.env.APPLE_SANDBOX_UIDS || "").split(",").some(x => x.trim() === uid);
const allowEnvironment = (environment, uid, allowSandbox) =>
  environment === Environment.PRODUCTION || (environment === Environment.SANDBOX && allowSandbox(uid));
const boundedJws = value => typeof value === "string" && value.length > 0 && value.length <= 32768;

async function verifyWithApple(method, jws) {
  if (!boundedJws(jws)) throw Error("Invalid signed data.");
  try {
    return await production[method](jws);
  } catch (error) {
    // The official verifier checks the signed environment before using its data.
    if (![VerificationStatus.INVALID_ENVIRONMENT, VerificationStatus.INVALID_APP_IDENTIFIER].includes(error.status)) throw error;
    return sandbox[method](jws);
  }
}

export function appleState(tx, now = Date.now()) {
  const tier = Object.hasOwn(APPLE_PRODUCTS, tx?.productId) ? APPLE_PRODUCTS[tx.productId] : null;
  const until = Number(tx?.expiresDate) || 0;
  const active = !!tier && !tx.revocationDate && !tx.isUpgraded && until > now;
  return { tier, active, until: active ? until : 0 };
}

function validTransaction(tx) {
  return tx?.bundleId === APPLE_BUNDLE_ID && Object.hasOwn(APPLE_PRODUCTS, tx.productId) &&
    id(tx.originalTransactionId) && id(tx.transactionId) &&
    Number.isSafeInteger(tx.purchaseDate) && tx.purchaseDate > 0 &&
    Number.isSafeInteger(tx.signedDate) && tx.signedDate >= tx.purchaseDate &&
    Number.isSafeInteger(tx.expiresDate) && tx.expiresDate >= tx.purchaseDate;
}

function chainKey(tx) {
  // Apple production IDs were used directly by earlier builds. Keep those links.
  return tx.environment === Environment.SANDBOX ? "sandbox-" + tx.originalTransactionId : tx.originalTransactionId;
}

function nextState(tx, old, { eventDate, graceUntil, refundReversed }) {
  const same = old?.transactionId === tx.transactionId;
  const signedAt = Math.max(tx.signedDate, eventDate || 0);
  if (old?.purchaseDate > tx.purchaseDate ||
      (old?.purchaseDate === tx.purchaseDate && old.signedAt > signedAt)) return old;
  // A stale client receipt cannot undo a refund or overwrite a grace period.
  if (same && old.revoked && !refundReversed && !tx.revocationDate) return old;
  const revoked = !!(tx.revocationDate || tx.isUpgraded);
  const until = revoked ? 0 : Math.max(tx.expiresDate, graceUntil || 0, same ? old.until : 0);
  return {
    transactionId: tx.transactionId, purchaseDate: tx.purchaseDate, signedAt, revoked, until,
    productId: tx.productId, tier: APPLE_PRODUCTS[tx.productId], environment: tx.environment,
    originalTransactionId: tx.originalTransactionId,
  };
}

function project(chains, now) {
  const active = Object.values(chains).filter(x => x.until > now);
  const plus = active.filter(x => x.tier === "plus").sort((a, b) => b.until - a.until)[0];
  const mega = active.filter(x => x.tier === "mega").sort((a, b) => b.until - a.until)[0];
  const best = mega || plus;
  return {
    appleTier: best?.tier || null, appleUntil: best?.until || 0,
    applePlusUntil: plus?.until || 0, appleMegaUntil: mega?.until || 0,
    appleProductId: best?.productId || "", appleOriginalTransactionId: best?.originalTransactionId || "",
    appleEnvironment: best?.environment || "", appleUpdatedAt: now,
  };
}

async function apply(db, uid, updates, now) {
  const account = db.collection("appleEntitlements").doc(uid);
  const user = db.collection("users").doc(uid);
  const links = new Map(updates.map(({ tx }) => [chainKey(tx), db.collection("appleSubscriptions").doc(chainKey(tx))]));
  return db.runTransaction(async t => {
    const [record, userRecord, ...owners] = await Promise.all([t.get(account), t.get(user), ...[...links.values()].map(link => t.get(link))]);
    const existing = userRecord.data();
    // Notifications after an account deletion must not recreate the user.
    if (!userRecord.exists) throw Object.assign(Error("Knox account unavailable."), { status: 404 });
    for (const owner of owners) {
      if (owner.exists && owner.data().uid !== uid) {
        throw Object.assign(Error("This App Store subscription belongs to another Knox account."), { status: 409 });
      }
    }
    const chains = { ...record.data()?.chains };
    if (!record.exists && id(existing.appleOriginalTransactionId) && Object.hasOwn(APPLE_PRODUCTS, existing.appleProductId)) {
      const originalTransactionId = existing.appleOriginalTransactionId;
      const environment = existing.appleEnvironment || Environment.PRODUCTION;
      const key = chainKey({ originalTransactionId, environment });
      if (!links.has(key)) chains[key] = {
        productId: existing.appleProductId, tier: APPLE_PRODUCTS[existing.appleProductId],
        until: Number(existing.appleUntil) || 0, originalTransactionId, environment,
      };
    }
    for (const { tx, ...options } of updates) {
      const key = chainKey(tx);
      chains[key] = nextState(tx, chains[key], options);
    }
    // Keep revocation markers for replay protection. Apple subscription chains are
    // created infrequently, and only Apple-signed transactions can create them.
    t.set(account, { chains });
    for (const [key, link] of links) t.set(link, { uid, environment: chains[key].environment }, { merge: true });
    const fields = project(chains, now);
    t.set(user, fields, { merge: true });
    return fields;
  });
}

export default async function apple(req, res, {
  db, auth, now = Date.now(),
  enabled = process.env.APPLE_PURCHASES_ENABLED === "1",
  allowSandbox = sandboxAllowed,
  verifyTransaction = jws => verifyWithApple("verifyAndDecodeTransaction", jws),
  verifyNotification = jws => verifyWithApple("verifyAndDecodeNotification", jws),
  verifyRenewal = jws => verifyWithApple("verifyAndDecodeRenewalInfo", jws),
}) {
  res.setHeader("Cache-Control", "no-store");
  const notification = req.query?.route === "apple-notify";
  const unavailable = () => res.status(503).json({ error: "App Store subscriptions are temporarily unavailable." });
  if (!notification && req.method === "GET") return res.status(200).json({ purchasesAvailable: enabled });
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  const body = typeof req.body === "string" ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : (req.body || {});
  if (notification) {
    let note, tx, graceUntil;
    try {
      note = await verifyNotification(body?.signedPayload);
      const data = note?.data;
      if (!data?.signedTransactionInfo) return res.status(200).json({ ok: true });
      tx = await verifyTransaction(data.signedTransactionInfo);
      if (!validTransaction(tx) || data.environment !== tx.environment) return res.status(400).json({ error: "Invalid transaction." });
      if (data.status === 4 && data.signedRenewalInfo) {
        const renewal = await verifyRenewal(data.signedRenewalInfo);
        if (renewal.originalTransactionId === tx.originalTransactionId && renewal.environment === tx.environment) {
          graceUntil = renewal.gracePeriodExpiresDate;
        }
      }
    } catch (error) {
      if (error.status === VerificationStatus.RETRYABLE_VERIFICATION_FAILURE) return unavailable();
      return res.status(400).json({ error: "Invalid notification." });
    }
    try {
      const link = await db.collection("appleSubscriptions").doc(chainKey(tx)).get();
      let uid = link.data()?.uid;
      if (!uid && tx.appAccountToken) {
        const found = await db.collection("users").where("appleAccountToken", "==", String(tx.appAccountToken).toLowerCase()).limit(1).get();
        uid = found.docs[0]?.id;
      }
      if (uid && allowEnvironment(tx.environment, uid, allowSandbox)) {
        await apply(db, uid, [{ tx, graceUntil, eventDate: note.signedDate, refundReversed: note.notificationType === "REFUND_REVERSED" }], now);
      }
      return res.status(200).json({ ok: true });
    } catch (error) {
      if (error.status === 404) return res.status(200).json({ ok: true });
      return unavailable(); // Ask Apple to retry a transient storage failure.
    }
  }

  const header = String(req.headers?.authorization || "");
  if (!/^Bearer\s+/i.test(header)) return res.status(401).json({ error: "Sign in first." });
  let uid;
  try { uid = (await auth.verifyIdToken(header.replace(/^Bearer\s+/i, ""))).uid; }
  catch { return res.status(401).json({ error: "Sign in again, then try once more." }); }

  const accountToken = appleAccountToken(uid);
  if (body?.action === "token") {
    if (!enabled && !allowSandbox(uid)) return unavailable();
    try {
      const user = db.collection("users").doc(uid);
      const account = await user.get();
      const billing = account.data();
      if (billing?.stripeSubscription && !["cancelled", "canceled", "expired", "incomplete_expired"].includes(billing.planStatus)) {
        return res.status(409).json({ error: "Your Knox subscription is billed through the website. Manage it there to avoid a second subscription." });
      }
      await user.update({ appleAccountToken: accountToken });
      return res.status(200).json({ accountToken });
    } catch { return unavailable(); }
  }
  if (body?.action === "status") return res.status(200).json({ purchasesAvailable: enabled || allowSandbox(uid) });
  if (body?.action !== "verify" || !Array.isArray(body.transactions) || body.transactions.length > 20 || !body.transactions.every(boundedJws)) {
    return res.status(400).json({ error: "Invalid request." });
  }

  const updates = [];
  for (const jws of new Set(body.transactions)) {
    let tx;
    try { tx = await verifyTransaction(jws); }
    catch (error) {
      if (error.status === VerificationStatus.RETRYABLE_VERIFICATION_FAILURE) return unavailable();
      continue;
    }
    if (!validTransaction(tx) || !allowEnvironment(tx.environment, uid, allowSandbox)) continue;
    if (String(tx.appAccountToken || "").toLowerCase() !== accountToken) continue;
    updates.push({ tx });
  }
  if (!updates.length) return res.status(200).json({ tier: null, acceptedTransactionIds: [] });
  try {
    const fields = await apply(db, uid, updates, now);
    return res.status(200).json({
      tier: fields.appleTier, until: fields.appleUntil,
      acceptedTransactionIds: [...new Set(updates.map(({ tx }) => tx.transactionId))],
    });
  } catch (error) {
    if (error.status === 409) return res.status(409).json({ error: error.message });
    return unavailable();
  }
}
