/**
 * Sends verification email via Resend when RESEND_API_KEY + MAIL_FROM are set.
 * Otherwise logs the link (development / until email is configured).
 */
export async function sendVerificationEmail(toEmail: string, token: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  const publicApiBase = (process.env.API_PUBLIC_URL || 'http://localhost:5000/api').replace(/\/$/, '');
  const verifyUrl = `${publicApiBase}/auth/verify-email?token=${encodeURIComponent(token)}`;
  const appName = process.env.APP_NAME || 'Payment Notify';

  const text =
    `Hi,\n\n` +
    `Please verify your email for ${appName}.\n\n` +
    `Open this link in your browser:\n${verifyUrl}\n\n` +
    `Or open the app → Verify email, and paste this token:\n${token}\n\n` +
    `This link expires in 48 hours.\n`;

  if (!apiKey || !from) {
    console.log(`[verification-email] (not sent — set RESEND_API_KEY + MAIL_FROM)\nTo: ${toEmail}\n${text}`);
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [toEmail],
      subject: `${appName} — verify your email`,
      text,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('[verification-email] Resend error:', res.status, errText);
  }
}
