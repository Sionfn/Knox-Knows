// /api/customer-portal.js — Knox Knows
// Creates a Stripe billing portal session for the authenticated user.

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
    return res.status(401).json({ error: "Unauthorized — invalid token." });
  }
  const { email: verifiedEmail } = decodedToken;
  if (!verifiedEmail) {
    return res.status(401).json({ error: "Unauthorized — no email on token." });
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    // Find the Stripe customer by email
    const existingList = await stripe.customers.list({ email: verifiedEmail, limit: 1 });
    if (existingList.data.length === 0) {
      return res.status(404).json({ error: "No billing account found. Please subscribe first." });
    }
    const customer = existingList.data[0];

    const baseUrl = req.headers.origin || `https://${req.headers.host}`;

    // Create billing portal session
    const session = await stripe.billingPortal.sessions.create({
      customer:   customer.id,
      return_url: baseUrl,
    });

    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error("Customer portal error:", err.message);
    return res.status(500).json({ error: "Could not open billing portal. Please try again." });
  }
}
