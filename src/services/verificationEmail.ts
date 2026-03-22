import { config } from '../config';

export type VerificationEmailResult = {
  sent: boolean;
  detail?: string;
};

/** Matches client: slate-950 bg, cyan-500 accent */
const C = {
  bg: '#020617',
  panel: '#0f172a',
  border: '#1e293b',
  accent: '#06b6d4',
  accentDark: '#0891b2',
  text: '#f1f5f9',
  muted: '#94a3b8',
} as const;

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Site origin only — strip trailing `/app` so we do not build `/app/app/verify-email`. */
function normalizeFrontendBase(raw: string): string {
  let u = raw.trim().replace(/\/+$/, '');
  if (u.endsWith('/app')) {
    u = u.slice(0, -4);
    u = u.replace(/\/+$/, '');
  }
  return u;
}

function buildVerificationBodies(
  toEmail: string,
  code: string,
  locale: 'en' | 'ar'
): { subject: string; textContent: string; htmlContent: string } {
  const apiBase = (process.env.API_PUBLIC_URL || 'http://localhost:5000/api').replace(/\/$/, '');
  const verifyApiUrl = `${apiBase}/auth/verify-email?code=${encodeURIComponent(code)}`;
  const webBase = normalizeFrontendBase(process.env.FRONTEND_URL || config.urls.frontend);
  const verifyWebUrl = `${webBase}/app/verify-email?email=${encodeURIComponent(toEmail)}`;
  const appName = process.env.APP_NAME || 'Payment Notify';

  const en = {
    subject: `${appName} — verify your email`,
    title: 'Verify your email',
    lead: `Your code is valid for 24 hours. Use it in the mobile app or on the website to finish signing up for ${appName}.`,
    steps: [
      'Open the Payment Notify app and enter the 6-digit code below.',
      `Or open the verification page in your browser: ${verifyWebUrl}`,
      'You can request a new code on that page if this one expires.',
    ],
    altWeb: 'Verify on the website (enter code or resend):',
    altApi: 'Direct API link (opens JSON):',
    footer: 'If you did not create an account, you can ignore this message.',
  };

  const ar = {
    subject: `${appName} — تأكيد بريدك الإلكتروني`,
    title: 'تأكيد بريدك الإلكتروني',
    lead: `الرمز صالح لمدة 24 ساعة. استخدمه في التطبيق أو على الموقع لإكمال التسجيل في ${appName}.`,
    steps: [
      'افتح تطبيق Payment Notify وأدخل الرمز المكوّن من 6 أرقام أدناه.',
      `أو افتح صفحة التحقق في المتصفح: ${verifyWebUrl}`,
      'يمكنك طلب رمز جديد من الصفحة إذا انتهت صلاحية هذا الرمز.',
    ],
    altWeb: 'التحقق عبر الموقع (إدخال الرمز أو إعادة الإرسال):',
    altApi: 'رابط مباشر للـ API:',
    footer: 'إذا لم تنشئ حساباً، يمكنك تجاهل هذه الرسالة.',
  };

  const L = locale === 'ar' ? ar : en;
  const stepsHtml = en.steps
    .map((s) => `<li style="margin:0 0 8px 0;color:${C.text};">${esc(s)}</li>`)
    .join('');
  const stepsArHtml = ar.steps
    .map((s) => `<li style="margin:0 0 8px 0;color:${C.text};direction:rtl;text-align:right;">${esc(s)}</li>`)
    .join('');

  const codeDisplay = `<div style="font-size:34px;font-weight:700;letter-spacing:10px;color:${C.accent};font-family:ui-monospace,Consolas,monospace;padding:20px 12px;text-align:center;background:${C.bg};border-radius:8px;border:1px solid ${C.border};">${esc(code)}</div>`;

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:${C.bg};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${C.bg};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background:${C.panel};border:1px solid ${C.border};border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:20px 24px;border-bottom:1px solid ${C.border};">
              <div style="font-size:18px;font-weight:600;color:${C.accent};">${esc(appName)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <p style="color:${C.muted};font-size:14px;line-height:1.5;margin:0 0 12px 0;">${esc(en.lead)}</p>
              <p style="color:${C.muted};font-size:14px;line-height:1.6;margin:0 0 16px 0;direction:rtl;text-align:right;">${esc(ar.lead)}</p>
              ${codeDisplay}
              <p style="color:${C.text};font-size:15px;font-weight:600;margin:20px 0 8px 0;">English</p>
              <ol style="margin:0;padding-left:20px;font-size:14px;line-height:1.45;">${stepsHtml}</ol>
              <p style="color:${C.muted};font-size:13px;margin:16px 0 8px 0;">${esc(en.altWeb)}</p>
              <a href="${esc(verifyWebUrl)}" style="display:inline-block;margin:12px 0;padding:12px 20px;background:${C.accent};color:#020617;font-weight:600;border-radius:8px;text-decoration:none;font-size:14px;">Open verification page</a>
              <p style="color:${C.muted};font-size:12px;margin:16px 0 8px 0;">${esc(en.altApi)}</p>
              <a href="${esc(verifyApiUrl)}" style="color:${C.accent};word-break:break-all;font-size:12px;">${esc(verifyApiUrl)}</a>
              <p style="color:${C.text};font-size:15px;font-weight:600;margin:24px 0 8px 0;direction:rtl;text-align:right;">العربية</p>
              <ol style="margin:0;padding-right:20px;font-size:14px;line-height:1.45;direction:rtl;">${stepsArHtml}</ol>
              <p style="color:${C.muted};font-size:13px;margin:16px 0 8px 0;direction:rtl;text-align:right;">${esc(ar.altWeb)}</p>
              <div style="text-align:center;margin:12px 0;"><a href="${esc(verifyWebUrl)}" style="display:inline-block;padding:12px 20px;background:${C.accent};color:#020617;font-weight:600;border-radius:8px;text-decoration:none;font-size:14px;">فتح صفحة التحقق</a></div>
              <p style="color:${C.muted};font-size:12px;margin:16px 0 8px 0;direction:rtl;text-align:right;">${esc(ar.altApi)}</p>
              <div style="direction:rtl;text-align:right;"><a href="${esc(verifyApiUrl)}" style="color:${C.accent};word-break:break-all;font-size:12px;">${esc(verifyApiUrl)}</a></div>
              <p style="color:${C.muted};font-size:12px;margin:24px 0 0 0;line-height:1.5;">${esc(en.footer)}</p>
              <p style="color:${C.muted};font-size:12px;margin:8px 0 0 0;line-height:1.5;direction:rtl;text-align:right;">${esc(ar.footer)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textEn = `${en.title}\n\n${en.lead}\n\nCode: ${code}\n\n${en.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n${en.altWeb}\n${verifyWebUrl}\n\n${en.altApi}\n${verifyApiUrl}\n\n${en.footer}`;
  const textAr = `${ar.title}\n\n${ar.lead}\n\nالرمز: ${code}\n\n${ar.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n${ar.altWeb}\n${verifyWebUrl}\n\n${ar.altApi}\n${verifyApiUrl}\n\n${ar.footer}`;
  const textContent = locale === 'ar' ? `${textAr}\n\n---\n\n${textEn}` : `${textEn}\n\n---\n\n${textAr}`;

  return {
    subject: L.subject,
    textContent,
    htmlContent,
  };
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

function brevoApiKey(): string | undefined {
  return process.env.BREVO_API_KEY?.trim() || process.env.SENDINBLUE_API_KEY?.trim();
}

export function getBrevoEmailHealth(): BrevoEmailHealth {
  const apiKey = !!brevoApiKey();
  const sender = getBrevoSender();

  if (!apiKey) {
    return {
      brevoApiKeySet: false,
      senderConfigured: !!sender,
      senderEmail: sender?.email ?? null,
      problem: 'Set BREVO_API_KEY or SENDINBLUE_API_KEY (Brevo → SMTP & API → API keys)',
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
 * Sends verification email via Brevo. `locale` picks primary subject line; body is bilingual (EN + AR).
 */
export async function sendVerificationEmail(
  toEmail: string,
  code: string,
  locale: 'en' | 'ar' = 'en'
): Promise<VerificationEmailResult> {
  const { subject, textContent, htmlContent } = buildVerificationBodies(toEmail, code, locale);
  const apiKey = brevoApiKey();
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
      textContent,
      htmlContent,
    }),
  });

  if (res.ok) {
    const j = (await res.json().catch(() => ({}))) as { messageId?: string };
    console.log('[mail] Brevo ok messageId=', j.messageId ?? 'n/a');
    return { sent: true };
  }

  const errText = await res.text();
  const parsed = parseBrevoError(errText);
  console.error('[mail] Brevo HTTP', res.status, parsed, '| raw:', errText.slice(0, 300));
  const hint =
    res.status === 401 || res.status === 403
      ? ' Check API key and that the key has permission to send emails.'
      : /sender|not valid|unverified|domain/i.test(parsed + errText)
        ? ' Verify BREVO_SENDER_EMAIL (or domain) under Brevo → Senders & IP.'
        : '';
  return {
    sent: false,
    detail: `Brevo ${res.status}: ${parsed}${hint}`,
  };
}
