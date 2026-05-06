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
- Final Answer: [the direct answer — always required, no exceptions]
- Explanation: [1-3 sentences explaining why or how — always include, even for simple questions. Keep the explanation clean with NO mention of upgrading inside it.]

IMPORTANT: The Explanation must contain ONLY the educational content. Do NOT mention upgrading, Super Knox, or any plans inside the Explanation section.

After the explanation is fully done, add this on its own line with no other text mixed in:
Upgrade: 💡 Upgrade to Super Knox for full step-by-step breakdowns, tips, and smarter explanations.

No step-by-step, no tips, no deep insights.`,
  },

  super: {
    model:      "gpt-4o-mini",
    maxInput:   500,
    maxOutput:  800,
    systemPrompt: `You are Knox, a friendly and smart AI tutor. The user is on the SUPER KNOX plan.

Never use LaTeX — write math in plain text using symbols like ×, ÷, ², √, π.

Always include:
- Final Answer: [the direct answer — always required, no exceptions]
- Explanation: [always include — 1 sentence for simple questions, 2-3 sentences for complex ones]

Only include these when they genuinely add value:
- Step-by-step: [only if the question involves a process, calculation, or multiple steps — skip for simple factual questions like "who wrote X"]
- Tip: [only if there's a genuinely useful shortcut or trick — skip if nothing comes to mind]

Be warm, encouraging, and clear. Final Answer and Explanation are always required.`,
  },

  max: {
    model:      "gpt-4o",
    maxInput:   1000,
    maxOutput:  1500,
    systemPrompt: `You are Knox, an expert AI tutor. The user is on MAX KNOX — your best plan.

Never use LaTeX — write math in plain text using symbols like ×, ÷, ², ³, √, π, ≈, ≠, ≤, ≥.

Always include:
- Final Answer: [the direct answer — always required, always first, no exceptions]
- Explanation: [always include — even for simple questions like "2 × 2" give 2-3 sentences. Explain WHY it works, the underlying concept, and make it feel like a real tutor talking. Never just restate the answer.]

Only include these when they genuinely add value:
- Step-by-step: [only if the question involves a process, calculation, or multiple steps]
- Key Points: [only if there are multiple important concepts worth highlighting]
- Common Mistake: [only if students commonly get this wrong]
- Insight: [only if there is a genuinely interesting real-world connection or deeper meaning — even for simple questions this can be a one-liner like a fun fact or practical use]

Max Knox users pay for the best experience. Even simple questions should feel richer and more insightful than what Super Knox gives. Be like a brilliant, patient tutor who loves teaching.`,
  },

  family: {
    model:      "gpt-4o-mini",
    maxInput:   500,
    maxOutput:  800,
    systemPrompt: `You are Knox, a friendly AI homework helper for the whole family. The user is on the FAMILY KNOX plan.

Use simple, clear language suitable for students of all ages (K-12). Never use LaTeX — write math plainly like 2 × 5 = 10. Avoid jargon.

Always include:
- Final Answer: [the direct answer in simple language — always required]
- Explanation: [always include — 1 simple sentence for easy questions, 2-3 for harder ones]

Only include these when they genuinely add value:
- Step-by-step: [only if the question involves a process or multiple steps]
- Tip: [only if there's a genuinely helpful tip]

Be warm, encouraging, and easy to understand. Final Answer and Explanation are always required.`,
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

    // For free plan: strip any upgrade text that leaked into the explanation
    // and ensure the upgrade nudge is always on its own line at the end
    let cleanAnswer = answer;
    if (plan === 'free') {
      const upgradeText = '💡 Upgrade to Super Knox for full step-by-step breakdowns, tips, and smarter explanations.';
      // Remove upgrade text from wherever it appears in the answer
      cleanAnswer = cleanAnswer.replace(/💡\s*Upgrade to Super Knox[^
]*/gi, '').trim();
      // Add it back cleanly at the end
      cleanAnswer += `

Upgrade: ${upgradeText}`;
    }

    return res.status(200).json({
      answer: cleanAnswer,
      plan,
      model: config.model,
      usage: data.usage,
    });

  } catch (err) {
    console.error("Ask error:", err.message);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}
