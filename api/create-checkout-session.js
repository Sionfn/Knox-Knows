// /api/create-checkout-session.js — Knox Knows
// Creates a Stripe checkout session for the authenticated user.
// Requires a valid Firebase ID token — uid comes from the verified token,
// never from the request body, so it cannot be spoofed.

import Stripe from "stripe";
import { randomUUID, createHash } from 'node:crypto';
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore } from 'firebase-admin/firestore';

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

// ─────────────────────────────────────────────────────────────────────────
// PRICING MATRIX (Sept 2026 reset — one plan: Knox Plus at $9.99/$79.99):
//   Knox Plus monthly: $9.99/mo  (7-day free trial)
//   Knox Plus yearly:  $79.99/yr ($6.67/mo effective, 33% savings vs monthly)
//
// The "max" tier is a legacy holdover — we consolidated to one paid plan.
// New checkouts always use `plan: "super"` which maps to Knox Plus. The
// "max" entry stays here in case any old link/button still passes it, so
// those requests don't 400 out — they'll fall through to the same prices.
//
// IMPORTANT — when rolling out new pricing:
//   1. In Stripe Dashboard, add new Prices to the existing Product (never
//      edit an existing Price — Stripe locks the amount after any charge).
//   2. Replace the price_xxx values below with the new IDs.
//   3. Also add the new IDs to api/webhook.js' PRICE_TO_PLAN map so the
//      webhook recognizes them (do NOT remove the old IDs — grandfathered
//      subscribers still pay via them).
//   4. Update the user-facing prices in index.html.
// ─────────────────────────────────────────────────────────────────────────
const PRICES = {
  // Both 'super' and legacy 'max' route to the same current Knox Plus
  // prices — one paid plan across the board.
  super: {
    monthly: "price_1UBcoACqlxC7aoKRR3DFKNhJ",  // $9.99/mo (Sept 2026 reset)
    yearly:  "price_1UBcpYCqlxC7aoKR7FUFZ0e2",  // $79.99/yr (Sept 2026 reset)
  },
  max: {
    monthly: "price_1UBcoACqlxC7aoKRR3DFKNhJ",  // routes to Knox Plus monthly
    yearly:  "price_1UBcpYCqlxC7aoKR7FUFZ0e2",  // routes to Knox Plus yearly
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  // Preview shares the production Stripe keys but cannot receive production
  // webhooks behind Vercel Authentication. Never create a real charge there.
  if (process.env.VERCEL_ENV === 'preview') {
    return res.status(403).json({ error: 'Billing is disabled in the private preview. Use the public site for subscription changes.' });
  }

  // 1. Verify Firebase token
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  let decodedToken;
  try {
    decodedToken = await adminAuth.verifyIdToken(authHeader.slice(7));
  } catch (err) {
    return res.status(401).json({ error: "Unauthorized — invalid or expired token." });
  }
  const { uid: verifiedUid, email: verifiedEmail } = decodedToken;
  if (!verifiedEmail || !verifiedUid) {
    return res.status(401).json({ error: "Unauthorized — token missing uid or email." });
  }

  // 2. Validate plan and billing from request body
  const { plan, billing = "monthly" } = req.body || {};
  const priceId = Object.hasOwn(PRICES, plan) && ['monthly', 'yearly'].includes(billing)
    ? PRICES[plan][billing] : null;
  if (!priceId) {
    return res.status(400).json({ error: "Invalid plan or billing period." });
  }

  const checkoutRef = db.collection('checkoutLocks').doc(verifiedUid);
  const lockOwner = randomUUID();
  let locked = false;
  try {
    locked = await db.runTransaction(async tx => {
      const snap = await tx.get(checkoutRef);
      if ((snap.data()?.leaseUntil || 0) > Date.now()) return false;
      tx.set(checkoutRef, { lockOwner, leaseUntil: Date.now() + 120000 }, { merge: true });
      return true;
    });
    if (!locked) return res.status(409).json({ error: 'Checkout is already opening. Please wait a moment and try again.' });
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { timeout: 10000, maxNetworkRetries: 1 });

    // Reuse only this user's customer record. Email alone is not proof that a
    // Stripe customer belongs to the same Firebase account.
    const userSnap = await db.collection('users').doc(verifiedUid).get();
    const customerId = userSnap.exists ? userSnap.data().stripeCustomerId : null;
    const subscriptionId = userSnap.exists ? userSnap.data().stripeSubscription : null;
    if (subscriptionId) {
      const currentSubscription = await stripe.subscriptions.retrieve(subscriptionId);
      if (['active', 'trialing', 'past_due', 'unpaid'].includes(currentSubscription.status)) {
        return res.status(409).json({ error: 'You already have a subscription. Use Manage Billing to change it.' });
      }
      if (['canceled', 'incomplete_expired'].includes(currentSubscription.status)) {
        // Reconcile a missed cancellation webhook before a replacement checkout.
        await db.runTransaction(async tx => {
          const ref = db.collection('users').doc(verifiedUid);
          const latest = await tx.get(ref);
          if (latest.data()?.stripeSubscription === subscriptionId) {
            tx.set(ref, { stripeSubscription: null, plan: 'free', planStatus: 'cancelled' }, { merge: true });
          }
        });
      }
    }
    let customer;
    if (customerId) {
      customer = await stripe.customers.retrieve(customerId);
      if (customer.deleted || (customer.metadata?.uid && customer.metadata.uid !== verifiedUid)) {
        return res.status(409).json({ error: 'Billing account mismatch. Please contact support.' });
      }
    }
    if (!customer) {
      // Use Stripe's search API to find customers by uid metadata directly
      // — precise and doesn't cap at 10 records like `.list()` did. Falls
      // back to the list scan on any search failure (search isn't enabled
      // on every account) so a legacy uid-metadata-tagged customer still
      // matches. Without this, users with more than 10 email-matched
      // customer records (test/legacy/duplicate accounts) could get a
      // brand-new customer created next to their real one, stranding
      // saved payment methods and subscription history.
      try {
        const search = await stripe.customers.search({ query: `metadata['uid']:'${verifiedUid}'`, limit: 1 });
        customer = search.data[0] || null;
      } catch (_) { /* search unavailable — fall through to list */ }
      if (!customer) {
        const matches = await stripe.customers.list({ email: verifiedEmail, limit: 100 });
        customer = matches.data.find(candidate => candidate.metadata?.uid === verifiedUid);
      }
    }
    if (!customer) {
      customer = await stripe.customers.create({
        email: verifiedEmail,
        metadata: { uid: verifiedUid },
      }, { idempotencyKey: 'knox-customer-' + createHash('sha256').update(verifiedUid).digest('hex') });
    }
    // Link immediately, before redirecting; do not wait for a payment webhook.
    await db.collection('users').doc(verifiedUid).set({ stripeCustomerId: customer.id }, { merge: true });
    const subscriptions = [];
    let cursor;
    do {
      const page = await stripe.subscriptions.list({ customer: customer.id, status: 'all', limit: 100, ...(cursor ? { starting_after: cursor } : {}) });
      subscriptions.push(...page.data);
      cursor = page.has_more && page.data.length ? page.data.at(-1).id : null;
    } while (cursor);
    if (subscriptions.some(sub => ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused'].includes(sub.status))) {
      return res.status(409).json({ error: 'You already have a subscription or a pending payment. Use Manage Billing to resolve it.' });
    }
    const previousAttempt = (await checkoutRef.get()).data() || {};
    if (previousAttempt.sessionId) {
      const openSession = await stripe.checkout.sessions.retrieve(previousAttempt.sessionId);
      if (openSession.status === 'open') {
        if (previousAttempt.billing === billing && previousAttempt.plan === plan) return res.status(200).json({ url: openSession.url });
        await stripe.checkout.sessions.expire(openSession.id);
      } else if (openSession.status === 'complete') {
        const priorSubscription = subscriptions.find(sub => sub.id === (openSession.subscription?.id || openSession.subscription));
        if (!priorSubscription || !['canceled', 'incomplete_expired'].includes(priorSubscription.status)) {
          return res.status(409).json({ error: 'Your previous checkout completed. Please refresh your account or use Manage Billing.' });
        }
      }
    }
    // Retain an uncertain attempt's key across retries (e.g. a network timeout).
    if (previousAttempt.attemptKey && !previousAttempt.sessionId && (previousAttempt.billing !== billing || previousAttempt.plan !== plan)) {
      return res.status(409).json({ error: 'Please retry your previous billing selection before changing plans.' });
    }
    const attemptKey = previousAttempt.attemptKey && !previousAttempt.sessionId ? previousAttempt.attemptKey : randomUUID();
    await checkoutRef.set({ attemptKey, billing, plan, sessionId: null }, { merge: true });

    const baseUrl = process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : (process.env.APP_URL || 'https://knoxknowsapp.com').replace(/\/$/, '');

    // 7-day free trial on Knox Plus MONTHLY only.
    // Yearly buyers are already committing — they don't need a trial, and a
    // trial on a $79.99 annual purchase reads as gimmicky rather than useful.
    // 7 days is enough for a student to try it during a homework session or
    // two, without giving away a full week's worth of unlimited usage.
    // Note: `plan === "super"` is the internal Stripe plan value that maps to
    // the Knox Plus display name. Legacy — see webhook.js PLAN_NAMES for the
    // same 'super' → Knox Plus display mapping.
    let subscriptionData = { metadata: { plan, billing, uid: verifiedUid } };
    if (plan === "super" && billing === "monthly") {
      // The trial is for first-time subscribers only. Without this check,
      // anyone could subscribe, cancel inside the 7 days and re-subscribe
      // for another free week, indefinitely. A subscription that never got
      // past a failed first payment (incomplete) doesn't count as a trial used.
      const userData = userSnap.exists ? userSnap.data() : {};
      let hadSubscription = !!(userData.planActivatedAt || userData.stripeSubscription);
      if (!hadSubscription) hadSubscription = subscriptions.some(sub => !['incomplete', 'incomplete_expired'].includes(sub.status));
      if (!hadSubscription) subscriptionData.trial_period_days = 7;
    }

    const session = await stripe.checkout.sessions.create({
      mode:              "subscription",
      customer:          customer.id,
      line_items:        [{ price: priceId, quantity: 1 }],
      subscription_data: subscriptionData,
      success_url:       `${baseUrl}/app?payment=success`,
      cancel_url:        `${baseUrl}/about?payment=cancelled`,
      allow_promotion_codes: true,
      // Send Stripe's official payment receipt to the customer. This is in
      // addition to our own Resend plan-upgrade email — Stripe's receipt
      // is tax-deductible and gives the customer a formal record.
      // Note: receipt_email is not allowed in subscription mode; instead we
      // rely on the customer's email being set (above) and Stripe's default
      // email settings (enable in Dashboard → Settings → Customer emails).
      metadata: { uid: verifiedUid, email: verifiedEmail, plan, billing },
    }, { idempotencyKey: `knox-checkout-${attemptKey}` });
    await checkoutRef.set({ sessionId: session.id }, { merge: true });

    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error("Stripe checkout error:", err.message);
    return res.status(500).json({ error: "Could not open checkout. Please try again." });
  } finally {
    if (locked) await db.runTransaction(async tx => {
      const snap = await tx.get(checkoutRef);
      if (snap.data()?.lockOwner === lockOwner) tx.set(checkoutRef, { leaseUntil: 0 }, { merge: true });
    }).catch(err => console.error('Checkout lock release failed:', err.message));
  }
}
