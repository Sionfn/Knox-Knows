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
<body style="margin:0;padding:0;background:#FFF8F0;font-family:'Nunito',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#3C3C3C;">
  <div style="background:#FFF8F0;padding:28px 16px;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(255,107,0,0.10);border:1px solid #F0E6DA;">

      <!-- Orange header bar -->
      <div style="background:#FF6B00;padding:22px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;"><tr>
          <td style="vertical-align:middle;width:44px;">
            <img src="https://knoxknowsapp.com/knox-logo-square.jpg" alt="Knox" width="40" height="40" style="border-radius:50%;display:block;border:2px solid rgba(255,255,255,0.5);">
          </td>
          <td style="vertical-align:middle;padding-left:12px;">
            <span style="font-size:20px;font-weight:900;color:#ffffff;letter-spacing:-0.2px;">Knox Knows</span>
          </td>
        </tr></table>
      </div>

      <!-- Body: styled like a Knox answer bubble -->
      <div style="padding:28px 28px 8px;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;"><tr>
          <td style="vertical-align:top;width:40px;">
            <img src="https://knoxknowsapp.com/knox-logo-square.jpg" alt="" width="34" height="34" style="border-radius:50%;display:block;">
          </td>
          <td style="vertical-align:top;padding-left:12px;">
            <div style="font-size:11px;font-weight:900;color:#999;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Knox</div>
            <div style="background:#FFF8F0;border:1.5px solid #FFE0C2;border-radius:4px 16px 16px 16px;padding:18px 20px;font-size:15.5px;line-height:1.65;color:#3C3C3C;">
              ${bodyHtml}
            </div>
          </td>
        </tr></table>
      </div>

      <!-- Footer -->
      <div style="padding:20px 28px 26px;">
        <p style="margin:0;color:#B3A5A0;font-size:12px;line-height:1.6;border-top:1px solid #F0E6DA;padding-top:18px;">
          You're receiving this because you have a Knox Knows account.<br>
          <a href="https://knoxknowsapp.com" style="color:#FF6B00;font-weight:700;text-decoration:none;">knoxknowsapp.com</a> &nbsp;&middot;&nbsp;
          <a href="https://knoxknowsapp.com/privacy.html" style="color:#B3A5A0;text-decoration:none;">Privacy</a> &nbsp;&middot;&nbsp;
          <a href="https://knoxknowsapp.com/terms.html" style="color:#B3A5A0;text-decoration:none;">Terms</a>
        </p>
      </div>

    </div>
    <div style="text-align:center;margin-top:14px;">
      <span style="font-size:12px;font-weight:700;color:#C9B8AE;">🦊 Stop guessing. Start knowing.</span>
    </div>
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
  if (!process.env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY is not set — cannot send welcome email");
    return res.status(500).json({ error: "Email service not configured" });
  }

  const textBody = `Hey ${firstName},

Thanks for signing up for Knox Knows — your account is ready to use.

Ask Knox any homework question at https://knoxknowsapp.com. You get 15 questions every 3 hours free, every subject, and you can snap a photo of your homework instead of typing it.

I built Knox Knows because I wanted a tutor that actually explains the why, not one that just spits out answers. If Knox ever gets something wrong, hit the thumbs-down on the answer — I read those personally.

Any questions, just reply to this email. It comes straight to me.

— Sion
Knox Knows`;

  const htmlBody = knoxEmailShell(`
    <p style="margin:0 0 14px;font-weight:800;">Hey ${firstName}, 🦊</p>
    <p style="margin:0 0 14px;">Thanks for signing up for <strong style="color:#FF6B00;">Knox Knows</strong> — your account is ready to use.</p>
    <p style="margin:0 0 14px;">Ask Knox any homework question at <a href="https://knoxknowsapp.com" style="color:#FF6B00;font-weight:800;text-decoration:none;">knoxknowsapp.com</a>. Here's what you get:</p>
    <ul style="margin:0 0 14px;padding-left:20px;">
      <li style="margin-bottom:6px;"><strong style="color:#FF6B00;">15 questions every 3 hours</strong>, free</li>
      <li style="margin-bottom:6px;"><strong style="color:#FF6B00;">Every subject</strong> — math, science, history, english</li>
      <li style="margin-bottom:6px;"><strong style="color:#FF6B00;">Snap a photo</strong> of your homework instead of typing it</li>
    </ul>
    <p style="margin:0 0 14px;">I built Knox because I wanted a tutor that actually explains the <em>why</em>, not one that just spits out answers. If Knox ever gets something wrong, hit the <strong>thumbs-down</strong> on the answer — I read those personally.</p>
    <p style="margin:0 0 16px;">Any questions, just reply to this email. It comes straight to me.</p>
    <p style="margin:0 0 2px;font-weight:800;">— Sion</p>
    <p style="margin:0;color:#999;font-size:13px;font-weight:700;">Founder, Knox Knows</p>
  `);

  try {
    const fromEmail = process.env.EMAIL_FROM || "support@knoxknowsapp.com";
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        from:     `Sion at Knox Knows <${fromEmail}>`,
        to:       [email],
        reply_to: "support@knoxknowsapp.com",
        subject:  `Your Knox Knows account is ready, ${firstName}`,
        html:     htmlBody,
        text:     textBody,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Resend error (welcome):", err);
      return res.status(500).json({ error: "Failed to send email" });
    }

    console.log(`✓ Welcome email sent to ${email}`);
    return res.status(200).json({ sent: true });

  } catch (err) {
    console.error("Welcome email send error:", err.message);
    return res.status(500).json({ error: "Failed to send email" });
  }
}
