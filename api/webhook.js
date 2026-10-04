// /api/webhook.js — Knox Knows
// Listens for Stripe events and saves the user's plan to Firestore.
// Also sends transactional emails (purchase confirmation, refund/cancellation)
// via Resend, using the same minimal house style as the welcome email so
// all Knox emails look consistent and land in the Primary inbox.

import Stripe from "stripe";
import crypto from 'crypto';
import { cert, getApps, initializeApp } from "firebase-admin/app";
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

const db     = getFirestore();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Map Stripe price IDs → plan names.
//
// IMPORTANT: After each price reset, we keep ALL old price IDs in this map
// alongside the new ones. Why? Stripe protects existing subscribers — they
// stay on the price they originally signed up for. The webhook will keep
// receiving events for those old prices for as long as those customers stay
// subscribed, and every entry here must resolve to a valid plan name.
// Deleting an old entry = existing customers losing access on their next
// billing cycle. Never remove, only add.
const PRICE_TO_PLAN = {
  // OLDEST prices (early 2026 — grandfathered)
  "price_1TTqUyCqlxC7aoKR0C9AM3sX": "super",  // Super Monthly $9.99 (old)
  "price_1TTqW6CqlxC7aoKR8nzCDAF3": "super",  // Super Yearly $79.99 (old)
  "price_1TTqWZCqlxC7aoKRESZls3vU": "max",    // Max Monthly $19.99 (old)
  "price_1TTqXnCqlxC7aoKRsOSwHFBy": "max",    // Max Yearly $149.99 (old)
  // MID prices (mid-2026 — grandfathered)
  "price_1Tb16gCqlxC7aoKRxPv4z4BP": "super",  // Super Monthly $7.99
  "price_1Tb17FCqlxC7aoKRIE0BZaWg": "super",  // Super Yearly $59.99
  "price_1Tb17fCqlxC7aoKRgQ3uxxlK": "max",    // Max Monthly $14.99
  "price_1Tb17zCqlxC7aoKRNOYaO73B": "max",    // Max Yearly $119.99
  // CURRENT prices (Sept 2026 reset — one plan: Knox Plus)
  "price_1UBcoACqlxC7aoKRR3DFKNhJ": "super",  // Knox Plus Monthly $9.99
  "price_1UBcpYCqlxC7aoKR7FUFZ0e2": "super",  // Knox Plus Yearly  $79.99
};

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end",  () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// Human-readable plan details used in emails. Both legacy Stripe plan values
// ('super' and 'max') map to the same Knox Plus display since we consolidated
// into one paid tier — existing subscribers keep their old price IDs but
// see the unified brand name in every email going forward.
const PLAN_NAMES = {
  super: { name: "Knox Plus", perks: "basically unlimited questions, unlimited photo uploads, and priority support if something goes wrong" },
  max:   { name: "Knox Plus", perks: "basically unlimited questions, unlimited photo uploads, and priority support if something goes wrong" },
};

// ── Shared email shell ──────────────────────────────────────────────────────
// Identical wrapper used by every Knox email (welcome, purchase, refund) so
// they all look the same. `bodyHtml` is the inner content (a series of <p>s).
function knoxEmailShell(bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;font-size:16px;line-height:1.65;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="text-align:center;margin-bottom:28px;">
      <img src="https://knoxknowsapp.com/knox-logo-square.jpg" alt="Knox Knows" width="48" height="48" style="border-radius:12px;display:inline-block;">
    </div>
    ${bodyHtml}
    <p style="margin:28px 0 0;color:#9CA3AF;font-size:12px;line-height:1.6;border-top:1px solid #E5E7EB;padding-top:18px;">
      You're receiving this because you have a Knox Knows account.<br>
      <a href="https://knoxknowsapp.com" style="color:#9CA3AF;">knoxknowsapp.com</a> &middot;
      <a href="https://knoxknowsapp.com/privacy.html" style="color:#9CA3AF;">Privacy</a> &middot;
      <a href="https://knoxknowsapp.com/terms.html" style="color:#9CA3AF;">Terms</a>
    </p>
  </div>
</body>
</html>`;
}

// Generic email sender (Resend) — used for both purchase and refund emails.
// Switched from SendGrid to Resend: SendGrid's post-trial "free" plan sends 0
// emails, while Resend is free for 3,000/month. Same from/reply-to identity.
async function sendEmail(email, subject, textBody, htmlBody, label) {
  if (!email) {
    console.warn(`Skipping ${label} email — no recipient address`);
    return;
  }
  if (!process.env.RESEND_API_KEY) {
    console.error(`RESEND_API_KEY not set — cannot send ${label} email`);
    return;
  }
  try {
    const fromEmail = process.env.EMAIL_FROM || "support@knoxknowsapp.com";
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from:     `Sion at Knox Knows <${fromEmail}>`,
        to:       [email],
        reply_to: "support@knoxknowsapp.com",
        subject,
        html:     htmlBody,
        text:     textBody,
      }),
    });
    if (!r.ok) {
      const errText = await r.text();
      console.error(`Resend error (${label}):`, errText);
    } else {
      console.log(`✓ ${label} email sent to ${email}`);
    }
  } catch (err) {
    console.warn(`${label} email failed:`, err.message);
  }
}

// ── Purchase confirmation email ─────────────────────────────────────────────
async function sendPurchaseEmail(email, plan) {
  const p = PLAN_NAMES[plan];
  if (!p) return;

  const textBody = `Hey,

Your ${p.name} subscription is active — thanks for upgrading.

Starting now you've got ${p.perks}.

Keep using Knox at https://knoxknowsapp.com. To manage or cancel your subscription anytime, open the account menu in the top-right of the site and choose Manage Billing.

If anything looks off, just reply to this email — it comes straight to me.

— Sion
Knox Knows`;

  const htmlBody = knoxEmailShell(`
    <p style="margin:0 0 16px;">Hey,</p>
    <p style="margin:0 0 16px;">Your <strong>${p.name}</strong> subscription is active — thanks for upgrading.</p>
    <p style="margin:0 0 16px;">Starting now you've got ${p.perks}.</p>
    <p style="margin:0 0 16px;">Keep using Knox at <a href="https://knoxknowsapp.com" style="color:#FF6B00;font-weight:600;">knoxknowsapp.com</a>. To manage or cancel your subscription anytime, open the account menu in the top-right of the site and choose <strong>Manage Billing</strong>.</p>
    <p style="margin:0 0 16px;">If anything looks off, just reply to this email — it comes straight to me.</p>
    <p style="margin:0 0 2px;">— Sion</p>
    <p style="margin:0;color:#6B7280;font-size:14px;">Knox Knows</p>
  `);

  await sendEmail(email, `Your ${p.name} subscription is active`, textBody, htmlBody, "Purchase");
}

// ── Refund / cancellation email ─────────────────────────────────────────────
// Sent when a subscription ends (cancelled by the user, or refunded). Tone is
// warm and no-hard-feelings — we want them to feel fine about coming back.
async function sendRefundEmail(email, plan) {
  const p = PLAN_NAMES[plan] || { name: "your plan" };

  const textBody = `Hey,

Your ${p.name} subscription has been cancelled and you won't be charged again.

Your account is still here — you're back on the free plan with 5 free questions a day (save up to 20), so you can keep using Knox anytime.

If this was a mistake, or there was something about Knox that didn't work for you, just reply to this email and let me know. I read every message personally, and I'd genuinely like to hear what happened.

Thanks for giving Knox Knows a try.

— Sion
Knox Knows`;

  const htmlBody = knoxEmailShell(`
    <p style="margin:0 0 16px;">Hey,</p>
    <p style="margin:0 0 16px;">Your <strong>${p.name}</strong> subscription has been cancelled and you won't be charged again.</p>
    <p style="margin:0 0 16px;">Your account is still here — you're back on the free plan with 5 free questions a day (save up to 20), so you can keep using Knox anytime.</p>
    <p style="margin:0 0 16px;">If this was a mistake, or there was something about Knox that didn't work for you, just reply to this email and let me know. I read every message personally, and I'd genuinely like to hear what happened.</p>
    <p style="margin:0 0 16px;">Thanks for giving Knox Knows a try.</p>
    <p style="margin:0 0 2px;">— Sion</p>
    <p style="margin:0;color:#6B7280;font-size:14px;">Knox Knows</p>
  `);

  await sendEmail(email, `Your ${p.name} subscription has been cancelled`, textBody, htmlBody, "Refund");
}

// ── Idempotency check ──────────────────────────────────────────────────────
// Stripe occasionally retries webhooks. Without idempotency we'd send
// duplicate emails and run duplicate Firestore writes. Returns true if we've
// already processed this event ID, false otherwise (and marks it as seen).
async function claimEvent(eventId) {
  const ref = db.collection("webhookEvents").doc(eventId);
  const claimId = crypto.randomUUID();
  const state = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (snap.exists && snap.data().status === 'done') return 'done';
    if (snap.exists && snap.data().status === 'processing' && Date.now() - snap.data().claimedAt < 120000) return 'processing';
    tx.set(ref, { status: 'processing', claimedAt: Date.now(), claimId });
    return 'claimed';
  });
  return { state, ref, claimId };
}

async function finishEvent(claim, success) {
  await db.runTransaction(async tx => {
    const snap = await tx.get(claim.ref);
    if (!snap.exists || snap.data().claimId !== claim.claimId) return;
    if (success) tx.set(claim.ref, { status: 'done', processedAt: new Date().toISOString() }, { merge: true });
    else tx.delete(claim.ref);
  });
}

async function currentSubscription(subscription) {
  return stripe.subscriptions.retrieve(subscription.id);
}

async function applyActiveSubscription(uid, subscription, options = {}) {
  const plan = PRICE_TO_PLAN[subscription.items?.data?.[0]?.price?.id];
  if (!plan || !['active', 'trialing'].includes(subscription.status)) return false;
  const ref = db.collection('users').doc(uid);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const existing = snap.exists ? snap.data() : {};
    // A delayed checkout event must never replace a different subscription.
    // Its deletion event will clear the old ID before a replacement is applied.
    if (existing.stripeSubscription && existing.stripeSubscription !== subscription.id) return false;
    if (existing.stripeCustomerId && existing.stripeCustomerId !== subscription.customer) return false;
    // Once a subscription has been cancelled, a stale/out-of-order active
    // event for THAT SAME subscription id must not resurrect it. Without
    // this guard, `subscription.deleted` clears stripeSubscription to null,
    // then a straggler `subscription.updated` or `invoice.payment_succeeded`
    // passes the null-short-circuited guard above and writes planStatus:
    // 'active' again — silently re-granting Plus after cancellation.
    // Only a fresh checkout (options.checkout) is allowed to re-activate,
    // and only after the subscription id has been cleared.
    if (!options.checkout && existing.planStatus === 'cancelled' && !existing.stripeSubscription) return false;
    tx.set(ref, {
      plan, planStatus: subscription.status,
      stripeCustomerId: subscription.customer,
      stripeSubscription: subscription.id,
      ...(options.checkout ? { planActivatedAt: new Date().toISOString() } : { planRenewedAt: new Date().toISOString() }),
    }, { merge: true });
    return true;
  });
}

// Resolve uid from a subscription object — checks metadata first, then
// looks up the customer's metadata.
async function resolveUid(subscription) {
  if (subscription.metadata?.uid) return subscription.metadata.uid;
  try {
    const customer = await stripe.customers.retrieve(subscription.customer);
    if (customer.metadata?.uid) return customer.metadata.uid;
  } catch (e) { /* fall through */ }
  return null;
}

// Resolve the customer's email address from a subscription's customer ID.
async function resolveEmail(subscription) {
  try {
    const customer = await stripe.customers.retrieve(subscription.customer);
    return customer.email || null;
  } catch (e) {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const sig     = req.headers["stripe-signature"];
  const rawBody = await getRawBody(req);
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature failed:", err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  // ── Idempotency: skip events we've already handled ──────────────────────
  let claim;
  try { claim = await claimEvent(event.id); }
  catch (err) { console.error('Webhook claim failed:', err); return res.status(500).json({ error: 'Could not process webhook' }); }
  if (claim.state === 'done') {
    console.log(`Skipping duplicate event: ${event.id}`);
    return res.status(200).json({ received: true, duplicate: true });
  }
  if (claim.state === 'processing') return res.status(503).json({ error: 'Event is being processed' });

  // ── Handle events ─────────────────────────────────────────────────────────
  try {
    switch (event.type) {

      // Payment succeeded — activate plan
      case "checkout.session.completed": {
        const session       = event.data.object;
        const uid           = session.metadata?.uid;
        const verifiedEmail = session.metadata?.email || session.customer_email;
        if (!uid) break;

        // Get the price ID from the subscription
        if (!session.subscription) break;
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        const activated = await applyActiveSubscription(uid, subscription, { checkout: true });
        if (!activated) {
          if (['active', 'trialing'].includes(subscription.status)) {
            await db.collection('billingReview').doc(session.id || event.id).set({
              uid, subscriptionId: subscription.id, customerId: subscription.customer,
              eventId: event.id, reason: 'Checkout subscription could not be reconciled',
              createdAt: new Date().toISOString(), resolved: false,
            }, { merge: true });
            console.error('BILLING_REVIEW_REQUIRED', event.id, subscription.id);
          }
          break;
        }
        const plan = PRICE_TO_PLAN[subscription.items.data[0]?.price?.id];

        console.log(`✓ Plan activated: uid=${uid} plan=${plan}`);
        // Send purchase confirmation email
        await sendPurchaseEmail(verifiedEmail, plan);
        break;
      }

      // Subscription renewed — keep plan active
      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        if (invoice.billing_reason === "subscription_create") break; // already handled above

        if (!invoice.subscription) break;
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
        const uid          = await resolveUid(subscription);
        if (uid && await applyActiveSubscription(uid, subscription)) {
          const plan = PRICE_TO_PLAN[subscription.items.data[0]?.price?.id];
          console.log(`✓ Plan renewed: uid=${uid} plan=${plan}`);
        }
        break;
      }

      // Plan changed via customer portal (Super → Max, monthly → yearly, etc.)
      case "customer.subscription.updated": {
        const subscription = await currentSubscription(event.data.object);
        const uid          = await resolveUid(subscription);
        if (uid && subscription.status === 'unpaid') {
          // Stripe can end failed-payment retries by marking a subscription
          // "unpaid" instead of cancelling it (Billing → Subscriptions settings).
          // No deletion event follows, so without this the account kept Plus
          // with no payment. The subscription id is kept, so paying the open
          // invoice (status → active) restores Plus through the normal path.
          const ref = db.collection('users').doc(uid);
          const paused = await db.runTransaction(async tx => {
            const snap = await tx.get(ref);
            if (!snap.exists || snap.data().stripeSubscription !== subscription.id) return false;
            // Comped users keep their free Plus when a paid subscription stops.
            const comped = snap.data().comped === true;
            tx.set(ref, comped ? { planStatus: 'comped' } : { plan: 'free', planStatus: 'unpaid' }, { merge: true });
            return true;
          });
          if (paused) console.log(`⚠ Subscription unpaid: uid=${uid} — Plus paused until payment`);
          break;
        }
        if (uid && await applyActiveSubscription(uid, subscription)) {
          const plan = PRICE_TO_PLAN[subscription.items.data[0]?.price?.id];
          console.log(`✓ Plan updated: uid=${uid} plan=${plan} status=${subscription.status}`);
        }
        break;
      }

      // Subscription cancelled — downgrade to free + send cancellation email.
      // Only fires when the subscription is actually gone (after retry period).
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const uid          = await resolveUid(subscription);
        const email        = await resolveEmail(subscription);
        const priceId      = subscription.items.data[0]?.price?.id;
        const plan         = PRICE_TO_PLAN[priceId]; // the plan they had

        if (uid) {
          const ref = db.collection('users').doc(uid);
          const cancelled = await db.runTransaction(async tx => {
            const snap = await tx.get(ref);
            if (!snap.exists || snap.data().stripeSubscription !== subscription.id) return false;
            // Comped users keep their free Plus when a paid subscription ends.
            const comped = snap.data().comped === true;
            tx.set(ref, {
              plan: comped ? 'super' : 'free',
              planStatus: comped ? 'comped' : 'cancelled',
              cancelledAt: new Date().toISOString(), stripeSubscription: null,
            }, { merge: true });
            return true;
          });
          if (cancelled) {
            console.log(`✓ Plan cancelled: uid=${uid}`);
            await sendRefundEmail(email, plan);
          }
        }
        break;
      }

      // Explicit refund issued from the Stripe dashboard. We log this for
      // visibility but DON'T send an email here — if the refund also cancels
      // the subscription, customer.subscription.deleted fires and sends the
      // cancellation email. Emailing here too would double-send. If you ever
      // refund WITHOUT cancelling, handle that case manually.
      case "charge.refunded": {
        const charge = event.data.object;
        console.log(`✓ Charge refunded: ${charge.id} (cancellation email handled by subscription.deleted)`);
        break;
      }

      // Payment failed — DO NOT downgrade. Stripe retries failed payments
      // for ~3 weeks. We just mark the status; access continues until
      // customer.subscription.deleted fires (after final retry fails).
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        if (!invoice.subscription) break;

        const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
        const uid          = await resolveUid(subscription);

        if (uid) {
          const ref = db.collection('users').doc(uid);
          const updated = await db.runTransaction(async tx => {
            const snap = await tx.get(ref);
            if (!snap.exists || snap.data().stripeSubscription !== subscription.id || !['past_due', 'unpaid'].includes(subscription.status)) return false;
            tx.set(ref, { planStatus: 'past_due' }, { merge: true });
            return true;
          });
          if (!updated) break;
          console.log(`⚠ Payment failed: uid=${uid} — marked past_due, access continues`);
        }
        break;
      }

      default:
        // Ignore other events
        break;
    }
  } catch (err) {
    console.error("Webhook handler error:", err.message);
    try { await finishEvent(claim, false); } catch (releaseError) { console.error('Webhook release failed:', releaseError); }
    return res.status(500).json({ error: "Internal error" });
  }

  try { await finishEvent(claim, true); }
  catch (err) { console.error('Webhook completion failed:', err); return res.status(500).json({ error: 'Could not finish webhook' }); }
  res.status(200).json({ received: true });
}
