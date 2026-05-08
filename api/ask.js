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

// ── Daily quota limits per plan ────────────────────────────────────────────
const PLAN_QUOTAS = {
  free:   { hw: 5,   chat: 20 },
  super:  { hw: 25,  chat: 50 },
  max:    { hw: 100, chat: 999 },
  family: { hw: 25,  chat: 50 },
};

// Returns today's date string in UTC, e.g. "2026-05-08"
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// Checks and increments the user's daily usage in Firestore.
// Returns { allowed: true } or { allowed: false, reason: string }
async function checkAndIncrementQuota(uid, plan, isCasual) {
  const quota     = PLAN_QUOTAS[plan] || PLAN_QUOTAS.free;
  const field     = isCasual ? "chat" : "hw";
  const limit     = quota[field];
  const today     = todayKey();
  const usageRef  = db.collection("users").doc(uid).collection("usage").doc(today);

  try {
    const result = await db.runTransaction(async (tx) => {
      const snap  = await tx.get(usageRef);
      const data  = snap.exists ? snap.data() : { hw: 0, chat: 0 };
      const count = data[field] || 0;

      if (count >= limit) {
        return { allowed: false, count, limit };
      }

      tx.set(usageRef, { ...data, [field]: count + 1, updatedAt: new Date().toISOString() }, { merge: true });
      return { allowed: true, count: count + 1, limit };
    });

    return result;
  } catch (err) {
    // If quota check fails, log and allow the request rather than breaking the app
    console.error("Quota check error:", err.message);
    return { allowed: true };
  }
}

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

// ── LEARN WITH KNOX — Socratic system prompts per plan ─────────────────────
const LEARN_PROMPTS = {
  free: `You are Knox, a friendly tutor using the Socratic method. FREE plan — max 3 hints then reveal the answer.

Your job is to guide the student to discover the answer themselves — NOT give it away.

Round 1: Ask what they already know about the topic. Keep it encouraging.
Round 2: Give a specific hint based on their response.
Round 3: Give a stronger hint — almost there.
After round 3: If they haven't got it, reveal the full answer with explanation.

Rules:
- Never give the answer in the first response
- Ask ONE question or give ONE hint per message
- Be warm and encouraging — celebrate effort
- Keep messages short — 2-3 sentences max
- Track the conversation to know which round you're on
- Never use LaTeX, write math plainly`,

  super: `You are Knox, a skilled Socratic tutor. SUPER KNOX plan — full guided learning.

Your job is to guide the student to discover the answer themselves through questions and hints. Never just give the answer unless they've clearly tried multiple times.

How to guide:
- Start by asking what they already know or what they've tried
- Based on their response, ask a targeted question that points them in the right direction
- If they're stuck, give a hint — then ask again
- When they get it right, confirm enthusiastically and add a brief explanation of why they're right
- If they give a wrong answer, don't say "wrong" — say something like "not quite, think about..."
- Adapt to how they're doing — if they're close, push a little. If they're lost, give a bigger hint.

Rules:
- ONE question or hint per message — never dump everything at once
- Short messages — 2-4 sentences
- Warm, encouraging tone — mistakes are part of learning
- Never use LaTeX, write math plainly`,

  max: `You are Knox, an expert Socratic tutor. MAX KNOX plan — deep guided learning.

Your job is to guide the student to genuine understanding — not just the right answer. Use the Socratic method to help them think through the problem.

Your approach:
- First ask what they know and what they've tried
- Ask probing questions that reveal what's missing in their thinking
- When they struggle, give a conceptual hint — not just the next step
- When they get closer, acknowledge it and push deeper: "Right! Now why does that work?"
- When they get it, confirm, explain the deeper WHY, and point out what this connects to
- If they've been stuck for a while, give a more direct hint — don't let them stay frustrated

What makes Max special:
- At the end of each session, give a brief "What you learned" wrap-up
- Connect the concept to something bigger or real-world
- Point out common mistakes students make on this topic

Rules:
- ONE question or hint per message
- Adapt depth to the student's level based on how they respond
- Never use LaTeX, write math plainly`,

  family: `You are Knox, a warm friendly tutor for the whole family. FAMILY KNOX plan.

Use simple clear language suitable for all ages K-12. Guide students to discover answers themselves.

How to guide:
- Ask what they already know in simple terms
- Give hints using everyday language and examples
- Be extra encouraging — every step forward is worth celebrating
- If they're stuck, use an analogy or real-world example to help
- When they get it, explain why in simple terms

Rules:
- ONE question or hint per message
- Very simple language — avoid jargon
- Short messages — 2-3 sentences
- Extra warm and patient tone
- Never use LaTeX, write math plainly`,
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

  const prompt = `You are classifying a student's message to an AI tutor as either "casual" or "homework".

CASUAL = the user is chatting, greeting, reacting, expressing feelings, saying what they're up to, making small talk, or NOT actually asking a question that requires a subject-matter answer.
Examples of casual: "hey", "thanks", "that makes sense", "nothing much just wanted to get some homework done", "I'm tired", "what's up", "you're helpful", "ok cool", "I'll try that"

HOMEWORK = the user is actually asking a question or requesting help with a specific topic, subject, concept, problem, or task — even if phrased casually.
Examples of homework: "what is photosynthesis", "help me solve 2x+3=7", "can you explain the civil war", "write me an intro paragraph", "what's the formula for area of a circle", "i need help with my essay"

Key rule: mentioning homework/school in passing ("wanted to get some homework done", "I have an essay due") is CASUAL unless they actually ask a specific question.

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
    console.log('classifier:', verdict);
    return verdict === 'casual';
  } catch(e) {
    console.error('Classifier failed:', e.message);
    // Simple fallback — short messages with no numbers/operators are likely casual
    const short = q.length <= 20 && !/[0-9+\-*/=?]/.test(q);
    return short;
  }
}

// ── Learn session helpers ────────────────────────────────────────────────────
// A "learn session" is opened when a new homework question starts in learn mode.
// All follow-up messages (hints, attempts, "idk") within that session use chat
// credits instead of homework credits.

function generateSessionId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Returns true if the message is a continuation (student working through same problem)
// rather than a brand-new question.
async function isLearnContinuation(question, history) {
  const q = (question || '').trim();
  if (!q) return true;

  // If there's no prior learn history, it must be a new question
  const learnHistory = (history || []).filter(m => m.isLearn);
  if (learnHistory.length === 0) return false;

  const recentCtx = learnHistory.slice(-6)
    .map(m => `${m.role === 'user' ? 'Student' : 'Knox'}: ${(m.content || '').substring(0, 100)}`)
    .join('\n');

  const prompt = `A student is working with an AI tutor. Determine if the latest message is a CONTINUATION of working through the same problem, or a BRAND NEW question.

CONTINUATION examples: "idk", "I don't know", "can you give me a hint", "is it X?", "why?", "I'm confused", "ok", "that makes sense", "what about...", "so then...", partial answers, follow-up attempts, asking for more hints on the same topic.
NEW QUESTION examples: starting an entirely different topic, a new math problem, a new subject, "now help me with...", "what is [completely different thing]".

Recent conversation:
${recentCtx}

Latest message: "${q}"

Reply with ONE word only: continuation or new`;

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
    console.log('session classifier:', verdict);
    return verdict === 'continuation';
  } catch (e) {
    console.error('Session classifier failed:', e.message);
    // Fallback: short messages are likely continuations
    return q.length < 40;
  }
}

// Store/validate a learn session in Firestore
async function getOrCreateLearnSession(uid, sessionId, isNewQuestion) {
  if (!uid) return { sessionId: generateSessionId(), isNew: true };

  const sessRef = db.collection('users').doc(uid).collection('learnSessions').doc(sessionId || '_none');

  if (!isNewQuestion && sessionId) {
    // Check if this session exists and was opened today
    try {
      const snap = await sessRef.get();
      if (snap.exists && snap.data().date === todayKey()) {
        return { sessionId, isNew: false };
      }
    } catch (e) { /* fall through to new session */ }
  }

  // Start a new session
  const newId = generateSessionId();
  try {
    await db.collection('users').doc(uid).collection('learnSessions').doc(newId).set({
      date: todayKey(),
      createdAt: new Date().toISOString(),
    });
  } catch (e) { console.error('Session create error:', e.message); }
  return { sessionId: newId, isNew: true };
}


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

  const { question, history = [], image, imageType, mode = 'answer' } = req.body;
  if (!question && !image) return res.status(400).json({ error: "No question provided." });

  const config = getConfig(plan);
  const trimmedQuestion = (question || '').substring(0, config.maxInput * 4);

  // Billing is purely mode-based — chat mode uses chat credits, everything else uses homework credits
  const isChatMode = mode === 'chat';

  // Still run casual classifier for response style (not billing)
  const casual = isChatMode || (!image && await isCasualMessage(trimmedQuestion, history));

  console.log("ask.js v3:", { plan, mode, isChatMode, casual });

  // ── Server-side daily quota enforcement ──────────────────────────────────
  if (uid) {
    const quota = await checkAndIncrementQuota(uid, plan, isChatMode);
    if (!quota.allowed) {
      const limitType = isChatMode ? "chat messages" : "homework questions";
      return res.status(429).json({
        error: `Daily limit reached`,
        message: `You've used all ${quota.limit} ${limitType} for today. Resets at midnight UTC.`,
        limitReached: true,
        limit: quota.limit,
        used: quota.count,
      });
    }
  }

  // Select system prompt based on mode
  let systemPrompt;
  if (isChatMode || casual) {
    systemPrompt = CASUAL_SYSTEM_PROMPT;
  } else if (mode === 'learn') {
    systemPrompt = LEARN_PROMPTS[plan] || LEARN_PROMPTS.super;
  } else {
    systemPrompt = config.systemPrompt;
  }
  const messages = [{ role: "system", content: systemPrompt }];

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
        model:       image ? "gpt-4o" : (isChatMode || casual) ? "gpt-4o-mini" : mode === 'learn' && plan === 'max' ? "gpt-4o" : config.model,
        messages,
        max_tokens:  image ? 1500 : (isChatMode || casual) ? 300 : mode === 'learn' ? 600 : config.maxOutput,
        temperature: (isChatMode || casual) ? 1.0 : mode === 'learn' ? 0.8 : 0.7,
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

    return res.status(200).json({ answer, plan, isCasual: casual, isLearn: mode === 'learn', isChatMode, model: casual ? 'gpt-4o-mini' : (image ? 'gpt-4o' : config.model), usage: data.usage });

  } catch (err) {
    console.error("Ask error:", err.message);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}
