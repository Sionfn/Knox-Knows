// /api/customer-portal.js — Knox Knows
// Creates a Stripe billing portal session for the authenticated user.

import Stripe from "stripe";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
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

const adminAuth = getAdminAuth();
const db = getFirestore();
const APP_URL = (process.env.APP_URL || "").replace(/\/$/, "");

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
  const { uid: verifiedUid } = decodedToken;
  if (!verifiedUid) {
    return res.status(401).json({ error: "Unauthorized — no user ID on token." });
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const userSnap = await db.collection("users").doc(verifiedUid).get();
    const customerId = userSnap.exists ? userSnap.data().stripeCustomerId : null;
    if (!customerId) {
      return res.status(404).json({ error: "No billing account found. Please subscribe first." });
    }
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted || customer.metadata?.uid !== verifiedUid) {
      return res.status(404).json({ error: "No billing account found. Please subscribe first." });
    }
    if (!APP_URL.startsWith("https://")) throw new Error("APP_URL is not configured");

    // Create billing portal session
    const session = await stripe.billingPortal.sessions.create({
      customer:   customer.id,
      return_url: `${APP_URL}/app`,
    });

    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error("Customer portal error:", err.message);
    return res.status(500).json({ error: "Could not open billing portal. Please try again." });
  }
}
