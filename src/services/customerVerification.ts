const EMAIL_KEY = 'spd_verify_email';
const EXPIRY_KEY = 'spd_verify_exp';

export class CustomerVerificationRequired extends Error {
  constructor(readonly email: string, readonly expiresAt: string) {
    super('Confirme seu e-mail para entrar.');
  }
}

export function readCustomerVerification() {
  try {
    return {
      email: sessionStorage.getItem(EMAIL_KEY) ?? '',
      expiresAt: Number(sessionStorage.getItem(EXPIRY_KEY) ?? 0),
    };
  } catch {
    return { email: '', expiresAt: 0 };
  }
}

export function saveCustomerVerification(email: string, expiresAt: string) {
  try {
    sessionStorage.setItem(EMAIL_KEY, email.trim().toLowerCase());
    sessionStorage.setItem(EXPIRY_KEY, String(Date.parse(expiresAt)));
  } catch {
    /* ignore */
  }
}

export function clearCustomerVerification() {
  try {
    sessionStorage.removeItem(EMAIL_KEY);
    sessionStorage.removeItem(EXPIRY_KEY);
  } catch {
    /* ignore */
  }
}
