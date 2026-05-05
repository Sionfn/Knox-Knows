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
  "price_1TTqUyCqlxC7aoKR0C9AM3sX": "super",   // Super Monthly
  "price_1TTqW6CqlxC7aoKR8nzCDAF3": "super",   // Super Yearly
  "price_1TTqWZCqlxC7aoKRESZls3vU": "max",     // Max Monthly
  "price_1TTqXnCqlxC7aoKRsOSwHFBy": "max",     // Max Yearly
  "price_1TTqY7CqlxC7aoKRVBbU8AQl": "family",  // Family Monthly
  "price_1TTqYTCqlxC7aoKRcSaz2XpZ": "family",  // Family Yearly
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

  // ── Handle events ─────────────────────────────────────────────────────────
  try {
    switch (event.type) {

      // Payment succeeded — activate plan
      case "checkout.session.completed": {
        const session = event.data.object;
        const uid     = session.metadata?.uid;
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
        break;
      }

      // Subscription renewed — keep plan active
      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        if (invoice.billing_reason === "subscription_create") break; // already handled above

        const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
        const uid          = subscription.metadata?.uid;
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

      // Subscription cancelled or payment failed — downgrade to free
      case "customer.subscription.deleted":
      case "invoice.payment_failed": {
        const obj = event.data.object;
        const sub = obj.subscription
          ? await stripe.subscriptions.retrieve(obj.subscription)
          : obj;
        const uid = sub.metadata?.uid;

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
