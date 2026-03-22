/**
 * Normalizes pasted verification input: 6-digit code, legacy 64-char hex token, or URL with ?code= / ?token=.
 */
export function normalizeVerificationInput(raw: string): string {
  const t = raw.trim();
  if (/^[a-f0-9]{64}$/i.test(t)) {
    return t.toLowerCase();
  }
  const digits = t.replace(/\D/g, '');
  if (digits.length === 6 && /^\d{6}$/.test(digits)) {
    return digits;
  }
  try {
    const u = new URL(t);
    const p = u.searchParams.get('code') || u.searchParams.get('token');
    if (p) {
      return normalizeVerificationInput(p);
    }
  } catch {
    /* not a URL */
  }
  return t;
}
