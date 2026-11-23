// Edge Function: verificação de e-mail no cadastro do cliente.
// Gera/valida um código de 6 dígitos (guardado como HASH), envia por e-mail via
// Brevo e cria a conta como PENDENTE até a confirmação.
//
// Deploy:
//   supabase functions deploy signup-code --project-ref <ref>
// Secrets:
//   BREVO_API_KEY e BREVO_FROM_EMAIL em Edge Functions → Secrets.
//
// O Supabase injeta a URL e as chaves no ambiente da função.
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function apiKeys(variable: 'SUPABASE_PUBLISHABLE_KEYS' | 'SUPABASE_SECRET_KEYS'): Record<string, string> {
  const raw = Deno.env.get(variable);
  if (!raw) return {};

  try {
    return JSON.parse(raw) ?? {};
  } catch {
    throw new Error(`Configuração inválida para ${variable}.`);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function gen6(): string {
  const [random] = crypto.getRandomValues(new Uint32Array(1));
  return String(random % 1_000_000).padStart(6, '0');
}

async function hash(email: string, code: string): Promise<string> {
  const data = new TextEncoder().encode(`${email.toLowerCase()}:${code}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sendEmail(to: string, code: string): Promise<void> {
  const apiKey = Deno.env.get('BREVO_API_KEY')?.trim();
  const from = Deno.env.get('BREVO_FROM_EMAIL')?.trim();
  if (!apiKey || !from || !EMAIL_RE.test(from)) {
    console.error('Chave ou remetente do Brevo ausente ou inválido.');
    throw new Error('Envio de e-mail indisponível no momento.');
  }
  const html = `
    <div style="font-family:system-ui,Arial,sans-serif;max-width:420px;margin:auto;padding:24px;background:#141210;border-radius:16px;color:#f4ede2">
      <h1 style="font-size:20px;margin:0 0 4px">Seu Paulo Buteco</h1>
      <p style="color:#b8ab99;margin:0 0 20px">Confirme seu e-mail para criar sua conta.</p>
      <p style="margin:0 0 8px;color:#b8ab99">Seu código de verificação:</p>
      <div style="font-size:34px;letter-spacing:10px;font-weight:800;color:#e0b464;background:#211d18;border-radius:12px;padding:16px;text-align:center">${code}</div>
      <p style="color:#b8ab99;margin:20px 0 0;font-size:13px">Válido por 5 minutos. Se você não pediu, ignore este e-mail.</p>
    </div>`;
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { email: from, name: 'Seu Paulo Delivery' },
      to: [{ email: to }],
      subject: `Seu código Seu Paulo: ${code}`,
      htmlContent: html,
    }),
  });
  if (!res.ok) {
    console.error('Brevo recusou o envio', res.status);
    throw new Error('Não foi possível enviar o e-mail agora. Tente novamente.');
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    // O cadastro começa antes de o cliente ter um token de sessão.
    const callerKey = req.headers.get('apikey');
    const legacyAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!callerKey || (callerKey !== legacyAnonKey &&
      !Object.values(apiKeys('SUPABASE_PUBLISHABLE_KEYS')).includes(callerKey))) {
      return json({ error: 'Chave pública do Supabase inválida.' }, 401);
    }

    const url = Deno.env.get('SUPABASE_URL');
    const secretKey = apiKeys('SUPABASE_SECRET_KEYS').default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !secretKey) {
      console.error('Credenciais administrativas do Supabase ausentes.');
      return json({ error: 'Serviço de cadastro indisponível.' }, 500);
    }
    const admin = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json();
    const action = String(body.action ?? '');
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return json({ error: 'E-mail inválido.' });

    /* ------------------------------ REQUEST ------------------------------ */
    if (action === 'request') {
      const password = String(body.password ?? '');
      const fullName = String(body.fullName ?? '').trim();
      const phone = String(body.phone ?? '').trim();
      if (password.length < 6) return json({ error: 'A senha precisa de ao menos 6 caracteres.' });

      const { data: status, error: lookupError } = await admin.rpc('auth_user_status', { p_email: email });
      if (lookupError) {
        console.error('Erro ao consultar conta', lookupError.code);
        return json({ error: 'Serviço de cadastro indisponível.' }, 503);
      }
      const existing = Array.isArray(status) ? status[0] : status;
      if (existing?.id) {
        return json({ error: 'Já existe uma conta com este e-mail.' });
      }

      const code = gen6();
      // Se o provedor rejeitar o envio, o cliente pode tentar de novo sem conta pendente.
      await sendEmail(email, code);
      const { data: created, error: creationError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: false,
        user_metadata: { full_name: fullName, phone, role: 'customer' },
      });
      if (creationError?.code === 'email_exists' || creationError?.code === 'user_already_exists') {
        return json({ error: 'Já existe uma conta com este e-mail.' });
      }
      if (creationError || !created?.user) {
        return json({ error: 'Não foi possível iniciar o cadastro. Tente novamente.' });
      }

      const userId = created.user.id;
      const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
      const { error: upErr } = await admin.from('signup_verifications').upsert({
        email,
        attempt_id: crypto.randomUUID(),
        code_hash: await hash(email, code),
        user_id: userId,
        created_at: new Date().toISOString(),
        expires_at: expiresAt,
        consumed: false,
        attempts: 0,
      });
      if (upErr) {
        const { error: cleanupError } = await admin.auth.admin.deleteUser(userId);
        if (cleanupError) console.error('Erro ao desfazer cadastro incompleto', cleanupError.code);
        return json({ error: 'Falha ao registrar o código. Tente novamente.' });
      }
      return json({ ok: true, expiresAt });
    }

    /* ------------------------------ RESEND ------------------------------- */
    if (action === 'resend') {
      const { data: row } = await admin
        .from('signup_verifications')
        .select('attempt_id, user_id, created_at, consumed')
        .eq('email', email)
        .maybeSingle();
      if (!row?.user_id || row.consumed) {
        return json({ error: 'Cadastro pendente não encontrado.' });
      }
      if (Date.now() - new Date(row.created_at).getTime() < RESEND_COOLDOWN_MS) {
        return json({ error: 'Aguarde um minuto antes de pedir outro código.' });
      }

      const code = gen6();
      const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
      const { data: replacement, error: resendError } = await admin
        .from('signup_verifications')
        .update({
          attempt_id: crypto.randomUUID(),
          code_hash: await hash(email, code),
          created_at: new Date().toISOString(),
          expires_at: expiresAt,
          consumed: false,
          attempts: 0,
        })
        .eq('email', email)
        .eq('attempt_id', row.attempt_id)
        .eq('consumed', false)
        .select('attempt_id')
        .maybeSingle();
      if (resendError || !replacement) {
        return json({ error: 'Não foi possível gerar outro código. Tente novamente.' });
      }

      await sendEmail(email, code);
      return json({ ok: true, expiresAt });
    }

    /* ------------------------------ VERIFY ------------------------------- */
    if (action === 'verify') {
      const code = String(body.code ?? '').replace(/\D/g, '');
      const { data: row } = await admin
        .from('signup_verifications')
        .select('*')
        .eq('email', email)
        .maybeSingle();
      if (!row?.user_id || row.consumed || new Date(row.expires_at).getTime() < Date.now()) {
        return json({ error: 'Este código expirou. Solicite um novo código para continuar.' });
      }
      if (row.attempts >= MAX_ATTEMPTS) {
        return json({ error: 'Limite de tentativas atingido. Solicite um novo código.' });
      }
      const ok = /^\d{6}$/.test(code) && (await hash(email, code)) === row.code_hash;
      // Só a versão lida do código pode gastar uma tentativa ou confirmar a conta.
      const { data: claim, error: claimError } = await admin
        .from('signup_verifications')
        .update({ attempts: row.attempts + 1, consumed: ok })
        .eq('email', email)
        .eq('attempt_id', row.attempt_id)
        .eq('attempts', row.attempts)
        .eq('consumed', false)
        .gt('expires_at', new Date().toISOString())
        .select('attempt_id')
        .maybeSingle();
      if (claimError || !claim) {
        return json({ error: 'Não foi possível validar este código. Tente novamente.' });
      }
      if (!ok) {
        return json({
          error: 'Código incorreto. Verifique o código enviado para seu e-mail e tente novamente.',
        });
      }
      const { error: confirmationError } = await admin.auth.admin.updateUserById(row.user_id, { email_confirm: true });
      if (confirmationError) {
        await admin.from('signup_verifications').update({ consumed: false })
          .eq('email', email).eq('attempt_id', row.attempt_id);
        return json({ error: 'Não foi possível confirmar a conta. Tente novamente.' });
      }
      return json({ ok: true });
    }

    return json({ error: 'Ação inválida.' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? 'Erro inesperado.' }, 500);
  }
});
