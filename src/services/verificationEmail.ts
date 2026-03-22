import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

export type VerificationEmailResult = {
  sent: boolean;
  channel?: 'resend' | 'gmail';
  detail?: string;
};

function buildVerificationContent(token: string): {
  verifyUrl: string;
  appName: string;
  subject: string;
  text: string;
} {
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
  return { verifyUrl, appName, subject, text };
}

/**
 * Resend uses HTTPS (port 443) — works on Render and other hosts that block outbound SMTP.
 */
async function sendViaResend(
  toEmail: string,
  subject: string,
  text: string
): Promise<VerificationEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.MAIL_FROM?.trim();
  if (!apiKey || !from) {
    return { sent: false, detail: 'Resend not configured' };
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
      subject,
      text,
    }),
  });

  if (res.ok) {
    const j = (await res.json().catch(() => ({}))) as { id?: string };
    console.log('[verification-email] Resend ok id=', j.id ?? 'n/a', 'to=', toEmail);
    return { sent: true, channel: 'resend' };
  }

  const errText = await res.text();
  console.error('[verification-email] Resend error', res.status, errText);
  return {
    sent: false,
    detail: `Resend ${res.status}: ${errText.slice(0, 400)}`,
  };
}

/**
 * Resolves a valid Gmail "from" header.
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
 * Order: **Resend (HTTPS)** first — required for many clouds (e.g. Render blocks SMTP to Gmail).
 * Then **Gmail SMTP** (fine on local dev or VPS with outbound SMTP allowed).
 */
export async function sendVerificationEmail(
  toEmail: string,
  token: string
): Promise<VerificationEmailResult> {
  const { appName, subject, text } = buildVerificationContent(token);

  const resendKey = process.env.RESEND_API_KEY?.trim();
  const resendFrom = process.env.MAIL_FROM?.trim();
  let lastResendDetail: string | undefined;
  if (resendKey && resendFrom) {
    const r = await sendViaResend(toEmail, subject, text);
    if (r.sent) {
      return r;
    }
    lastResendDetail = r.detail;
    console.warn('[verification-email] Resend failed, falling back to Gmail if configured:', r.detail);
  }

  const user = process.env.GMAIL_USER?.trim();
  const passRaw = process.env.GMAIL_APP_PASSWORD ?? '';
  const pass = passRaw.replace(/\s/g, '');

  if (!user || !pass) {
    if (!resendKey) {
      console.warn(
        '[verification-email] NOT SENT — set RESEND_API_KEY+MAIL_FROM (production) and/or GMAIL_USER+GMAIL_APP_PASSWORD'
      );
      console.log('[verification-email] (dev) would send to:\n', toEmail, '\n', text);
    }
    return {
      sent: false,
      detail:
        lastResendDetail ??
        'Email not configured: use Resend on Render (HTTPS), or Gmail SMTP where SMTP is allowed.',
    };
  }

  if (pass.length !== 16) {
    console.error(
      `[verification-email] GMAIL_APP_PASSWORD should be 16 characters after removing spaces; got length ${pass.length}`
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
    const timeout =
      /timeout|etimedout|econnreset|ECONNREFUSED/i.test(msg) ||
      (e instanceof Error && /timeout|etimedout/i.test(e.message));
    return {
      sent: false,
      detail: timeout
        ? `${msg} — Outbound SMTP is often blocked on Render; use RESEND_API_KEY + MAIL_FROM (HTTPS) instead.`
        : `Gmail send failed: ${msg}`,
    };
  }
}

export async function verifyGmailSmtpConnection(): Promise<{ ok: boolean; error?: string }> {
  const user = process.env.GMAIL_USER?.trim();
  const pass = (process.env.GMAIL_APP_PASSWORD ?? '').replace(/\s/g, '');
  if (!user || !pass) {
    return { ok: false, error: 'GMAIL_USER or GMAIL_APP_PASSWORD missing' };
  }
  const common = {
    host: 'smtp.gmail.com' as const,
    auth: { user, pass },
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

export function verifyResendEnvPresent(): { resendKeySet: boolean; mailFromSet: boolean } {
  return {
    resendKeySet: !!process.env.RESEND_API_KEY?.trim(),
    mailFromSet: !!process.env.MAIL_FROM?.trim(),
  };
}
