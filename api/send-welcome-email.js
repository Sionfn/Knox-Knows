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
            <td align="center" style="background:#FF6B00;border-radius:20px 20px 0 0;padding:32px 40px;">
              <img src="https://knoxknowsapp.com/knox-logo.jpg" alt="Knox" width="80" height="80" style="border-radius:50%;border:3px solid rgba(255,255,255,0.4);display:block;margin:0 auto 16px;">
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
