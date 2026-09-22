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
    length: pw.length >= 6,
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
  // Regra simples e acessível: mínimo de 6 caracteres (igual ao Supabase).
  // Maiúscula/número/símbolo são apenas SUGESTÕES para deixar mais forte.
  if (pw.length < 6) return 'A senha precisa de ao menos 6 caracteres.';
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

/** Valida CPF por formato e dígitos verificadores. */
export function validateCPF(cpf: string): string | null {
  const d = cpf.replace(/\D/g, '');
  if (!d) return 'Informe seu CPF.';
  if (d.length !== 11) return 'CPF deve ter 11 dígitos.';
  if (/^(\d)\1{10}$/.test(d)) return 'CPF inválido.';
  const digit = (slice: string, factorStart: number) => {
    let sum = 0;
    for (let i = 0; i < slice.length; i++) sum += Number(slice[i]) * (factorStart - i);
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  if (digit(d.slice(0, 9), 10) !== Number(d[9])) return 'CPF inválido.';
  if (digit(d.slice(0, 10), 11) !== Number(d[10])) return 'CPF inválido.';
  return null;
}

export function validateRG(rg: string): string | null {
  const v = rg.replace(/[.\-\s]/g, '');
  if (!v) return 'Informe seu RG.';
  if (v.length < 5) return 'RG inválido.';
  return null;
}

export function validateCEP(cep: string): string | null {
  const d = cep.replace(/\D/g, '');
  if (!d) return 'Informe o CEP.';
  if (d.length !== 8) return 'CEP deve ter 8 dígitos.';
  return null;
}

/** Aceita data no formato DD/MM/AAAA; exige maioridade (18+). */
export function validateBirthDate(value: string): string | null {
  const d = value.replace(/\D/g, '');
  if (!d) return 'Informe sua data de nascimento.';
  if (d.length !== 8) return 'Data inválida. Use DD/MM/AAAA.';
  const day = Number(d.slice(0, 2));
  const month = Number(d.slice(2, 4));
  const year = Number(d.slice(4, 8));
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return 'Data inválida.';
  }
  const age = (Date.now() - date.getTime()) / (365.25 * 24 * 3600 * 1000);
  if (age < 18) return 'É preciso ter 18 anos ou mais.';
  if (age > 100) return 'Data inválida.';
  return null;
}

export function validateCnhNumber(value: string): string | null {
  const d = value.replace(/\D/g, '');
  if (!d) return 'Informe o número da CNH.';
  if (d.length !== 11) return 'A CNH deve ter 11 dígitos.';
  return null;
}

/** Categoria precisa habilitar motocicleta (A, AB, AC, AD, AE). */
export function validateMotoCategory(category: string): string | null {
  const v = category.trim().toUpperCase();
  if (!v) return 'Informe a categoria.';
  if (!/^A/.test(v)) return 'Categoria precisa habilitar moto (A, AB…).';
  return null;
}

/** Espera DD/MM/AAAA; a CNH precisa estar dentro da validade. */
export function validateCnhExpiry(value: string): string | null {
  const d = value.replace(/\D/g, '');
  if (!d) return 'Informe a validade da CNH.';
  if (d.length !== 8) return 'Data inválida. Use DD/MM/AAAA.';
  const day = Number(d.slice(0, 2));
  const month = Number(d.slice(2, 4));
  const year = Number(d.slice(4, 8));
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return 'Data inválida.';
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date < today) return 'CNH vencida.';
  return null;
}

export function validateRenavam(value: string): string | null {
  const d = value.replace(/\D/g, '');
  if (!d) return null; // opcional
  if (d.length < 9 || d.length > 11) return 'RENAVAM inválido.';
  return null;
}

export function validateYear(value: string): string | null {
  const d = value.replace(/\D/g, '');
  if (!d) return 'Informe o ano.';
  const y = Number(d);
  const now = new Date().getFullYear();
  if (y < 1970 || y > now + 1) return 'Ano inválido.';
  return null;
}
