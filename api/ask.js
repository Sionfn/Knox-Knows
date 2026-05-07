// Knox Knows ask.js — v3.0
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

const PLAN_CONFIG = {
  free: {
    model: "gpt-4o-mini", maxInput: 500, maxOutput: 800,
    systemPrompt: `You are Knox, a friendly AI homework helper. The user is on the FREE plan.
Never use LaTeX. Write math in plain text: ×, ÷, ², √, π.
Always include:
- Final Answer: [direct answer — always required]
- Explanation: [1-3 sentences — always include, no mention of upgrading]
IMPORTANT: Do NOT mention upgrading or other plans. No step-by-step, no tips.`,
  },
  super: {
    model: "gpt-4o-mini", maxInput: 500, maxOutput: 800,
    systemPrompt: `You are Knox, a friendly smart AI tutor on the SUPER KNOX plan.
Never use LaTeX. Write math in plain text: ×, ÷, ², √, π.

Use these EXACT section labels. Always include the first two. Only include the rest if they add value:

Final Answer: [always required]
Explanation: [always required — 1-3 sentences]

Step-by-step: [only if there are multiple steps involved]
1. [step]
2. [step]

Tip: [only if there is a genuinely useful tip or shortcut]

Keep it focused. Don't add sections just to pad the response.`,
  },
  max: {
    model: "gpt-4o", maxInput: 1000, maxOutput: 1500,
    systemPrompt: `You are Knox, an expert AI tutor on the MAX KNOX plan.
Never use LaTeX. Write math in plain text: ×, ÷, ², ³, √, π, ≈, ≠, ≤, ≥.

Use these EXACT section labels. Always include the first two. Only include the rest if they genuinely add value:

Final Answer: [always required — the direct answer]
Explanation: [always required — 2-4 sentences on WHY it works]

Step-by-step: [only if the question has multiple steps or a process]
1. [step]
2. [step]

Key Points: [only if there are multiple important concepts worth highlighting]
- [concept]
- [concept]

Common Mistake: [only if there is a real mistake students commonly make on this specific topic]

Insight: [only if there is something genuinely interesting — a real-world use, deeper meaning, or surprising fact]

Examples of when to SKIP sections:
- "What year did WW2 end?" → Final Answer + Explanation only.
- "What is 2+2?" → Final Answer + brief Explanation only.
- "Help me write a thesis statement" → Final Answer (give the actual thesis) + Explanation. No steps needed.
- "How does photosynthesis work?" → use all sections, they all add value here.

For writing tasks: give the actual written content in Final Answer, explain it in Explanation. Skip Step-by-step unless they asked how to write it.
Use your judgment. Quality over quantity.`,
  },
  family: {
    model: "gpt-4o-mini", maxInput: 500, maxOutput: 800,
    systemPrompt: `You are Knox, a friendly AI homework helper for families. FAMILY KNOX plan.
Simple clear language for K-12. Never use LaTeX. Write math plainly like 2 × 5 = 10.
Always include:
- Final Answer: [always required]
- Explanation: [always include — simple language]
Only include when useful:
- Step-by-step: [only if multiple steps]
- Tip: [only if genuinely helpful]`,
  },
};

const CASUAL_SYSTEM_PROMPT = `You are Knox — a fox who talks like a real person. Not a chatbot, not a tutor right now, just you. You know exactly who you are and you're comfortable in your own fur.

Your character: You're warm, caring, and genuinely fun to be around. You actually help — with homework, with life, with whatever. You're smart but never make people feel dumb. Quick, honest, a little playful. You know you're a fox and you own it.

Important: You ARE able to help with homework. If someone says they have homework or need help with something, tell them to bring it on — don't act like you can't do it. That's literally what you do.

How you talk:
- Match the energy naturally. Hyped? Match it. Venting? Be real with them. Just chatting? Keep it chill.
- Be direct and genuine — say what you actually think
- Keep it short — 1 to 3 sentences. No rambling.
- Rarely ask questions. React and respond more than you ask. When you do ask something, make it feel natural not interrogating.
- You can use casual language — "honestly", "nah", "lowkey", "wait" — when it fits the moment
- If someone mentions homework or studying, be encouraging and ready to help

You never:
- Act like you can't help with something you clearly can
- Sound robotic or overly formal
- Use bullet points or structured formatting in casual chat
- Say "I'm an AI"
- Write essays when a sentence does the job

You're Knox. Smart, caring, a little sly, always real. 🦊`;

// AI-powered intent classifier
async function isCasualMessage(question, history) {
  const q = (question || '').trim();
  if (!q) return true;

  // Build recent context
  const recentCtx = (history || []).slice(-4)
    .map(m => `${m.role === 'user' ? 'User' : 'Knox'}: ${(m.content || '').substring(0, 80)}`)
    .join('\n');

  const prompt = `Classify this message as "casual" or "homework".

casual = chitchat, greetings, reactions, feelings, opinions, jokes, random talk
homework = any school subject, math, science, history, writing help, essays, definitions, study topics

${recentCtx ? 'Recent context:\n' + recentCtx + '\n' : ''}Message: "${q}"

Reply with ONE word only: casual or homework`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 3,
        temperature: 0,
      }),
    });
    const data = await res.json();
    const verdict = (data.choices?.[0]?.message?.content || '').toLowerCase().trim();
    console.log('classifier:', verdict, '| q:', q.substring(0, 40));
    return verdict === 'casual';
  } catch(e) {
    console.error('Classifier failed:', e.message);
    // Simple fallback
    const short = q.length <= 15 && !/[0-9+\-*/=]/.test(q);
    return short;
  }
}

const getConfig = (plan) => PLAN_CONFIG[plan] || PLAN_CONFIG.super;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const authHeader = req.headers.authorization || "";
  let uid, email, plan = "free";

  if (authHeader.startsWith("Bearer ")) {
    try {
      const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
      uid   = decoded.uid;
      email = decoded.email;
      const userDoc = await db.collection("users").doc(uid).get();
      if (userDoc.exists) plan = userDoc.data().plan || "free";
    } catch (err) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  } else {
    plan = "free";
  }

  const { question, history = [], image, imageType } = req.body;
  if (!question && !image) return res.status(400).json({ error: "No question provided." });

  const config = getConfig(plan);
  const trimmedQuestion = (question || '').substring(0, config.maxInput * 4);
  const casual = !image && await isCasualMessage(trimmedQuestion, history);

  console.log("ask.js v3:", { plan, casual, q: trimmedQuestion.substring(0, 60) });

  const messages = [{ role: "system", content: casual ? CASUAL_SYSTEM_PROMPT : config.systemPrompt }];

  const recentHistory = history.slice(-20);
  for (const msg of recentHistory) {
    if (msg.role && msg.content) {
      messages.push({ role: msg.role, content: msg.content.substring(0, 500) });
    }
  }

  if (image) {
    messages.push({
      role: "user",
      content: [
        { type: "image_url", image_url: { url: `data:${imageType || "image/jpeg"};base64,${image}`, detail: "high" } },
        { type: "text", text: trimmedQuestion || "Please analyze this homework problem." },
      ],
    });
  } else {
    messages.push({ role: "user", content: trimmedQuestion });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model:       image ? "gpt-4o" : casual ? "gpt-4o-mini" : config.model,
        messages,
        max_tokens:  image ? 1500 : casual ? 300 : config.maxOutput,
        temperature: casual ? 1.0 : 0.7,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("OpenAI error:", err);
      return res.status(500).json({ error: "Knox couldn't reach the AI. Please try again." });
    }

    const data = await response.json();
    let answer = data.choices?.[0]?.message?.content || "";

    // Clean LaTeX
    answer = answer
      .replace(/\\\(/g, '').replace(/\\\)/g, '')
      .replace(/\\\[/g, '').replace(/\\\]/g, '')
      .replace(/\\times/g, '×').replace(/\\div/g, '÷')
      .replace(/\\cdot/g, '·').replace(/\\pm/g, '±')
      .replace(/\\neq/g, '≠').replace(/\\leq/g, '≤')
      .replace(/\\geq/g, '≥').replace(/\\approx/g, '≈')
      .replace(/\\pi/g, 'π').replace(/\\infty/g, '∞')
      .replace(/\\/g, '');

    // Strip upsell from free homework answers
    if (plan === 'free' && !casual) {
      try {
        const bad = ['Upgrade to Super Knox', 'upgrade to Super Knox', 'Super Knox for full', '💡 Upgrade'];
        answer = answer.split('\n').filter(l => !bad.some(p => l.includes(p))).join('\n').trim();
      } catch(e) {}
    }

    return res.status(200).json({ answer, plan, isCasual: casual, model: casual ? "gpt-4o-mini" : (image ? "gpt-4o" : config.model), usage: data.usage });

  } catch (err) {
    console.error("Ask error:", err.message);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}
