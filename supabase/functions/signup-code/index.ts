// Edge Function: verificação de e-mail no cadastro do cliente.
// Gera/valida um código de 6 dígitos (guardado como HASH), envia por e-mail via
// Resend e cria a conta como PENDENTE até a confirmação. Roda com service role.
//
// Deploy:
//   supabase functions deploy signup-code --project-ref <ref>
// Secrets:
//   supabase secrets set RESEND_API_KEY=... RESEND_FROM="Seu Paulo <no-reply@seudominio.com>"
//
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetados automaticamente.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TTL_MS = 5 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function gen6(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function hash(email: string, code: string): Promise<string> {
  const data = new TextEncoder().encode(`${email.toLowerCase()}:${code}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sendEmail(to: string, code: string): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('RESEND_FROM') ?? 'Seu Paulo <onboarding@resend.dev>';
  if (!apiKey) throw new Error('RESEND_API_KEY não configurada.');
  const html = `
    <div style="font-family:system-ui,Arial,sans-serif;max-width:420px;margin:auto;padding:24px;background:#141210;border-radius:16px;color:#f4ede2">
      <h1 style="font-size:20px;margin:0 0 4px">Seu Paulo Buteco</h1>
      <p style="color:#b8ab99;margin:0 0 20px">Confirme seu e-mail para criar sua conta.</p>
      <p style="margin:0 0 8px;color:#b8ab99">Seu código de verificação:</p>
      <div style="font-size:34px;letter-spacing:10px;font-weight:800;color:#e0b464;background:#211d18;border-radius:12px;padding:16px;text-align:center">${code}</div>
      <p style="color:#b8ab99;margin:20px 0 0;font-size:13px">Válido por 5 minutos. Se você não pediu, ignore este e-mail.</p>
    </div>`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject: `Seu código Seu Paulo: ${code}`, html }),
  });
  if (!res.ok) {
    const detail = await res.text();
    console.error('Resend error', res.status, detail);
    throw new Error('Não foi possível enviar o e-mail agora. Tente novamente.');
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  try {
    const body = await req.json();
    const action = String(body.action ?? '');
    const email = String(body.email ?? '').trim();
    if (!EMAIL_RE.test(email)) return json({ error: 'E-mail inválido.' });

    /* ------------------------------ REQUEST ------------------------------ */
    if (action === 'request') {
      const password = String(body.password ?? '');
      const fullName = String(body.fullName ?? '').trim();
      const phone = String(body.phone ?? '').trim();
      if (password.length < 6) return json({ error: 'A senha precisa de ao menos 6 caracteres.' });

      const { data: status } = await admin.rpc('auth_user_status', { p_email: email });
      const existing = Array.isArray(status) ? status[0] : status;
      if (existing?.confirmed) {
        return json({ error: 'Já existe uma conta com este e-mail.' });
      }

      let userId: string;
      const meta = { full_name: fullName, phone, role: 'customer' };
      if (existing?.id) {
        // Cadastro pendente reaproveitado: atualiza senha/dados.
        await admin.auth.admin.updateUserById(existing.id, { password, user_metadata: meta });
        userId = existing.id;
      } else {
        const { data: created, error: cErr } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: false,
          user_metadata: meta,
        });
        if (cErr || !created?.user) {
          return json({ error: 'Não foi possível iniciar o cadastro. Tente novamente.' });
        }
        userId = created.user.id;
      }

      const code = gen6();
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
      if (upErr) return json({ error: 'Falha ao registrar o código. Tente novamente.' });

      await sendEmail(email, code);
      return json({ ok: true, expiresAt });
    }

    /* ------------------------------ RESEND ------------------------------- */
    if (action === 'resend') {
      const { data: row } = await admin
        .from('signup_verifications')
        .select('user_id')
        .eq('email', email)
        .maybeSingle();
      if (!row) return json({ error: 'Cadastro não encontrado. Comece o cadastro novamente.' });

      const code = gen6();
      const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
      await admin
        .from('signup_verifications')
        .update({
          attempt_id: crypto.randomUUID(),
          code_hash: await hash(email, code),
          created_at: new Date().toISOString(),
          expires_at: expiresAt,
          consumed: false,
          attempts: 0,
        })
        .eq('email', email);

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
      if (!row || row.consumed || new Date(row.expires_at).getTime() < Date.now()) {
        return json({ error: 'Este código expirou. Solicite um novo código para continuar.' });
      }
      const ok = (await hash(email, code)) === row.code_hash;
      if (!ok) {
        await admin
          .from('signup_verifications')
          .update({ attempts: (row.attempts ?? 0) + 1 })
          .eq('email', email);
        return json({
          error: 'Código incorreto. Verifique o código enviado para seu e-mail e tente novamente.',
        });
      }
      // Correto e no prazo: consome o código e confirma o e-mail (ativa a conta).
      await admin.from('signup_verifications').update({ consumed: true }).eq('email', email);
      if (row.user_id) {
        await admin.auth.admin.updateUserById(row.user_id, { email_confirm: true });
      }
      return json({ ok: true });
    }

    return json({ error: 'Ação inválida.' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? 'Erro inesperado.' }, 500);
  }
});
