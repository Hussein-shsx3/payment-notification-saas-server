import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

export type VerificationEmailResult = {
  sent: boolean;
  detail?: string;
};

const SMTP = {
  host: 'smtp.gmail.com',
  connectionTimeout: 20_000,
  greetingTimeout: 20_000,
  socketTimeout: 30_000,
} as const;

function getGmailCredentials(): { user: string; pass: string } | null {
  const user = process.env.GMAIL_USER?.trim();
  const pass = (process.env.GMAIL_APP_PASSWORD ?? '').replace(/\s/g, '');
  if (!user || !pass) return null;
  return { user, pass };
}

function buildMail(token: string): { subject: string; text: string; appName: string } {
  const base = (process.env.API_PUBLIC_URL || 'http://localhost:5000/api').replace(/\/$/, '');
  const verifyUrl = `${base}/auth/verify-email?token=${encodeURIComponent(token)}`;
  const appName = process.env.APP_NAME || 'App';
  const subject = `${appName} — verify your email`;
  const text =
    `Hi,\n\n` +
    `Please verify your email for ${appName}.\n\n` +
    `Open this link:\n${verifyUrl}\n\n` +
    `Or paste this token in the app:\n${token}\n\n` +
    `This link expires in 48 hours.\n`;
  return { subject, text, appName };
}

function fromHeader(appName: string, gmailUser: string): string {
  const raw = process.env.MAIL_FROM?.trim();
  if (!raw) return `${appName} <${gmailUser}>`;

  const m = raw.match(/^(.+?)\s*<([^>]+)>$/);
  const email = (m ? m[2] : raw).trim().toLowerCase();
  if (email === gmailUser.toLowerCase()) {
    return m ? raw : `${appName} <${gmailUser}>`;
  }
  console.warn('[mail] MAIL_FROM email does not match GMAIL_USER — sending as GMAIL_USER');
  return `${appName} <${gmailUser}>`;
}

async function sendWithGmail(
  creds: { user: string; pass: string },
  mail: { from: string; to: string; subject: string; text: string }
): Promise<SMTPTransport.SentMessageInfo> {
  const auth = { user: creds.user, pass: creds.pass };
  const common = { ...SMTP, auth };

  const t465 = nodemailer.createTransport({
    ...common,
    port: 465,
    secure: true,
  });

  try {
    return await t465.sendMail(mail);
  } catch (first) {
    console.warn('[mail] smtp 465 failed, trying 587:', first);
    const t587 = nodemailer.createTransport({
      ...common,
      port: 587,
      secure: false,
      requireTLS: true,
    });
    return t587.sendMail(mail);
  }
}

/**
 * Sends the verification email using Gmail SMTP (App Password).
 */
export async function sendVerificationEmail(
  toEmail: string,
  token: string
): Promise<VerificationEmailResult> {
  const creds = getGmailCredentials();
  const { subject, text, appName } = buildMail(token);

  if (!creds) {
    console.warn('[mail] GMAIL_USER and GMAIL_APP_PASSWORD required');
    console.log('[mail] (not sent) preview:\n', toEmail, '\n', text);
    return { sent: false, detail: 'Gmail not configured (GMAIL_USER + GMAIL_APP_PASSWORD)' };
  }

  if (creds.pass.length !== 16) {
    console.error(`[mail] App password must be 16 characters after removing spaces; got ${creds.pass.length}`);
  }

  const from = fromHeader(appName, creds.user);

  try {
    const info = await sendWithGmail(creds, { from, to: toEmail, subject, text });
    console.log('[mail] sent messageId=', info.messageId ?? 'n/a', 'to=', toEmail);
    return { sent: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[mail] Gmail SMTP error:', e);
    return { sent: false, detail: msg };
  }
}

/** Health check: connects to Gmail SMTP and runs `verify()` (no email sent). */
export async function verifyGmailSmtpConnection(): Promise<{ ok: boolean; error?: string }> {
  const creds = getGmailCredentials();
  if (!creds) {
    return { ok: false, error: 'GMAIL_USER or GMAIL_APP_PASSWORD missing' };
  }

  const common = {
    host: SMTP.host,
    auth: creds,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  };

  try {
    const t465 = nodemailer.createTransport({ ...common, port: 465, secure: true });
    await t465.verify();
    return { ok: true };
  } catch {
    try {
      const t587 = nodemailer.createTransport({
        ...common,
        port: 587,
        secure: false,
        requireTLS: true,
      });
      await t587.verify();
      return { ok: true };
    } catch (e587) {
      const msg = e587 instanceof Error ? e587.message : String(e587);
      return { ok: false, error: msg };
    }
  }
}
