/** Validadores de formulário com mensagens claras em pt-BR. */

export function validateEmail(email: string): string | null {
  const v = email.trim();
  if (!v) return 'Informe seu e-mail.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'E-mail inválido.';
  return null;
}

export function validateFullName(name: string): string | null {
  const v = name.trim();
  if (!v) return 'Informe seu nome completo.';
  if (v.length < 3) return 'Nome muito curto.';
  if (!v.includes(' ')) return 'Informe nome e sobrenome.';
  return null;
}

/** Aceita telefone com 10 (fixo) ou 11 (celular) dígitos. */
export function validatePhone(phone: string): string | null {
  const d = phone.replace(/\D/g, '');
  if (!d) return 'Informe seu telefone.';
  if (d.length < 10 || d.length > 11) return 'Telefone inválido. Use DDD + número.';
  return null;
}

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  checks: { length: boolean; upper: boolean; number: boolean; special: boolean };
}

export function passwordStrength(pw: string): PasswordStrength {
  const checks = {
    length: pw.length >= 8,
    upper: /[A-Z]/.test(pw),
    number: /\d/.test(pw),
    special: /[^A-Za-z0-9]/.test(pw),
  };
  const score = Object.values(checks).filter(Boolean).length as PasswordStrength['score'];
  const label = ['Muito fraca', 'Fraca', 'Razoável', 'Boa', 'Forte'][score];
  return { score, label, checks };
}

export function validatePassword(pw: string): string | null {
  if (!pw) return 'Crie uma senha.';
  if (pw.length < 8) return 'A senha precisa de ao menos 8 caracteres.';
  const { checks } = passwordStrength(pw);
  if (!checks.upper || !checks.number) {
    return 'Use ao menos uma letra maiúscula e um número.';
  }
  return null;
}

export function validateRequired(value: string, field: string): string | null {
  return value.trim() ? null : `${field} é obrigatório.`;
}

export function validatePlate(plate: string): string | null {
  const v = plate.toUpperCase().replace(/\s|-/g, '');
  if (!v) return 'Informe a placa.';
  // Aceita padrão antigo (AAA9999) e Mercosul (AAA9A99).
  if (!/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(v)) return 'Placa inválida.';
  return null;
}
