/**
 * Minimum strength: length ≥8, at least one letter, one digit, one special character.
 * Example: example2026$
 */
export function getPasswordPolicyMessage(password: string): string | undefined {
  if (typeof password !== 'string') {
    return 'Password must be at least 8 characters and include a letter, a number, and a special character';
  }
  if (password.length < 8) {
    return 'Password must be at least 8 characters';
  }
  if (!/[a-zA-Z]/.test(password)) {
    return 'Password must include at least one letter';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must include at least one number';
  }
  if (!/[^a-zA-Z0-9]/.test(password)) {
    return 'Password must include at least one special character (e.g. ! @ # $)';
  }
  return undefined;
}
