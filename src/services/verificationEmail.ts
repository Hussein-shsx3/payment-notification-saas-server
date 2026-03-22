import nodemailer from 'nodemailer';

export type VerificationEmailResult = {
  sent: boolean;
  channel?: 'gmail';
  detail?: string;
};

/**
 * Resolves a valid Gmail "from" header. Gmail SMTP only accepts the authenticated
 * account (GMAIL_USER); a mismatched MAIL_FROM is ignored with a warning.
 */
function resolveFromHeader(appName: string, gmailUser: string): string {
  const raw = process.env.MAIL_FROM?.trim();
  const normalizedUser = gmailUser.toLowerCase();

  if (!raw) {
    return `${appName} <${gmailUser}>`;
  }

  const angle = raw.match(/^(.+?)\s*<([^>]+)>$/);
  const emailInFrom = (angle ? angle[2] : raw).trim().toLowerCase();

  if (emailInFrom === normalizedUser) {
    return angle ? raw : `${appName} <${gmailUser}>`;
  }

  console.warn(
    '[verification-email] MAIL_FROM does not match GMAIL_USER — using authenticated address as sender'
  );
  return `${appName} <${gmailUser}>`;
}

/**
 * Sends verification email via Gmail SMTP (GMAIL_USER + GMAIL_APP_PASSWORD).
 * Uses explicit smtp.gmail.com:465 — often more reliable on cloud hosts than `service: 'gmail'`.
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

  const from = resolveFromHeader(appName, user);

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user, pass },
      connectionTimeout: 20_000,
      greetingTimeout: 20_000,
      socketTimeout: 30_000,
    });

    const info = await transporter.sendMail({
      from,
      to: toEmail,
      subject,
      text,
    });
    console.log('[verification-email] Gmail SMTP ok messageId=', info.messageId ?? 'n/a', 'to=', toEmail);
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
