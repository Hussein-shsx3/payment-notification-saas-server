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

/** "From" — `RESEND_FROM` preferred; `MAIL_FROM` allowed as alias. */
function resendFromAddress(): string | undefined {
  return process.env.RESEND_FROM?.trim() || process.env.MAIL_FROM?.trim();
}

/** Parse `Name <addr@domain.com>` or plain email. */
export function parseFromEmail(from: string): string {
  const m = from.trim().match(/<([^>]+)>/);
  if (m) return m[1].trim().toLowerCase();
  return from.trim().toLowerCase();
}

/**
 * Resend only sends from `onboarding@resend.dev` (testing) or a domain you verify in their dashboard.
 * You cannot use Gmail/Yahoo/etc. as the From address.
 */
export function resendFromProblem(fromEmail: string): string | null {
  const e = fromEmail.toLowerCase();
  if (e === 'onboarding@resend.dev') return null;
  if (e.endsWith('.resend.dev')) return null;

  const publicInbox = [
    'gmail.com',
    'googlemail.com',
    'yahoo.com',
    'outlook.com',
    'hotmail.com',
    'icloud.com',
    'live.com',
    'proton.me',
    'protonmail.com',
    'aol.com',
  ];
  const domain = e.split('@')[1];
  if (domain && publicInbox.includes(domain)) {
    return `From address ${fromEmail} cannot be used with Resend — use RESEND_FROM=onboarding@resend.dev or verify your own domain at resend.com (not Gmail/public inboxes).`;
  }
  return null;
}

export type ResendHealth = {
  resendApiKeySet: boolean;
  resendFromSet: boolean;
  fromEmail: string | null;
  /** Non-null means sending will fail until fixed */
  fromProblem: string | null;
  resendReady: boolean;
};

export function getResendHealth(): ResendHealth {
  const apiKey = !!process.env.RESEND_API_KEY?.trim();
  const raw = resendFromAddress();

  if (!apiKey) {
    return {
      resendApiKeySet: false,
      resendFromSet: !!raw,
      fromEmail: raw ? parseFromEmail(raw) : null,
      fromProblem: 'Set RESEND_API_KEY',
      resendReady: false,
    };
  }
  if (!raw) {
    return {
      resendApiKeySet: true,
      resendFromSet: false,
      fromEmail: null,
      fromProblem: 'Set RESEND_FROM (e.g. onboarding@resend.dev)',
      resendReady: false,
    };
  }

  const fromEmail = parseFromEmail(raw);
  const domainProblem = resendFromProblem(fromEmail);
  const resendReady = !domainProblem;
  return {
    resendApiKeySet: true,
    resendFromSet: true,
    fromEmail,
    fromProblem: domainProblem,
    resendReady,
  };
}

export function isResendConfigured(): boolean {
  return getResendHealth().resendReady;
}

function parseResendErrorBody(text: string): string {
  try {
    const j = JSON.parse(text) as { message?: string; name?: string };
    if (j.message) return j.message;
  } catch {
    /* ignore */
  }
  return text.slice(0, 500);
}

/**
 * Sends verification email via [Resend](https://resend.com).
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
    return {
      sent: false,
      detail: 'Set RESEND_API_KEY and RESEND_FROM (see https://resend.com)',
    };
  }

  const fromEmail = parseFromEmail(from);
  const problem = resendFromProblem(fromEmail);
  if (problem) {
    console.error('[mail]', problem);
    return { sent: false, detail: problem };
  }

  console.log('[mail] Resend →', toEmail, 'from', fromEmail);

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
  const parsed = parseResendErrorBody(errText);
  console.error('[mail] Resend HTTP', res.status, parsed);
  return {
    sent: false,
    detail: `Resend ${res.status}: ${parsed}`,
  };
}
