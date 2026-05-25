// /api/create-checkout-session.js — Knox Knows
// Creates a Stripe checkout session for the authenticated user.
// Requires a valid Firebase ID token — uid comes from the verified token,
// never from the request body, so it cannot be spoofed.

import Stripe from "stripe";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";

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

// ─────────────────────────────────────────────────────────────────────────
// PRICING MATRIX (2026 reset):
//   Super monthly: $7.99/mo
//   Super yearly:  $59.99/yr  ($5/mo equivalent)
//   Max monthly:   $14.99/mo
//   Max yearly:    $119.99/yr ($10/mo equivalent)
//
// IMPORTANT — to roll out new pricing, do this in Stripe Dashboard first:
//   1. Go to Products. For each (Super, Max), keep the existing Product —
//      Stripe Products are just containers. Don't delete them.
//   2. On each Product, click "Add another price" and create the new amount
//      with the same recurring interval. Stripe will give you a NEW price ID.
//   3. Replace the four price_xxx values below with the new IDs.
//   4. Replace the four price_xxx values in api/webhook.js' PRICE_TO_PLAN map.
//   5. Update the user-facing prices in index.html (already done in this rollout).
//   6. Existing subscribers stay on their OLD prices — Stripe handles that
//      automatically. Only NEW signups see the new prices.
// ─────────────────────────────────────────────────────────────────────────
const PRICES = {
  super: {
    monthly: "price_REPLACE_SUPER_MONTHLY",  // $7.99/mo  — create in Stripe, paste ID
    yearly:  "price_REPLACE_SUPER_YEARLY",   // $59.99/yr — create in Stripe, paste ID
  },
  max: {
    monthly: "price_REPLACE_MAX_MONTHLY",    // $14.99/mo  — create in Stripe, paste ID
    yearly:  "price_REPLACE_MAX_YEARLY",     // $119.99/yr — create in Stripe, paste ID
  },
  // Family plan coming soon — not yet available
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

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
  const { plan, billing = "monthly" } = req.body;
  const priceId = PRICES[plan]?.[billing];
  if (!priceId) {
    return res.status(400).json({ error: "Invalid plan or billing period." });
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    // Find or create Stripe customer
    const existingList = await stripe.customers.list({ email: verifiedEmail, limit: 1 });
    let customer;
    if (existingList.data.length > 0) {
      customer = existingList.data[0];
    } else {
      customer = await stripe.customers.create({
        email: verifiedEmail,
        metadata: { uid: verifiedUid },
      });
    }

    const baseUrl = req.headers.origin || `https://${req.headers.host}`;

    // 7-day free trial on Super Knox MONTHLY only.
    // Yearly buyers are already committing — they don't need a trial, and a
    // trial on a $59.99 annual purchase reads as gimmicky rather than useful.
    // 7 days (up from 3) gives users a full school week to feel the value.
    let subscriptionData = { metadata: { plan, billing, uid: verifiedUid } };
    if (plan === "super" && billing === "monthly") {
      subscriptionData.trial_period_days = 7;
    }

    const session = await stripe.checkout.sessions.create({
      mode:              "subscription",
      customer:          customer.id,
      line_items:        [{ price: priceId, quantity: 1 }],
      subscription_data: subscriptionData,
      success_url:       `${baseUrl}?payment=success`,
      cancel_url:        `${baseUrl}?payment=cancelled`,
      allow_promotion_codes: true,
      // Send Stripe's official payment receipt to the customer. This is in
      // addition to our own SendGrid plan-upgrade email — Stripe's receipt
      // is tax-deductible and gives the customer a formal record.
      // Note: receipt_email is not allowed in subscription mode; instead we
      // rely on the customer's email being set (above) and Stripe's default
      // email settings (enable in Dashboard → Settings → Customer emails).
      metadata: { uid: verifiedUid, email: verifiedEmail, plan, billing },
    });

    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error("Stripe checkout error:", err.message);
    return res.status(500).json({ error: "Could not open checkout. Please try again." });
  }
}
