// /api/webhook.js — Knox Knows
// Listens for Stripe events and saves the user's plan to Firestore.

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

// Map Stripe price IDs → plan names
const PRICE_TO_PLAN = {
  "price_1TTqUyCqlxC7aoKR0C9AM3sX": "super",  // Super Monthly
  "price_1TTqW6CqlxC7aoKR8nzCDAF3": "super",  // Super Yearly
  "price_1TTqWZCqlxC7aoKRESZls3vU": "max",    // Max Monthly
  "price_1TTqXnCqlxC7aoKRsOSwHFBy": "max",    // Max Yearly
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

const PLAN_NAMES = {
  super: { name: "Super Knox ⚡", price: "$9.99/month",  questions: "25 questions/day",  color: "#58CC02", shadow: "#2D6A00" },
  max:   { name: "Max Knox 🚀",   price: "$19.99/month", questions: "100 questions/day", color: "#FF6B00", shadow: "#CC5500" },
};

async function sendPlanEmail(email, plan) {
  if (!email || !process.env.SENDGRID_API_KEY) return;
  const p = PLAN_NAMES[plan];
  if (!p) return;

  // Keep this email transactional and personal. Gmail routes elaborate
  // celebratory HTML emails with banners/CTAs/feature lists to Promotions.
  // A clean text-heavy "your subscription is active" note lands in Primary.
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;font-size:16px;line-height:1.6;">
  <div style="max-width:580px;margin:0 auto;padding:32px 24px;">
    <p style="margin:0 0 16px;">Hey,</p>
    <p style="margin:0 0 16px;">Your ${p.name} subscription is active. Thanks for upgrading.</p>
    <p style="margin:0 0 16px;">Starting today you have ${p.questions}. You can keep using Knox at <a href="https://knoxknowsapp.com" style="color:#FF6B00;">knoxknowsapp.com</a>.</p>
    <p style="margin:0 0 16px;">To manage or cancel your subscription anytime, click your account menu in the top right of the site and choose <strong>Manage Billing</strong>.</p>
    <p style="margin:0 0 16px;">If anything looks off, just reply to this email — it goes straight to me.</p>
    <p style="margin:0 0 4px;">— Sion</p>
    <p style="margin:0 0 24px;color:#6B7280;font-size:14px;">Knox Knows</p>
    <p style="margin:0;color:#9CA3AF;font-size:12px;border-top:1px solid #E5E7EB;padding-top:16px;">You're receiving this because you upgraded your Knox Knows plan. <a href="https://knoxknowsapp.com/privacy.html" style="color:#9CA3AF;">Privacy</a> · <a href="https://knoxknowsapp.com/terms.html" style="color:#9CA3AF;">Terms</a></p>
  </div>
</body>
</html>`;

  try {
    await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email }] }],
        from: { email: process.env.SENDGRID_FROM_EMAIL || "support@knoxknowsapp.com", name: "Sion at Knox Knows" },
        reply_to: { email: "support@knoxknowsapp.com", name: "Sion at Knox Knows" },
        subject: `Your ${p.name} subscription is active`,
        content: [
          { type: "text/plain", value: `Hey,\n\nYour ${p.name} subscription is active. Thanks for upgrading.\n\nStarting today you have ${p.questions}. You can keep using Knox at https://knoxknowsapp.com.\n\nTo manage or cancel your subscription anytime, click your account menu in the top right of the site and choose Manage Billing.\n\nIf anything looks off, just reply to this email — it goes straight to me.\n\n— Sion\nKnox Knows` },
          { type: "text/html",  value: html },
        ],
      }),
    });
    console.log(`✓ Plan email sent to ${email} for ${plan}`);
  } catch (err) {
    console.warn("Plan email failed:", err.message);
  }
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
// looks up the customer's email and matches against Firestore users.
async function resolveUid(subscription) {
  if (subscription.metadata?.uid) return subscription.metadata.uid;
  // Fall back to looking up the customer
  try {
    const customer = await stripe.customers.retrieve(subscription.customer);
    if (customer.metadata?.uid) return customer.metadata.uid;
  } catch (e) { /* fall through */ }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const sig        = req.headers["stripe-signature"];
  const rawBody    = await getRawBody(req);
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
        const session = event.data.object;
        const uid            = session.metadata?.uid;
        const verifiedEmail  = session.metadata?.email || session.customer_email;
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
        // Send plan upgrade email
        await sendPlanEmail(verifiedEmail, plan);
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
            planStatus:      "active",
            planRenewedAt:   new Date().toISOString(),
          }, { merge: true });
          console.log(`✓ Plan renewed: uid=${uid} plan=${plan}`);
        }
        break;
      }

      // Plan changed via customer portal (Super → Max, monthly → yearly, etc.)
      // This is the only place Stripe tells us about a plan switch — we must
      // handle it or paying customers will be stuck on the wrong plan.
      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const uid          = await resolveUid(subscription);
        const priceId      = subscription.items.data[0]?.price?.id;
        const plan         = PRICE_TO_PLAN[priceId];

        // Only update if we recognize the price AND subscription is active
        // (skip past_due, unpaid, etc. — those are handled by other events)
        if (uid && plan && (subscription.status === "active" || subscription.status === "trialing")) {
          await db.collection("users").doc(uid).set({
            plan,
            planStatus: "active",
            planRenewedAt: new Date().toISOString(),
          }, { merge: true });
          console.log(`✓ Plan updated: uid=${uid} plan=${plan} status=${subscription.status}`);
        }
        break;
      }

      // Subscription cancelled — downgrade to free
      // Only fires when the subscription is actually gone (after retry period)
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const uid          = await resolveUid(subscription);

        if (uid) {
          await db.collection("users").doc(uid).set({
            plan:        "free",
            planStatus:  "cancelled",
            cancelledAt: new Date().toISOString(),
          }, { merge: true });
          console.log(`✓ Plan cancelled: uid=${uid}`);
        }
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
