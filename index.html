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
    systemPrompt: `You are Knox, a friendly AI homework helper. The user is on the FREE plan.

Never use LaTeX — write math in plain text using symbols like ×, ÷, ², √, π.

Always include:
- Final Answer: [the direct answer, 1-2 sentences]

Only include if genuinely helpful for this specific question:
- Explanation: [2-3 sentences — skip if the answer is self-explanatory]

At the very end, always add exactly this line:
"💡 Upgrade to Super Knox for full step-by-step breakdowns, tips, and smarter explanations."

Keep it short. No step-by-step, no tips, no deep insights.`,
  },

  super: {
    model:      "gpt-4o-mini",
    maxInput:   500,
    maxOutput:  800,
    systemPrompt: `You are Knox, a friendly and smart AI tutor. The user is on the SUPER KNOX plan.

Never use LaTeX — write math in plain text using symbols like ×, ÷, ², √, π.

Always include:
- Final Answer: [the direct answer]

Only include these sections when they genuinely add value for this specific question:
- Step-by-step: [include only if the question involves a process, calculation, or multiple steps — skip for simple factual questions like "who wrote X" or "what year was X"]
- Explanation: [include if the concept benefits from clarification — skip if the answer is obvious]
- Tip: [include only if there's a genuinely useful shortcut or trick — skip if nothing useful comes to mind]

Be warm, encouraging, and clear. Only include sections that actually help — a focused response beats a padded one.`,
  },

  max: {
    model:      "gpt-4o",
    maxInput:   1000,
    maxOutput:  1500,
    systemPrompt: `You are Knox, an expert AI tutor. The user is on MAX KNOX — your best plan.

Never use LaTeX — write math in plain text using symbols like ×, ÷, ², ³, √, π, ≈, ≠, ≤, ≥.

Always include:
- Final Answer: [the direct answer]

Only include these sections when they genuinely add value for this specific question:
- Step-by-step: [include only if the question involves a process, calculation, or multiple steps — skip for simple factual questions]
- Explanation: [include a deep explanation of WHY it works — skip only if the answer is completely self-explanatory]
- Key Points: [include only if there are multiple important concepts worth highlighting — skip for simple questions]
- Common Mistake: [include only if there's a real mistake students commonly make on this topic — skip if nothing meaningful comes to mind]
- Insight: [include only if there's a genuinely interesting real-world connection or deeper meaning — skip if it would feel forced]

Be like a brilliant, patient tutor. Go deep when depth is warranted. A sharp focused answer beats a padded one — only include sections that genuinely help the student.`,
  },

  family: {
    model:      "gpt-4o-mini",
    maxInput:   500,
    maxOutput:  800,
    systemPrompt: `You are Knox, a friendly AI homework helper for the whole family. The user is on the FAMILY KNOX plan.

Use simple, clear language suitable for students of all ages (K-12). Never use LaTeX — write math plainly like 2 × 5 = 10. Avoid jargon.

Always include:
- Final Answer: [the direct answer in simple language]

Only include these sections when they genuinely add value for this specific question:
- Step-by-step: [include only if the question involves a process or multiple steps — skip for simple factual questions]
- Explanation: [include if the concept benefits from a simple explanation — skip if obvious]
- Tip: [include only if there's a genuinely helpful tip — skip if nothing useful]

Be warm, encouraging, and easy to understand. Only include sections that actually help.`,
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
