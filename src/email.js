const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const APP_URL = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

async function sendEmail({ to, subject, html }) {
  if (!RESEND_API_KEY) {
    console.log(`[EMAIL] Skipped (no RESEND_API_KEY): to=${to} subject="${subject}"`);
    return null;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "iMade <noreply@imade.one>",
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`[EMAIL] Resend error ${res.status}:`, text);
    throw new Error("Failed to send email");
  }
  const data = await res.json();
  console.log(`[EMAIL] Sent to=${to} subject="${subject}" id=${data.id}`);
  return data;
}

function emailTemplate(title, bodyHtml) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:480px;margin:40px auto;padding:0 20px;">
    <div style="background:#14142a;border:1px solid #2a2a45;border-radius:20px;padding:40px 32px;text-align:center;">
      <h1 style="margin:0 0 8px;font-size:28px;font-weight:700;color:#e2e8f0;">iMade</h1>
      <h2 style="margin:0 0 24px;font-size:18px;font-weight:600;color:#8a8aa0;">${title}</h2>
      ${bodyHtml}
      <p style="margin:24px 0 0;font-size:12px;color:#5a5a70;">
        If you didn't request this, you can safely ignore this email.
      </p>
    </div>
  </div>
</body>
</html>`;
}

function sendVerificationEmail(email, token) {
  const url = `${APP_URL}/api/verify-email?token=${encodeURIComponent(token)}`;
  const html = emailTemplate("Verify Your Email", `
    <p style="color:#c0c0d0;font-size:14px;margin:0 0 24px;line-height:1.6;">
      Thanks for signing up! Click the button below to verify your email address and start ranking your music.
    </p>
    <a href="${url}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#4338ca,#6366f1);color:#fff;font-size:15px;font-weight:700;text-decoration:none;border-radius:12px;">
      Verify Email
    </a>
    <p style="margin:20px 0 0;font-size:12px;color:#6b6b80;">
      Or copy this link: <span style="color:#818cf8;word-break:break-all;">${url}</span>
    </p>
  `);
  return sendEmail({ to: email, subject: "Verify your iMade account", html });
}

function sendPasswordResetEmail(email, token) {
  const url = `${APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  const html = emailTemplate("Reset Your Password", `
    <p style="color:#c0c0d0;font-size:14px;margin:0 0 24px;line-height:1.6;">
      We received a request to reset your password. Click the button below to choose a new one. This link expires in 1 hour.
    </p>
    <a href="${url}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#4338ca,#6366f1);color:#fff;font-size:15px;font-weight:700;text-decoration:none;border-radius:12px;">
      Reset Password
    </a>
    <p style="margin:20px 0 0;font-size:12px;color:#6b6b80;">
      Or copy this link: <span style="color:#818cf8;word-break:break-all;">${url}</span>
    </p>
  `);
  return sendEmail({ to: email, subject: "Reset your iMade password", html });
}

module.exports = { sendEmail, sendVerificationEmail, sendPasswordResetEmail, APP_URL };
