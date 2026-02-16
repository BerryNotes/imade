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
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#0a0a14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <!-- Outer wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a14;">
    <tr><td align="center" style="padding:48px 20px;">

      <!-- Logo -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
        <tr><td align="center" style="padding-bottom:24px;">
          <span style="font-size:24px;font-weight:800;color:#818cf8;letter-spacing:-0.5px;">iMade</span>
        </td></tr>
      </table>

      <!-- Card -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#14142a;border:1px solid #2a2a45;border-radius:20px;">
        <tr><td style="padding:44px 36px 40px;">

          <!-- Title -->
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#e2e8f0;text-align:center;line-height:1.3;">
            ${title}
          </h1>

          <!-- Divider -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:16px 0 20px;">
              <div style="height:1px;background:linear-gradient(90deg,transparent,#2a2a45,transparent);"></div>
            </td></tr>
          </table>

          <!-- Body content -->
          ${bodyHtml}

        </td></tr>
      </table>

      <!-- Footer -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
        <tr><td align="center" style="padding:24px 0 0;">
          <p style="margin:0;font-size:12px;color:#4a4a60;line-height:1.5;">
            If you didn't request this, you can safely ignore this email.
          </p>
          <p style="margin:8px 0 0;font-size:11px;color:#3a3a50;">
            <a href="https://imade.one" style="color:#818cf8;text-decoration:none;">imade.one</a>
          </p>
        </td></tr>
      </table>

    </td></tr>
  </table>
</body>
</html>`;
}

function sendVerificationEmail(email, token) {
  const url = `${APP_URL}/api/verify-email?token=${encodeURIComponent(token)}`;
  const html = emailTemplate("Verify your email address", `
    <p style="color:#b0b0c8;font-size:15px;margin:0 0 28px;line-height:1.7;text-align:center;">
      Thanks for signing up! Click the button below to verify your email and start ranking your music.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        <a href="${url}" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#4338ca,#6366f1);color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:12px;letter-spacing:0.2px;">
          Verify Email
        </a>
      </td></tr>
    </table>
    <p style="margin:24px 0 0;font-size:12px;color:#5a5a70;text-align:center;line-height:1.6;">
      Or copy this link:<br>
      <a href="${url}" style="color:#818cf8;text-decoration:none;word-break:break-all;">${url}</a>
    </p>
  `);
  return sendEmail({ to: email, subject: "Verify your iMade account", html });
}

function sendPasswordResetEmail(email, token) {
  const url = `${APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  const html = emailTemplate("Reset your password", `
    <p style="color:#b0b0c8;font-size:15px;margin:0 0 28px;line-height:1.7;text-align:center;">
      We received a request to reset your password. Click the button below to choose a new one.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        <a href="${url}" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#4338ca,#6366f1);color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:12px;letter-spacing:0.2px;">
          Reset Password
        </a>
      </td></tr>
    </table>
    <p style="margin:24px 0 0;font-size:12px;color:#5a5a70;text-align:center;line-height:1.6;">
      Or copy this link:<br>
      <a href="${url}" style="color:#818cf8;text-decoration:none;word-break:break-all;">${url}</a>
    </p>
    <p style="margin:20px 0 0;font-size:12px;color:#4a4a60;text-align:center;">
      This link expires in 1 hour.
    </p>
  `);
  return sendEmail({ to: email, subject: "Reset your iMade password", html });
}

module.exports = { sendEmail, sendVerificationEmail, sendPasswordResetEmail, APP_URL };
