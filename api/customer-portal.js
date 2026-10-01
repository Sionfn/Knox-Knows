// /api/customer-portal.js — Knox Knows
// Creates a Stripe billing portal session for the authenticated user.

import Stripe from "stripe";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore } from 'firebase-admin/firestore';

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

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
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
    return res.status(401).json({ error: "Unauthorized — invalid token." });
  }
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const userSnap = await db.collection('users').doc(decodedToken.uid).get();
    const customerId = userSnap.exists ? userSnap.data().stripeCustomerId : null;
    if (!customerId) {
      return res.status(404).json({ error: "No billing account found. Please subscribe first." });
    }
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted || (customer.metadata?.uid && customer.metadata.uid !== decodedToken.uid)) {
      return res.status(403).json({ error: 'Billing account mismatch. Please contact support.' });
    }
    const baseUrl = process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : (process.env.APP_URL || 'https://knoxknowsapp.com').replace(/\/$/, '');

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
