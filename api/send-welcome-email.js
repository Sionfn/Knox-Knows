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
          name:  "Sion at Knox Knows",
        },
        reply_to: {
          email: "support@knoxknowsapp.com",
          name:  "Sion at Knox Knows",
        },
        subject: `Your Knox Knows account is ready, ${firstName}`,
        // Plain-text version matters for deliverability — Gmail rewards
        // emails where text and HTML versions match closely in content.
        content: [
          {
            type:  "text/plain",
            value: `Hey ${firstName},

Thanks for signing up for Knox Knows. Your account is ready to use.

You can ask Knox any homework question at https://knoxknowsapp.com — 5 questions a day on the free plan, all subjects, photos work too.

I built Knox Knows because I wanted a tutor that actually teaches you the why, not just spits answers. If you ever get a wrong or confusing answer, hit the thumbs-down button and I'll see it personally.

If you have any questions, just reply to this email — it goes straight to me.

— Sion
Knox Knows`,
          },
          {
            type:  "text/html",
            // Keep HTML minimal and personal-feeling. Avoid newsletter
            // markers: no header banners, no "What you get" feature lists,
            // no upgrade pitches, no CTA buttons. Just a real-looking note.
            value: `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;font-size:16px;line-height:1.6;">
  <div style="max-width:580px;margin:0 auto;padding:32px 24px;">
    <p style="margin:0 0 16px;">Hey ${firstName},</p>
    <p style="margin:0 0 16px;">Thanks for signing up for Knox Knows. Your account is ready to use.</p>
    <p style="margin:0 0 16px;">You can ask Knox any homework question at <a href="https://knoxknowsapp.com" style="color:#FF6B00;">knoxknowsapp.com</a> — 5 questions a day on the free plan, all subjects, photos work too.</p>
    <p style="margin:0 0 16px;">I built Knox Knows because I wanted a tutor that actually teaches you the why, not just spits answers. If you ever get a wrong or confusing answer, hit the thumbs-down button and I'll see it personally.</p>
    <p style="margin:0 0 16px;">If you have any questions, just reply to this email — it goes straight to me.</p>
    <p style="margin:0 0 4px;">— Sion</p>
    <p style="margin:0 0 24px;color:#6B7280;font-size:14px;">Knox Knows</p>
    <p style="margin:0;color:#9CA3AF;font-size:12px;border-top:1px solid #E5E7EB;padding-top:16px;">You're receiving this because you signed up at knoxknowsapp.com. <a href="https://knoxknowsapp.com/privacy.html" style="color:#9CA3AF;">Privacy</a> · <a href="https://knoxknowsapp.com/terms.html" style="color:#9CA3AF;">Terms</a></p>
  </div>
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
