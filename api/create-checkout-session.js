// /api/create-checkout-session.js — Knox Knows
// Creates a Stripe checkout session for the authenticated user.
// Requires a valid Firebase ID token — uid comes from the verified token,
// never from the request body, so it cannot be spoofed.

import Stripe from "stripe";
import { randomUUID, createHash } from 'node:crypto';
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore } from 'firebase-admin/firestore';
import { GIFTS } from './_gifts.js';
import { MEGA_PLAN, compedPlan, megaPrices } from './_plans.js';

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
//   Knox Plus monthly: $9.99/mo  (no trial; Mega Knox monthly has a 3-day trial)
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
// Two paid plans (Nov 2026): 'super' = Knox Plus, 'max' = Mega Knox. Mega's
// Stripe prices come from env vars (see api/_plans.js megaPrices).
const PRICES = {
  super: {
    monthly: "price_1UBcoACqlxC7aoKRR3DFKNhJ",  // Knox Plus $9.99/mo
    yearly:  "price_1UBcpYCqlxC7aoKR7FUFZ0e2",  // Knox Plus $79.99/yr
  },
  get max() { return megaPrices(); },          // Mega Knox $12.99/mo, $99.99/yr
};

// Stripe portal settings for upgrades: charge the difference right away and
// offer only Knox's current prices. Made once, then reused (saved in Firestore).
const UPGRADE_PORTAL_VERSION = 1;
async function upgradePortalConfig(stripe) {
  const ref = db.collection('billingConfig').doc('upgradePortal');
  const saved = (await ref.get()).data();
  if (saved?.id && saved.version === UPGRADE_PORTAL_VERSION) return saved.id;
  const priceIds = [PRICES.super.monthly, PRICES.super.yearly, PRICES.max.monthly, PRICES.max.yearly].filter(Boolean);
  const byProduct = new Map();
  for (const id of priceIds) {
    const price = await stripe.prices.retrieve(id);
    const product = typeof price.product === 'string' ? price.product : price.product?.id;
    byProduct.set(product, [...(byProduct.get(product) || []), id]);
  }
  const baseUrl = (process.env.APP_URL || 'https://knoxknowsapp.com').replace(/\/$/, '');
  const config = await stripe.billingPortal.configurations.create({
    business_profile: { headline: 'Upgrade your Knox Knows plan', privacy_policy_url: `${baseUrl}/privacy`, terms_of_service_url: `${baseUrl}/terms` },
    default_return_url: `${baseUrl}/app`,
    features: {
      subscription_update: {
        enabled: true, default_allowed_updates: ['price'], proration_behavior: 'always_invoice',
        products: [...byProduct].map(([product, prices]) => ({ product, prices })),
      },
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
    },
    metadata: { knox: 'upgrade', version: String(UPGRADE_PORTAL_VERSION) },
  }, { idempotencyKey: `knox-upgrade-portal-v${UPGRADE_PORTAL_VERSION}` });
  await ref.set({ id: config.id, version: UPGRADE_PORTAL_VERSION });
  return config.id;
}

// Which plan a subscription price is: tier 1 = Knox Plus, 2 = Mega Knox.
function planOfPrice(priceId) {
  for (const [key, tier] of [['super', 1], ['max', 2]]) {
    const prices = PRICES[key];
    if (priceId && priceId === prices.monthly) return { tier, yearly: false };
    if (priceId && priceId === prices.yearly) return { tier, yearly: true };
  }
  return null;
}

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

  // Gift a Knox Plus code: a one-time payment, not a subscription. The webhook
  // makes the code and emails it to the buyer (see api/_gifts.js).
  if (req.body?.gift != null) return giftCheckout(res, req.body.gift, verifiedUid, verifiedEmail);

  // 2. Validate plan and billing from request body
  const { plan, billing = "monthly" } = req.body || {};
  const priceId = Object.hasOwn(PRICES, plan) && ['monthly', 'yearly'].includes(billing)
    ? PRICES[plan][billing] : null;
  if (!priceId) {
    if (plan === MEGA_PLAN && ['monthly', 'yearly'].includes(billing)) return res.status(503).json({ error: "Mega Knox isn't available just yet. Please try again soon." });
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
      // Switching between Knox Plus and Mega Knox (or monthly/yearly) changes
      // the existing subscription's price — never a second subscription.
      // Stripe prorates: the difference is charged or credited.
      const currentPrice = currentSubscription.items?.data?.[0];
      const priorSwitch = (await checkoutRef.get()).data()?.switchAttempt;
      const active = ['active', 'trialing'].includes(currentSubscription.status);
      // Recover an update that Stripe applied before a response/Firestore failure.
      if (priorSwitch?.subscriptionId === subscriptionId && active && currentPrice?.price?.id === priorSwitch.priceId) {
        await checkoutRef.set({ switchAttempt: null }, { merge: true });
        if (priorSwitch.priceId === priceId && priorSwitch.billing === billing) {
          return res.status(200).json({ switched: true, plan, billing });
        }
      }
      // A cancelled subscription cannot receive the pending update; let the
      // normal replacement-checkout reconciliation proceed without that intent.
      if (priorSwitch?.subscriptionId === subscriptionId && ['canceled', 'incomplete_expired'].includes(currentSubscription.status)) {
        await checkoutRef.set({ switchAttempt: null }, { merge: true });
      }
      const pendingSwitch = (await checkoutRef.get()).data()?.switchAttempt;
      if (pendingSwitch && (pendingSwitch.subscriptionId !== subscriptionId || pendingSwitch.priceId !== priceId || pendingSwitch.billing !== billing)) {
        return res.status(409).json({ error: 'Your previous plan change is still being confirmed. Retry that selection before choosing another plan.' });
      }
      if (active && currentPrice && currentPrice.price?.id !== priceId) {
        // Reconcile historical direct-update intents above, but never re-charge
        // an unresolved one or accept a browser-supplied confirmation as a quote.
        if (pendingSwitch) return res.status(409).json({ error: 'A previous plan change is still being confirmed. Check Manage billing or contact support before trying again.' });
        const from = planOfPrice(currentPrice.price?.id);
        const to = { tier: plan === 'max' ? 2 : 1, yearly: billing === 'yearly' };
        if (!from) return res.status(409).json({ error: 'This older subscription needs to be changed in Manage billing. Please contact support if you need help.' });
        if (to.tier < from.tier || (from.yearly && !to.yearly)) {
          return res.status(409).json({ error: to.tier < from.tier
            ? "You're on Mega Knox, which already includes everything in Knox Plus."
            : "You can't switch to a shorter billing period. Manage your plan in Manage billing." });
        }
        if (currentSubscription.cancel_at_period_end || currentSubscription.cancel_at) {
          return res.status(409).json({ error: 'Your plan is set to end. Resume it in Manage billing first, then upgrade.' });
        }
        // Stripe owns the exact invoice, tax/credits, billing-cycle reset, card
        // authentication and payment confirmation. Never estimate or charge a
        // backup amount in Knox if the hosted confirmation is unavailable.
        try {
          const baseUrl = (process.env.APP_URL || 'https://knoxknowsapp.com').replace(/\/$/, '');
          const session = await stripe.billingPortal.sessions.create({
            customer: currentSubscription.customer,
            configuration: await upgradePortalConfig(stripe),
            return_url: `${baseUrl}/about#pricing`,
            flow_data: {
              type: 'subscription_update_confirm',
              subscription_update_confirm: { subscription: subscriptionId, items: [{ id: currentPrice.id, price: priceId, quantity: currentPrice.quantity || 1 }] },
              after_completion: { type: 'redirect', redirect: { return_url: `${baseUrl}/app?payment=success&switched=${plan === 'max' ? 'max' : 'plus'}` } },
            },
          });
          if (session?.url && new URL(session.url).origin === 'https://billing.stripe.com') return res.status(200).json({ url: session.url, plan, billing });
          throw new Error('Invalid Stripe confirmation URL');
        } catch (err) {
          console.error('Upgrade confirmation unavailable:', err.message);
          return res.status(503).json({ error: 'Stripe could not open your upgrade confirmation. No upgrade was requested by Knox. Please try again, or use Manage billing.' });
        }
      }
      if (['active', 'trialing', 'past_due', 'unpaid'].includes(currentSubscription.status)) {
        return res.status(409).json({ error: currentPrice?.price?.id === priceId ? "You're already on this plan." : 'You already have a subscription. Use Manage Billing to change it.' });
      }
      if (['canceled', 'incomplete_expired'].includes(currentSubscription.status)) {
        // Reconcile a missed cancellation webhook before a replacement checkout.
        await db.runTransaction(async tx => {
          const ref = db.collection('users').doc(verifiedUid);
          const latest = await tx.get(ref);
          if (latest.data()?.stripeSubscription === subscriptionId) {
            // Comped users keep their free Knox Plus.
            const comped = latest.data()?.comped === true;
            tx.set(ref, { stripeSubscription: null, plan: comped ? compedPlan(latest.data()) : 'free', planStatus: comped ? 'comped' : 'cancelled' }, { merge: true });
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

    // 3-day free trial on Mega Knox MONTHLY only (Knox Plus has no trial).
    // Yearly buyers are already committing — they don't need a trial, and a
    // trial on a $79.99 annual purchase reads as gimmicky rather than useful.
    // 3 days is enough for a student to try it during a homework session or
    // two, without giving away a full week's worth of unlimited usage.
    // Note: `plan === "super"` is the internal Stripe plan value that maps to
    // the Knox Plus display name. Legacy — see webhook.js PLAN_NAMES for the
    // same 'super' → Knox Plus display mapping.
    let subscriptionData = { metadata: { plan, billing, uid: verifiedUid } };
    if (plan === MEGA_PLAN && billing === "monthly") {
      // The trial is for first-time subscribers only. Without this check,
      // anyone could subscribe, cancel inside the 3 days and re-subscribe
      // for another free trial, indefinitely. A subscription that never got
      // past a failed first payment (incomplete) doesn't count as a trial used.
      const userData = userSnap.exists ? userSnap.data() : {};
      let hadSubscription = !!(userData.planActivatedAt || userData.stripeSubscription || userData.trialDenied);
      if (!hadSubscription) hadSubscription = subscriptions.some(sub => !['incomplete', 'incomplete_expired'].includes(sub.status));
      if (!hadSubscription) subscriptionData.trial_period_days = 3;
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

async function giftCheckout(res, gift, uid, email) {
  const g = Object.hasOwn(GIFTS, gift) ? GIFTS[gift] : null;
  if (!g) return res.status(400).json({ error: "Choose a gift: Knox Plus or Mega Knox, for 1, 3 or 12 months." });
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { timeout: 10000, maxNetworkRetries: 1 });
    // Same return address rule as plan checkout: a preview comes back to itself.
    const baseUrl = process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : (process.env.APP_URL || 'https://knoxknowsapp.com').replace(/\/$/, '');
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: email,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: g.cents,
          product_data: {
            name: `${g.name} gift — ${g.label}`,
            description: "A gift code for Knox Plus. Not a subscription — it never renews or charges the person you give it to.",
          },
        },
      }],
      success_url: `${baseUrl}/app?gift_purchase=success`,
      cancel_url:  `${baseUrl}/app?buy_gift=1`,
      metadata: { kind: "gift", gift, uid, email },
      payment_intent_data: { metadata: { kind: "gift", gift, uid } },
    }, { idempotencyKey: `knox-gift-${randomUUID()}` });
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("Gift checkout error:", err.message);
    return res.status(500).json({ error: "Could not open checkout. Please try again." });
  }
}
