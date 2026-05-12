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

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F5;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr>
          <td align="center" style="background:${p.color};border-radius:20px 20px 0 0;padding:32px 40px;border-bottom:4px solid ${p.shadow};">
            <img src="https://knoxknowsapp.com/knox-logo-square.jpg" alt="Knox" width="80" height="80" style="border-radius:50%;border:3px solid rgba(255,255,255,0.4);display:block;margin:0 auto 16px;">
            <h1 style="margin:0;font-size:26px;font-weight:900;color:white;">You're on ${p.name}!</h1>
            <p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.85);font-weight:600;">Welcome to the upgrade 🎉</p>
          </td>
        </tr>
        <tr>
          <td style="background:white;padding:36px 40px;border-radius:0 0 20px 20px;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
            <h2 style="margin:0 0 8px;font-size:22px;font-weight:900;color:#1f2937;">Your plan is now active</h2>
            <p style="margin:0 0 24px;font-size:15px;color:#6B7280;line-height:1.6;">Here's what you now get every day:</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF8F0;border-radius:14px;border:2px solid #FFD0A0;margin-bottom:28px;">
              <tr><td style="padding:20px 24px;">
                <p style="margin:0 0 12px;font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:0.06em;color:#FF6B00;">${p.name} includes</p>
                <table cellpadding="0" cellspacing="0">
                  <tr><td style="padding:5px 0;font-size:15px;color:#1f2937;font-weight:600;">✅ &nbsp;${p.questions}</td></tr>
                  <tr><td style="padding:5px 0;font-size:15px;color:#1f2937;font-weight:600;">✅ &nbsp;Every subject — K-12 through college</td></tr>
                  <tr><td style="padding:5px 0;font-size:15px;color:#1f2937;font-weight:600;">✅ &nbsp;Step-by-step explanations</td></tr>
                  <tr><td style="padding:5px 0;font-size:15px;color:#1f2937;font-weight:600;">✅ &nbsp;Photo upload — snap your homework</td></tr>
                  <tr><td style="padding:5px 0;font-size:15px;color:#1f2937;font-weight:600;">✅ &nbsp;Streaks, leagues &amp; Know Points</td></tr>
                </table>
              </td></tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr><td align="center">
                <a href="https://knoxknowsapp.com" style="display:inline-block;background:#FF6B00;color:white;text-decoration:none;font-size:16px;font-weight:900;padding:16px 40px;border-radius:14px;box-shadow:0 4px 0 #CC5500;">
                  Start Using Knox Now →
                </a>
              </td></tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0FDF4;border-radius:12px;border:2px solid #86EFAC;margin-bottom:24px;">
              <tr><td style="padding:14px 18px;">
                <p style="margin:0;font-size:13px;font-weight:700;color:#166534;">💡 To manage or cancel your subscription, go to <strong>Account → Manage Billing</strong> on the site.</p>
              </td></tr>
            </table>
            <p style="margin:0;font-size:13px;color:#9CA3AF;line-height:1.6;">Questions? Reply to this email anytime.<br><strong style="color:#6B7280;">— Knox &amp; the Knox Knows team 🦊</strong></p>
          </td>
        </tr>
        <tr><td align="center" style="padding:24px 0;">
          <p style="margin:0;font-size:12px;color:#9CA3AF;">© 2026 Knox Knows · <a href="https://knoxknowsapp.com/privacy.html" style="color:#9CA3AF;">Privacy</a> · <a href="https://knoxknowsapp.com/terms.html" style="color:#9CA3AF;">Terms</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
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
        from: { email: process.env.SENDGRID_FROM_EMAIL || "support@knoxknowsapp.com", name: "Knox from Knox Knows" },
        subject: `You're on ${p.name} — let's go! 🎉`,
        content: [
          { type: "text/plain", value: `You're now on ${p.name}!\n\nYou get ${p.questions} starting today. Go to knoxknowsapp.com to start using it.\n\nTo manage or cancel, go to Account → Manage Billing on the site.\n\n— Knox 🦊` },
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
