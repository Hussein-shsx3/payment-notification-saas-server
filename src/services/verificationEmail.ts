import nodemailer from 'nodemailer';

export type VerificationEmailResult = {
  sent: boolean;
  channel?: 'resend' | 'gmail';
  /** Short hint for logs / optional client messaging when sent is false */
  detail?: string;
};

/**
 * Sends verification email: tries Resend first if RESEND_API_KEY + MAIL_FROM are set,
 * then Gmail (GMAIL_USER + GMAIL_APP_PASSWORD) if Resend fails or is not configured.
 * If nothing is configured, logs the link only.
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

  const sendGmail = async (): Promise<boolean> => {
    const user = process.env.GMAIL_USER?.trim();
    const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, '');
    if (!user || !pass) {
      return false;
    }
    const from =
      process.env.MAIL_FROM?.trim() || `${appName} <${user}>`;
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
      return true;
    } catch (e) {
      console.error('[verification-email] Gmail SMTP error:', e);
      return false;
    }
  };

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const mailFrom = process.env.MAIL_FROM?.trim();

  if (apiKey && mailFrom) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: mailFrom,
          to: [toEmail],
          subject,
          text,
        }),
      });

      if (res.ok) {
        const j = (await res.json().catch(() => ({}))) as { id?: string };
        console.log('[verification-email] Resend ok, id:', j.id ?? 'n/a', 'to:', toEmail);
        return { sent: true, channel: 'resend' };
      }

      const errText = await res.text();
      console.error('[verification-email] Resend failed', res.status, errText);
      if (await sendGmail()) {
        return { sent: true, channel: 'gmail' };
      }
      return {
        sent: false,
        detail: `Resend error ${res.status}. Check API key, verified domain, and MAIL_FROM format.`,
      };
    } catch (e) {
      console.error('[verification-email] Resend request error:', e);
      if (await sendGmail()) {
        return { sent: true, channel: 'gmail' };
      }
      return { sent: false, detail: 'Could not reach Resend (network error).' };
    }
  }

  if (await sendGmail()) {
    return { sent: true, channel: 'gmail' };
  }

  console.warn(
    '[verification-email] NOT SENT — set RESEND_API_KEY + MAIL_FROM (Resend) and/or GMAIL_USER + GMAIL_APP_PASSWORD (Gmail)'
  );
  console.log('[verification-email] (dev) would send to:\n', toEmail, '\n', text);
  return {
    sent: false,
    detail: 'Email not configured on server (missing RESEND or Gmail env vars).',
  };
}
