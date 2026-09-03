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
// PRICING MATRIX (Sept 2026 reset — one plan: Knox Plus at $9.99/$79.99):
//   Knox Plus monthly: $9.99/mo  (3-day free trial)
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

    // 3-day free trial on Knox Plus MONTHLY only.
    // Yearly buyers are already committing — they don't need a trial, and a
    // trial on a $79.99 annual purchase reads as gimmicky rather than useful.
    // 3 days is enough for a student to try it during a homework session or
    // two, without giving away a full week's worth of unlimited usage.
    // Note: `plan === "super"` is the internal Stripe plan value that maps to
    // the Knox Plus display name. Legacy — see webhook.js PLAN_NAMES for the
    // same 'super' → Knox Plus display mapping.
    let subscriptionData = { metadata: { plan, billing, uid: verifiedUid } };
    if (plan === "super" && billing === "monthly") {
      subscriptionData.trial_period_days = 3;
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
