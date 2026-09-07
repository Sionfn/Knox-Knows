// /api/mint-extension-token.js — Knox Knows
// The browser extension can't share a Firebase session with the website
// (separate origins), and doing Google OAuth inside the extension popup
// crashes Chrome. So the flow is: user signs in with Google on the website's
// extension-auth page, that page sends its ID token here, and we mint a
// short-lived CUSTOM token. The extension signs in with that custom token
// via signInWithCustomToken — the one token type built exactly for this.

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
  // CORS — same policy as ask.js: website origins + any extension origin.
  const allowedOrigins = ["https://knoxknowsapp.com", "https://www.knoxknowsapp.com"];
  const origin = req.headers.origin || "";
  const isExtension = /^(chrome-extension|moz-extension):\/\//.test(origin);
  const corsOrigin = (allowedOrigins.includes(origin) || isExtension) ? origin : "https://knoxknowsapp.com";
  res.setHeader("Access-Control-Allow-Origin", corsOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing token" });
  }

  try {
    // Verify the ID token the website obtained from Google sign-in, then mint
    // a custom token for that same uid. Only someone who genuinely signed in
    // can reach this, so it's safe.
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const customToken = await adminAuth.createCustomToken(decoded.uid);
    return res.status(200).json({ customToken });
  } catch (err) {
    console.error("mint-extension-token error:", err.message);
    return res.status(401).json({ error: "Unauthorized" });
  }
}
