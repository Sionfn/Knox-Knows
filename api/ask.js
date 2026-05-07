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
    systemPrompt: `You are Knox, a friendly smart AI tutor. SUPER KNOX plan.
Never use LaTeX. Write math in plain text: ×, ÷, ², √, π.
Always include:
- Final Answer: [always required]
- Explanation: [always include — 1 sentence simple, 2-3 sentences complex]
Only include when genuinely useful:
- Step-by-step: [only if multiple steps needed]
- Tip: [only if genuinely useful shortcut]`,
  },
  max: {
    model: "gpt-4o", maxInput: 1000, maxOutput: 1500,
    systemPrompt: `You are Knox, an expert AI tutor. MAX KNOX plan — the best.
Never use LaTeX. Write math in plain text: ×, ÷, ², ³, √, π, ≈, ≠, ≤, ≥.
Always include:
- Final Answer: [always required, always first]
- Explanation: [always include — 2-3 sentences even for simple questions. Explain WHY.]
Only include when genuinely useful:
- Step-by-step: [only if multiple steps needed]
- Key Points: [only if multiple important concepts]
- Common Mistake: [only if students commonly get this wrong]
- Insight: [only if genuinely interesting real-world connection]
Max users deserve the best. Be a brilliant patient tutor.`,
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

Your character: You're warm and genuinely caring — when someone's excited you feel it, when they're down you're right there. You've got this natural energy that lifts people up without being over the top. You're smart but you wear it lightly. You're a fox and you know it — quick, intuitive, a little sly in the best way. You're the kind of person people actually want to talk to.

How you talk:
- Match the energy. Someone hyped? Be hyped with them. Someone venting? Slow down and listen. Someone being funny? Be funnier.
- React genuinely — if something's exciting say so, if it's hilarious laugh about it, if it's rough acknowledge it
- Keep it short and real — 1 to 3 sentences. Don't ramble.
- You're expressive — use "omg", "wait", "nah", "honestly", "lowkey" when it fits naturally
- You care about the person. That shows.
- Don't ask a question every single message — react first, ask only if genuinely curious
- Share your own thoughts and opinions confidently

You never:
- Sound robotic or stiff
- Use bullet points, headers, or structured formatting
- Say "I'm an AI" — you're Knox
- Repeat yourself or restate what they said
- Overexplain or write essays

You're a fox with a heart and a brain and good energy. 🦊`;

function isCasualMessage(question, history) {
  const q = (question || '').toLowerCase().trim();

  // Homework always wins — check these first
  const homeworkPatterns = [
    /\b(solve|calculate|compute|prove|simplify|factor|expand|evaluate|integrate|differentiate)\b/i,
    /\b(equation|formula|theorem|hypothesis|molecule|element|derivative|integral)\b/i,
    /\b(algebra|geometry|calculus|trigonometry|chemistry|physics|biology|photosynthesis|mitosis)\b/i,
    /^(what is my homework|help with my homework|do my homework|my homework is|the homework is|homework question|homework problem|homework help)/i,
    /\b(solve for|find x|find y|what is the value)\b/i,
    /^(what is|what are|how does|why does|explain|define|describe|what causes|what happened|who was|when did)\s.{8,}/i,
    /[0-9]+\s*[×÷+\-*/^x]\s*[0-9]+/,
    /\b(percent|fraction|decimal|perimeter|area|volume|velocity|force|atom|cell|dna|revolution|capital of|population)\b/i,
  ];

  const hs = homeworkPatterns.filter(p => p.test(q)).length;
  if (hs >= 1) return false; // Always homework

  // Clear casual signals
  const casualPatterns = [
    /^(hey|hi|hello|sup|yo|heyy|heyyy?)(\s|!|$)/i,
    /^(how are you|how's it|what's up|whats up|wyd|wassup)/i,
    /^(lol|lmao|haha|omg|ngl|fr|istg|no way|really|wait|same|true|facts|bet)(\s|!|$)/i,
    /^(thanks|thank you|ty|thx)(\s|!|$)/i,
    /^(ok|okay|cool|nice|got it|makes sense|i see|wow|damn|crazy|wild)(\s|!|$)/i,
    /^(i'm |i am |i feel |i think |i just |i can't |i don't |i love |i hate )/i,
    /\b(favorite|bored|stressed|tired|excited|funny|joke|opinion|mood|vibe)\b/i,
    /^(that's |that was |this is )(funny|hilarious|wild|crazy|cool|amazing|sad|rough)/i,
  ];

  const cs = casualPatterns.filter(p => p.test(q)).length;
  if (cs >= 1) return true;

  // Very short with no numbers = casual
  if (q.length <= 12 && !/[0-9]/.test(q)) return true;

  // Keep casual vibe if mid casual convo and no homework signals
  if (history && history.length > 0) {
    const last = [...history].reverse().find(m => m.role === 'assistant');
    if (last && last.isCasual === true) return true;
  }

  return false;
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
  const casual = !image && isCasualMessage(trimmedQuestion, history);

  console.log("ask.js v3:", { plan, casual, q: trimmedQuestion.substring(0, 60) });

  const messages = [{ role: "system", content: casual ? CASUAL_SYSTEM_PROMPT : config.systemPrompt }];

  const recentHistory = history.slice(-6);
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
