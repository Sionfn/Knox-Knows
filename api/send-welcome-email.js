// /api/send-welcome-email.js — Knox Knows
// Sends a welcome email when a new user signs up.
//
// Email design philosophy: these emails are intentionally simple. Gmail and
// other providers route heavily-designed HTML emails (banner headers, big CTA
// buttons, multi-column feature grids) to the Promotions tab. A clean, mostly
// text email from a named human lands in the Primary inbox. All three Knox
// emails (welcome, purchase, refund) share the same minimal house style via
// the knoxEmailShell() wrapper:
//   - One small centered logo, no giant colored banner
//   - Personal greeting, conversational body, signed by a real person
//   - A single subtle divider footer with site + Privacy/Terms links
//   - A matching text/plain part that mirrors the HTML closely

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

// ── Shared email shell ──────────────────────────────────────────────────────
// Every Knox email is built from this same wrapper so they look identical.
// `bodyHtml` is the inner content (a series of <p> tags).
function knoxEmailShell(bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;font-size:16px;line-height:1.65;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="text-align:center;margin-bottom:28px;">
      <img src="https://knoxknowsapp.com/knox-logo-square.jpg" alt="Knox Knows" width="48" height="48" style="border-radius:12px;display:inline-block;">
    </div>
    ${bodyHtml}
    <p style="margin:28px 0 0;color:#9CA3AF;font-size:12px;line-height:1.6;border-top:1px solid #E5E7EB;padding-top:18px;">
      You're receiving this because you have a Knox Knows account.<br>
      <a href="https://knoxknowsapp.com" style="color:#9CA3AF;">knoxknowsapp.com</a> &middot;
      <a href="https://knoxknowsapp.com/privacy.html" style="color:#9CA3AF;">Privacy</a> &middot;
      <a href="https://knoxknowsapp.com/terms.html" style="color:#9CA3AF;">Terms</a>
    </p>
  </div>
</body>
</html>`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Verify Firebase token
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  let decodedToken;
  try {
    decodedToken = await adminAuth.verifyIdToken(authHeader.slice(7));
  } catch (err) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { email, name: tokenName } = decodedToken;
  const bodyName    = req.body?.name;
  const displayName = bodyName || tokenName || email?.split("@")[0] || "there";
  const firstName   = displayName.split(" ")[0];

  if (!email) {
    return res.status(400).json({ error: "No email on account" });
  }
  if (!process.env.SENDGRID_API_KEY) {
    console.error("SENDGRID_API_KEY is not set — cannot send welcome email");
    return res.status(500).json({ error: "Email service not configured" });
  }

  const textBody = `Hey ${firstName},

Thanks for signing up for Knox Knows — your account is ready to use.

Ask Knox any homework question at https://knoxknowsapp.com. You get 10 questions a day free, every subject, and you can snap a photo of your homework instead of typing it.

I built Knox Knows because I wanted a tutor that actually explains the why, not one that just spits out answers. If Knox ever gets something wrong, hit the thumbs-down on the answer — I read those personally.

Any questions, just reply to this email. It comes straight to me.

— Sion
Knox Knows`;

  const htmlBody = knoxEmailShell(`
    <p style="margin:0 0 16px;">Hey ${firstName},</p>
    <p style="margin:0 0 16px;">Thanks for signing up for Knox Knows — your account is ready to use.</p>
    <p style="margin:0 0 16px;">Ask Knox any homework question at <a href="https://knoxknowsapp.com" style="color:#FF6B00;font-weight:600;">knoxknowsapp.com</a>. You get 10 questions a day free, every subject, and you can snap a photo of your homework instead of typing it.</p>
    <p style="margin:0 0 16px;">I built Knox Knows because I wanted a tutor that actually explains the <em>why</em>, not one that just spits out answers. If Knox ever gets something wrong, hit the thumbs-down on the answer — I read those personally.</p>
    <p style="margin:0 0 16px;">Any questions, just reply to this email. It comes straight to me.</p>
    <p style="margin:0 0 2px;">— Sion</p>
    <p style="margin:0;color:#6B7280;font-size:14px;">Knox Knows</p>
  `);

  try {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.SENDGRID_API_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email, name: displayName }] }],
        from:     { email: process.env.SENDGRID_FROM_EMAIL || "support@knoxknowsapp.com", name: "Sion at Knox Knows" },
        reply_to: { email: "support@knoxknowsapp.com", name: "Sion at Knox Knows" },
        subject:  `Your Knox Knows account is ready, ${firstName}`,
        content: [
          { type: "text/plain", value: textBody },
          { type: "text/html",  value: htmlBody },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("SendGrid error (welcome):", err);
      return res.status(500).json({ error: "Failed to send email" });
    }

    console.log(`✓ Welcome email sent to ${email}`);
    return res.status(200).json({ sent: true });

  } catch (err) {
    console.error("Welcome email send error:", err.message);
    return res.status(500).json({ error: "Failed to send email" });
  }
}
