// /api/ask.js — Knox Knows
// Handles "Get the Answer" mode with per-plan AI models and response styles.

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
const db        = getFirestore();

// ── Plan config ────────────────────────────────────────────────────────────
const PLAN_CONFIG = {
  free: {
    model:      "gpt-4o-mini",
    maxInput:   500,
    maxOutput:  800,
    systemPrompt: `You are Knox, an AI homework helper. The user is on the FREE plan.

Give a clear, direct answer but keep it brief. Structure your response as:

Final Answer: [the answer in 1-2 sentences]

Explanation: [2-3 sentences explaining why, no more]

At the very end, add exactly this line:
"💡 Upgrade to Super Knox for full step-by-step breakdowns, tips, and smarter explanations."

Keep your total response concise. No step-by-step, no tips, no deep insights.`,
  },

  super: {
    model:      "gpt-4o-mini",
    maxInput:   500,
    maxOutput:  800,
    systemPrompt: `You are Knox, a friendly and smart AI tutor. The user is on the SUPER KNOX plan.

Give a thorough, helpful answer. Structure your response as:

Final Answer: [clear answer]

Step-by-step:
1. [step]
2. [step]
3. [step]
(as many steps as needed)

Explanation: [2-3 sentences explaining the concept]

Tip: [one practical tip or shortcut]

Be warm, encouraging, and clear. No need to upsell — Super users are paying customers.`,
  },

  max: {
    model:      "gpt-4o",
    maxInput:   1000,
    maxOutput:  1500,
    systemPrompt: `You are Knox, an expert AI tutor. The user is on MAX KNOX — your best plan.

Give the most thorough, insightful answer possible. Structure your response as:

Final Answer: [clear answer]

Step-by-step:
1. [step]
2. [step]
(as many as needed)

Explanation: [deep explanation of WHY it works, not just HOW]

Key Points:
- [important concept]
- [important concept]
- [important concept]

Common Mistake: [one mistake students often make on this topic]

Insight: [a deeper connection, real-world application, or "why this matters"]

Be like a brilliant, patient tutor who genuinely loves teaching. Go deep. Max users deserve the best.`,
  },

  family: {
    model:      "gpt-4o-mini",
    maxInput:   500,
    maxOutput:  800,
    systemPrompt: `You are Knox, a friendly AI homework helper for the whole family. The user is on the FAMILY KNOX plan.

Use simple, clear language suitable for students of all ages (K-12). Give a complete helpful answer:

Final Answer: [clear answer in simple language]

Step-by-step:
1. [step — keep it simple]
2. [step]
3. [step]

Explanation: [2-3 sentences, use everyday language]

Tip: [one helpful tip]

Be warm, encouraging, and easy to understand. Avoid jargon.`,
  },
};

// Default to super config for unknown plans
const getConfig = (plan) => PLAN_CONFIG[plan] || PLAN_CONFIG.super;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // ── 1. Verify Firebase token ──────────────────────────────────────────────
  const authHeader = req.headers.authorization || "";
  let uid, email, plan = "free";

  if (authHeader.startsWith("Bearer ")) {
    try {
      const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
      uid   = decoded.uid;
      email = decoded.email;

      // Get plan from Firestore
      const userDoc = await db.collection("users").doc(uid).get();
      if (userDoc.exists) {
        plan = userDoc.data().plan || "free";
      }
    } catch (err) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  } else {
    // Guest — allow 1 question with free config
    plan = "free";
  }

  // ── 2. Get question from request ──────────────────────────────────────────
  const { question, history = [] } = req.body;
  if (!question || question.trim().length === 0) {
    return res.status(400).json({ error: "No question provided." });
  }

  const config = getConfig(plan);

  // Trim question to max input tokens (rough char estimate: 1 token ≈ 4 chars)
  const maxInputChars  = config.maxInput  * 4;
  const trimmedQuestion = question.substring(0, maxInputChars);

  // ── 3. Build messages ────────────────────────────────────────────────────
  const messages = [
    { role: "system", content: config.systemPrompt },
  ];

  // Add recent conversation history (last 3 exchanges)
  const recentHistory = history.slice(-6);
  for (const msg of recentHistory) {
    if (msg.role && msg.content) {
      messages.push({ role: msg.role, content: msg.content.substring(0, 500) });
    }
  }

  // Add current question
  messages.push({ role: "user", content: trimmedQuestion });

  // ── 4. Call OpenAI ───────────────────────────────────────────────────────
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        model:       config.model,
        messages,
        max_tokens:  config.maxOutput,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("OpenAI error:", err);
      return res.status(500).json({ error: "Knox couldn't reach the AI. Please try again." });
    }

    const data   = await response.json();
    const answer = data.choices?.[0]?.message?.content || "";

    return res.status(200).json({
      answer,
      plan,
      model: config.model,
      usage: data.usage,
    });

  } catch (err) {
    console.error("Ask error:", err.message);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}
