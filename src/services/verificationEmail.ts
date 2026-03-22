export type VerificationEmailResult = {
  sent: boolean;
  detail?: string;
};

function buildMail(token: string): { subject: string; text: string } {
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
  return { subject, text };
}

/** "From" address — `RESEND_FROM` preferred; `MAIL_FROM` allowed as alias. */
function resendFromAddress(): string | undefined {
  return process.env.RESEND_FROM?.trim() || process.env.MAIL_FROM?.trim();
}

export function isResendConfigured(): boolean {
  const k = process.env.RESEND_API_KEY?.trim();
  return !!k && !!resendFromAddress();
}

/**
 * Sends verification email via [Resend](https://resend.com) (HTTPS).
 * Set `RESEND_API_KEY` and `RESEND_FROM` (or `MAIL_FROM`).
 */
export async function sendVerificationEmail(
  toEmail: string,
  token: string
): Promise<VerificationEmailResult> {
  const { subject, text } = buildMail(token);
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = resendFromAddress();

  if (!apiKey || !from) {
    console.warn('[mail] Resend not configured — set RESEND_API_KEY and RESEND_FROM');
    console.log('[mail] (not sent) preview to', toEmail);
    return {
      sent: false,
      detail: 'Set RESEND_API_KEY and RESEND_FROM (see https://resend.com)',
    };
  }

  console.log('[mail] Resend →', toEmail);

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
    console.log('[mail] Resend ok id=', j.id ?? 'n/a');
    return { sent: true };
  }

  const errText = await res.text();
  console.error('[mail] Resend error', res.status, errText.slice(0, 500));
  return {
    sent: false,
    detail: `Resend ${res.status}: ${errText.slice(0, 400)}`,
  };
}
