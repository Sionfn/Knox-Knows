// /api/send-welcome-email.js — Knox Knows
// Sends a welcome email when a new user signs up.

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
  const bodyName = req.body?.name;
  const displayName = bodyName || tokenName || email?.split("@")[0] || "there";
  const firstName   = displayName.split(" ")[0];

  try {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.SENDGRID_API_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email, name: displayName }],
        }],
        from: {
          email: process.env.SENDGRID_FROM_EMAIL || "support@knoxknowsapp.com",
          name:  "Knox from Knox Knows",
        },
        reply_to: {
          email: "support@knoxknowsapp.com",
          name:  "Knox Knows Support",
        },
        subject: `Welcome to Knox Knows, ${firstName}! 🦊`,
        content: [
          {
            type:  "text/plain",
            value: `Hey ${firstName}!\n\nWelcome to Knox Knows — I'm Knox, your AI study companion 🦊\n\nYou get 5 free questions every day. Just ask me anything — math, science, history, English, and more.\n\nStart learning now: https://knoxknowsapp.com\n\nIf you ever need help, just reply to this email.\n\n— Knox 🦊\nKnox Knows`,
          },
          {
            type:  "text/html",
            value: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Knox Knows</title>
</head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <!-- Header -->
          <tr>
            <td align="center" style="background:#FF6B00;border-radius:20px 20px 0 0;padding:32px 40px;border-bottom:4px solid #CC5500;">
              <img src="data:image/jpeg;base64,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" alt="Knox" width="80" height="80" style="border-radius:50%;border:3px solid rgba(255,255,255,0.4);display:block;margin:0 auto 16px;">
              <h1 style="margin:0;font-size:28px;font-weight:900;color:white;letter-spacing:-0.02em;">Knox Knows</h1>
              <p style="margin:6px 0 0;font-size:14px;color:rgba(255,255,255,0.85);font-weight:600;">Your AI study companion 🦊</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:white;padding:40px;border-radius:0 0 20px 20px;box-shadow:0 4px 20px rgba(0,0,0,0.08);">

              <h2 style="margin:0 0 8px;font-size:24px;font-weight:900;color:#1f2937;">Hey ${firstName}! 👋</h2>
              <p style="margin:0 0 24px;font-size:16px;color:#6B7280;line-height:1.6;font-weight:500;">Welcome to Knox Knows — I'm Knox, and I'm here to help you ace every subject.</p>

              <!-- What you get -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF8F0;border-radius:14px;border:2px solid #FFD0A0;padding:0;margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 12px;font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:0.06em;color:#FF6B00;">What you get for free</p>
                    <table cellpadding="0" cellspacing="0">
                      <tr><td style="padding:5px 0;font-size:15px;color:#1f2937;font-weight:600;">✅ &nbsp;5 questions every day</td></tr>
                      <tr><td style="padding:5px 0;font-size:15px;color:#1f2937;font-weight:600;">✅ &nbsp;Every subject — math, science, history, English</td></tr>
                      <tr><td style="padding:5px 0;font-size:15px;color:#1f2937;font-weight:600;">✅ &nbsp;Step-by-step explanations</td></tr>
                      <tr><td style="padding:5px 0;font-size:15px;color:#1f2937;font-weight:600;">✅ &nbsp;Photo upload — snap your homework</td></tr>
                      <tr><td style="padding:5px 0;font-size:15px;color:#1f2937;font-weight:600;">✅ &nbsp;Streaks, leagues &amp; Know Points</td></tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td align="center">
                    <a href="https://knoxknowsapp.com" style="display:inline-block;background:#FF6B00;color:white;text-decoration:none;font-size:16px;font-weight:900;padding:16px 40px;border-radius:14px;box-shadow:0 4px 0 #CC5500;letter-spacing:-0.01em;">
                      Ask Knox Now →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Upgrade nudge -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0FDF4;border-radius:12px;border:2px solid #86EFAC;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0;font-size:14px;font-weight:700;color:#166534;">⚡ Want more? <a href="https://knoxknowsapp.com/#pricing" style="color:#16A34A;font-weight:900;">Upgrade to Super Knox</a> for 25 questions/day — just $9.99/month with a 3-day free trial.</p>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:14px;color:#9CA3AF;line-height:1.6;">Questions? Just reply to this email — we read every one.<br><strong style="color:#6B7280;">— Knox &amp; the Knox Knows team 🦊</strong></p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:24px 0;">
              <p style="margin:0;font-size:12px;color:#9CA3AF;">© 2026 Knox Knows · <a href="https://knoxknowsapp.com/privacy.html" style="color:#9CA3AF;">Privacy</a> · <a href="https://knoxknowsapp.com/terms.html" style="color:#9CA3AF;">Terms</a></p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("SendGrid error:", err);
      return res.status(500).json({ error: "Failed to send email" });
    }

    return res.status(200).json({ sent: true });

  } catch (err) {
    console.error("Email send error:", err.message);
    return res.status(500).json({ error: "Failed to send email" });
  }
}
