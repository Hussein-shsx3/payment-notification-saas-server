import nodemailer from 'nodemailer';

export type VerificationEmailResult = {
  sent: boolean;
  channel?: 'gmail';
  /** Short hint for logs / optional client messaging when sent is false */
  detail?: string;
};

/**
 * Sends verification email via Gmail SMTP using GMAIL_USER + GMAIL_APP_PASSWORD
 * (Google Account → Security → 2-Step Verification → App passwords).
 * Optional MAIL_FROM; defaults to "APP_NAME <GMAIL_USER>".
 */
export async function sendVerificationEmail(
  toEmail: string,
  token: string
): Promise<VerificationEmailResult> {
  const publicApiBase = (process.env.API_PUBLIC_URL || 'http://localhost:5000/api').replace(/\/$/, '');
  const verifyUrl = `${publicApiBase}/auth/verify-email?token=${encodeURIComponent(token)}`;
  const appName = process.env.APP_NAME || 'Payment Notify';
  const subject = `${appName} — verify your email`;

  const text =
    `Hi,\n\n` +
    `Please verify your email for ${appName}.\n\n` +
    `Open this link in your browser:\n${verifyUrl}\n\n` +
    `Or open the app → Verify email, and paste this token:\n${token}\n\n` +
    `This link expires in 48 hours.\n`;

  const user = process.env.GMAIL_USER?.trim();
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, '');

  if (!user || !pass) {
    console.warn(
      '[verification-email] NOT SENT — set GMAIL_USER and GMAIL_APP_PASSWORD (Google App Password, not your normal Gmail password)'
    );
    console.log('[verification-email] (dev) would send to:\n', toEmail, '\n', text);
    return {
      sent: false,
      detail: 'Gmail not configured: set GMAIL_USER and GMAIL_APP_PASSWORD on the server.',
    };
  }

  const from = process.env.MAIL_FROM?.trim() || `${appName} <${user}>`;

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });
    await transporter.sendMail({
      from,
      to: toEmail,
      subject,
      text,
    });
    console.log('[verification-email] sent via Gmail SMTP to', toEmail);
    return { sent: true, channel: 'gmail' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[verification-email] Gmail SMTP error:', e);
    return {
      sent: false,
      detail: `Gmail send failed: ${msg}`,
    };
  }
}
