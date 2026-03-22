import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

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

const timeouts = {
  connectionTimeout: 20_000,
  greetingTimeout: 20_000,
  socketTimeout: 30_000,
};

async function sendMailWithTransporter(
  transporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo>,
  mail: { from: string; to: string; subject: string; text: string }
): Promise<SMTPTransport.SentMessageInfo> {
  return transporter.sendMail(mail);
}

/**
 * Gmail on some networks blocks 465; try 587 STARTTLS as fallback.
 */
async function sendViaGmailSmtp(
  user: string,
  pass: string,
  mail: { from: string; to: string; subject: string; text: string }
): Promise<SMTPTransport.SentMessageInfo> {
  const common = {
    host: 'smtp.gmail.com',
    auth: { user, pass },
    ...timeouts,
  } as const;

  const try465 = nodemailer.createTransport({
    ...common,
    port: 465,
    secure: true,
  });

  try {
    return await sendMailWithTransporter(try465, mail);
  } catch (first) {
    console.warn('[verification-email] SMTP 465 failed, trying 587 STARTTLS:', first);
    const try587 = nodemailer.createTransport({
      ...common,
      port: 587,
      secure: false,
      requireTLS: true,
    });
    return sendMailWithTransporter(try587, mail);
  }
}

/**
 * Sends verification email via Gmail SMTP (GMAIL_USER + GMAIL_APP_PASSWORD).
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
  const passRaw = process.env.GMAIL_APP_PASSWORD ?? '';
  const pass = passRaw.replace(/\s/g, '');

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

  if (pass.length !== 16) {
    console.error(
      `[verification-email] GMAIL_APP_PASSWORD should be 16 characters after removing spaces; got length ${pass.length}. Check .env — use double quotes if the value has spaces, e.g. GMAIL_APP_PASSWORD="abcd efgh ijkl mnop"`
    );
  }

  const from = resolveFromHeader(appName, user);

  try {
    const info = await sendViaGmailSmtp(user, pass, {
      from,
      to: toEmail,
      subject,
      text,
    });
    console.log('[verification-email] Gmail SMTP ok messageId=', info.messageId ?? 'n/a', 'to=', toEmail);
    return { sent: true, channel: 'gmail' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[verification-email] Gmail SMTP error (465 and 587):', e);
    return {
      sent: false,
      detail: `Gmail send failed: ${msg}`,
    };
  }
}
