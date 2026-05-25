// /api/webhook.js — Knox Knows
// Listens for Stripe events and saves the user's plan to Firestore.
// Also sends transactional emails (purchase confirmation, refund/cancellation)
// via SendGrid, using the same minimal house style as the welcome email so
// all Knox emails look consistent and land in the Primary inbox.

import Stripe from "stripe";
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
// IMPORTANT: After the 2026 price reset, we keep BOTH the old and new price IDs
// in this map. Why? Stripe protects existing subscribers — they stay on the
// price they originally signed up for. The webhook will continue receiving
// events for those old prices for as long as those customers stay subscribed.
// Both old and new IDs must resolve to the same plan name ('super' or 'max').
const PRICE_TO_PLAN = {
  // OLD prices (grandfathered subscribers from before 2026 reset)
  "price_1TTqUyCqlxC7aoKR0C9AM3sX": "super",  // Super Monthly $9.99 (old)
  "price_1TTqW6CqlxC7aoKR8nzCDAF3": "super",  // Super Yearly $79.99 (old)
  "price_1TTqWZCqlxC7aoKRESZls3vU": "max",    // Max Monthly $19.99 (old)
  "price_1TTqXnCqlxC7aoKRsOSwHFBy": "max",    // Max Yearly $149.99 (old)
  // NEW prices (2026 matrix)
  "price_1Tb16gCqlxC7aoKRxPv4z4BP":    "super",  // Super Monthly $7.99 (new)
  "price_1Tb17FCqlxC7aoKRIE0BZaWg":     "super",  // Super Yearly $59.99 (new)
  "price_1Tb17fCqlxC7aoKRgQ3uxxlK":      "max",    // Max Monthly $14.99 (new)
  "price_1Tb17zCqlxC7aoKRNOYaO73B":     "max",    // Max Yearly $119.99 (new)
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

// Human-readable plan details used in emails.
const PLAN_NAMES = {
  super: { name: "Super Knox", perks: "25 homework questions a day, smarter AI, and step-by-step breakdowns" },
  max:   { name: "Max Knox",   perks: "100 homework questions a day, unlimited Learn sessions, and the most powerful AI" },
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

// Generic SendGrid sender — used for both purchase and refund emails.
async function sendEmail(email, subject, textBody, htmlBody, label) {
  if (!email) {
    console.warn(`Skipping ${label} email — no recipient address`);
    return;
  }
  if (!process.env.SENDGRID_API_KEY) {
    console.error(`SENDGRID_API_KEY not set — cannot send ${label} email`);
    return;
  }
  try {
    const r = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email }] }],
        from:     { email: process.env.SENDGRID_FROM_EMAIL || "support@knoxknowsapp.com", name: "Sion at Knox Knows" },
        reply_to: { email: "support@knoxknowsapp.com", name: "Sion at Knox Knows" },
        subject,
        content: [
          { type: "text/plain", value: textBody },
          { type: "text/html",  value: htmlBody },
        ],
      }),
    });
    if (!r.ok) {
      const errText = await r.text();
      console.error(`SendGrid error (${label}):`, errText);
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

Your account is still here — you're back on the free plan with 5 questions a day, so you can keep using Knox anytime.

If this was a mistake, or there was something about Knox that didn't work for you, just reply to this email and let me know. I read every message personally, and I'd genuinely like to hear what happened.

Thanks for giving Knox Knows a try.

— Sion
Knox Knows`;

  const htmlBody = knoxEmailShell(`
    <p style="margin:0 0 16px;">Hey,</p>
    <p style="margin:0 0 16px;">Your <strong>${p.name}</strong> subscription has been cancelled and you won't be charged again.</p>
    <p style="margin:0 0 16px;">Your account is still here — you're back on the free plan with 5 questions a day, so you can keep using Knox anytime.</p>
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
async function alreadyProcessed(eventId) {
  if (!eventId) return false;
  const ref = db.collection("webhookEvents").doc(eventId);
  try {
    const snap = await ref.get();
    if (snap.exists) return true;
    await ref.set({ processedAt: new Date().toISOString() });
    return false;
  } catch (err) {
    console.warn("Idempotency check failed:", err.message);
    return false; // fail open — better to risk a duplicate than skip a valid event
  }
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
  if (await alreadyProcessed(event.id)) {
    console.log(`Skipping duplicate event: ${event.id}`);
    return res.status(200).json({ received: true, duplicate: true });
  }

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
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        const priceId      = subscription.items.data[0]?.price?.id;
        const plan         = PRICE_TO_PLAN[priceId] || "super";

        await db.collection("users").doc(uid).set({
          plan,
          stripeCustomerId:   session.customer,
          stripeSubscription: session.subscription,
          planActivatedAt:    new Date().toISOString(),
          planStatus:         "active",
        }, { merge: true });

        console.log(`✓ Plan activated: uid=${uid} plan=${plan}`);
        // Send purchase confirmation email
        await sendPurchaseEmail(verifiedEmail, plan);
        break;
      }

      // Subscription renewed — keep plan active
      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        if (invoice.billing_reason === "subscription_create") break; // already handled above

        const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
        const uid          = await resolveUid(subscription);
        const priceId      = subscription.items.data[0]?.price?.id;
        const plan         = PRICE_TO_PLAN[priceId] || "super";

        if (uid) {
          await db.collection("users").doc(uid).set({
            plan,
            planStatus:    "active",
            planRenewedAt: new Date().toISOString(),
          }, { merge: true });
          console.log(`✓ Plan renewed: uid=${uid} plan=${plan}`);
        }
        break;
      }

      // Plan changed via customer portal (Super → Max, monthly → yearly, etc.)
      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const uid          = await resolveUid(subscription);
        const priceId      = subscription.items.data[0]?.price?.id;
        const plan         = PRICE_TO_PLAN[priceId];

        if (uid && plan && (subscription.status === "active" || subscription.status === "trialing")) {
          await db.collection("users").doc(uid).set({
            plan,
            planStatus:    "active",
            planRenewedAt: new Date().toISOString(),
          }, { merge: true });
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
          await db.collection("users").doc(uid).set({
            plan:        "free",
            planStatus:  "cancelled",
            cancelledAt: new Date().toISOString(),
          }, { merge: true });
          console.log(`✓ Plan cancelled: uid=${uid}`);
          // Send cancellation / refund email
          await sendRefundEmail(email, plan);
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
          await db.collection("users").doc(uid).set({
            planStatus: "past_due",
          }, { merge: true });
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
    return res.status(500).json({ error: "Internal error" });
  }

  res.status(200).json({ received: true });
}
