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

/** Sender must match a verified sender in Brevo (SMTP & API). */
function getBrevoSender(): { name: string; email: string } | null {
  const emailDirect = process.env.BREVO_SENDER_EMAIL?.trim();
  const nameDefault = process.env.BREVO_SENDER_NAME?.trim() || process.env.APP_NAME?.trim() || 'App';
  const combined = process.env.BREVO_FROM?.trim() || process.env.MAIL_FROM?.trim();

  if (emailDirect) {
    return { name: nameDefault, email: emailDirect };
  }
  if (combined) {
    const angle = combined.match(/^(.+?)\s*<([^>]+)>$/);
    if (angle) {
      return { name: angle[1].trim(), email: angle[2].trim() };
    }
    if (combined.includes('@')) {
      return { name: nameDefault, email: combined };
    }
  }
  return null;
}

export type BrevoEmailHealth = {
  brevoApiKeySet: boolean;
  senderConfigured: boolean;
  senderEmail: string | null;
  problem: string | null;
  ready: boolean;
};

export function getBrevoEmailHealth(): BrevoEmailHealth {
  const apiKey = !!process.env.BREVO_API_KEY?.trim();
  const sender = getBrevoSender();

  if (!apiKey) {
    return {
      brevoApiKeySet: false,
      senderConfigured: !!sender,
      senderEmail: sender?.email ?? null,
      problem: 'Set BREVO_API_KEY (Brevo → SMTP & API → API keys)',
      ready: false,
    };
  }
  if (!sender) {
    return {
      brevoApiKeySet: true,
      senderConfigured: false,
      senderEmail: null,
      problem: 'Set BREVO_SENDER_EMAIL or BREVO_FROM / MAIL_FROM (verified sender in Brevo)',
      ready: false,
    };
  }

  return {
    brevoApiKeySet: true,
    senderConfigured: true,
    senderEmail: sender.email,
    problem: null,
    ready: true,
  };
}

function parseBrevoError(text: string): string {
  try {
    const j = JSON.parse(text) as { message?: string };
    if (j.message) return j.message;
  } catch {
    /* ignore */
  }
  return text.slice(0, 500);
}

/**
 * Sends verification email via [Brevo](https://www.brevo.com) transactional API.
 * @see https://developers.brevo.com/reference/sendtransacemail
 */
export async function sendVerificationEmail(
  toEmail: string,
  token: string
): Promise<VerificationEmailResult> {
  const { subject, text } = buildMail(token);
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const sender = getBrevoSender();

  if (!apiKey || !sender) {
    console.warn('[mail] Brevo not configured — set BREVO_API_KEY and BREVO_SENDER_EMAIL (or BREVO_FROM)');
    return {
      sent: false,
      detail: 'Set BREVO_API_KEY and sender (see https://www.brevo.com)',
    };
  }

  console.log('[mail] Brevo →', toEmail, 'from', sender.email);

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
      sender: { name: sender.name, email: sender.email },
      to: [{ email: toEmail }],
      subject,
      textContent: text,
    }),
  });

  if (res.ok) {
    const j = (await res.json().catch(() => ({}))) as { messageId?: string };
    console.log('[mail] Brevo ok messageId=', j.messageId ?? 'n/a');
    return { sent: true };
  }

  const errText = await res.text();
  const parsed = parseBrevoError(errText);
  console.error('[mail] Brevo HTTP', res.status, parsed);
  return {
    sent: false,
    detail: `Brevo ${res.status}: ${parsed}`,
  };
}
