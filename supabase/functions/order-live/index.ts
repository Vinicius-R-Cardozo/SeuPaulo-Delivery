import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { importPKCS8, SignJWT } from 'npm:jose@5.10.0';
import { sendTransactionEmail, type EmailJob } from './transactionEmail.ts';

type Job = {
  platform: 'android' | 'ios' | 'ios-sandbox';
  state: { orderId: string; terminal: boolean; [key: string]: unknown };
  token: string; revision: number; lease: string;
};
type Alert = {
  platform: Job['platform']; token: string; title: string; body: string; route: string;
  event_id: string; expires_at: string; lease: string;
};
type Result = 'sent' | 'retry' | 'invalid';
const tokens = new Map<string, { value: string; until: number }>();
const inflight = new Map<string, Promise<string>>();

function env(key: string) {
  const value = Deno.env.get(key)?.trim();
  if (!value) throw new Error('Configuração ausente: ' + key);
  return value;
}

async function credential(provider: 'apple' | 'google') {
  const cached = tokens.get(provider);
  if (cached && cached.until > Date.now()) return cached.value;
  const existing = inflight.get(provider);
  if (existing) return existing;
  const fresh = issue(provider).then(value => {
    tokens.set(provider, { value, until: Date.now() + 45 * 60_000 });
    return value;
  }).finally(() => inflight.delete(provider));
  inflight.set(provider, fresh);
  return fresh;
}

async function issue(provider: 'apple' | 'google') {
  if (provider === 'apple') {
    const key = await importPKCS8(env('ORDER_APNS_PRIVATE_KEY').replaceAll('\\n','\n'), 'ES256');
    return new SignJWT({}).setProtectedHeader({ alg: 'ES256', kid: env('ORDER_APNS_KEY_ID') })
      .setIssuedAt().setIssuer(env('ORDER_APNS_TEAM_ID')).sign(key);
  }
  const service = JSON.parse(env('ORDER_FCM_SERVICE_ACCOUNT'));
  const key = await importPKCS8(service.private_key, 'RS256');
  const url = 'https://oauth2.googleapis.com/token';
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.messaging' })
    .setProtectedHeader({ alg: 'RS256' }).setIssuer(service.client_email)
    .setAudience(url).setIssuedAt().setExpirationTime('1h').sign(key);
  const response = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(10000),
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
  if (!response.ok) throw new Error('OAuth ' + response.status);
  return (await response.json()).access_token as string;
}

async function send(job: Job): Promise<Result> {
  const { token, state, revision } = job;
  if (job.platform === 'android') {
    const { project_id } = JSON.parse(env('ORDER_FCM_SERVICE_ACCOUNT'));
    const response = await fetch('https://fcm.googleapis.com/v1/projects/' + encodeURIComponent(project_id) + '/messages:send', {
      method: 'POST', signal: AbortSignal.timeout(12000),
      headers: { Authorization: 'Bearer ' + await credential('google'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { token, data: { orderLive: JSON.stringify({ ...state, revision }) },
        android: { priority: 'HIGH', ttl: state.terminal ? '86400s' : '300s', collapse_key: state.orderId } } }),
    });
    if (response.ok) return 'sent';
    const error = await response.json();
    if (response.status === 401) tokens.delete('google');
    return error.error?.details?.some((x: { errorCode?: string }) => x.errorCode === 'UNREGISTERED') ? 'invalid' : 'retry';
  }
  const server = job.platform === 'ios-sandbox' ? 'api.sandbox.push.apple.com' : 'api.push.apple.com';
  const now = Math.floor(Date.now()/1000);
  const response = await fetch('https://' + server + '/3/device/' + encodeURIComponent(token), {
    method: 'POST', signal: AbortSignal.timeout(12000),
    headers: { authorization: 'bearer ' + await credential('apple'), 'apns-push-type': 'liveactivity',
      'apns-topic': 'com.seupaulo.delivery.push-type.liveactivity', 'apns-priority': state.terminal || state.step === 6 ? '10' : '5',
      'apns-expiration': String(now + (state.terminal ? 86400 : 300)), 'apns-collapse-id': state.orderId },
    body: JSON.stringify({ aps: { timestamp: now, event: state.terminal ? 'end' : 'update',
      'content-state': { ...state, revision }, ...(state.terminal ? { 'dismissal-date': now } : {}) } }),
  });
  if (response.ok) return 'sent';
  const error = await response.json();
  if (error.reason === 'ExpiredProviderToken') tokens.delete('apple');
  return response.status === 410 || error.reason === 'BadDeviceToken' ? 'invalid' : 'retry';
}

async function sendAlert(job: Alert): Promise<Result> {
  const expires = Math.floor(Date.parse(job.expires_at) / 1000);
  const ttl = expires - Math.floor(Date.now() / 1000);
  if (ttl <= 0) return 'sent';
  const fields = { appPush: job.event_id, title: job.title, body: job.body, route: job.route };
  if (job.platform === 'android') {
    const { project_id } = JSON.parse(env('ORDER_FCM_SERVICE_ACCOUNT'));
    const response = await fetch('https://fcm.googleapis.com/v1/projects/' + encodeURIComponent(project_id) + '/messages:send', {
      method: 'POST', signal: AbortSignal.timeout(12000),
      headers: { Authorization: 'Bearer ' + await credential('google'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { token: job.token, data: fields, android: { priority: 'HIGH', ttl: ttl + 's' } } }),
    });
    if (response.ok) return 'sent';
    const error = await response.json();
    if (response.status === 401) tokens.delete('google');
    return error.error?.details?.some((detail: { errorCode?: string }) => detail.errorCode === 'UNREGISTERED') ? 'invalid' : 'retry';
  }
  const server = job.platform === 'ios-sandbox' ? 'api.sandbox.push.apple.com' : 'api.push.apple.com';
  const response = await fetch('https://' + server + '/3/device/' + encodeURIComponent(job.token), {
    method: 'POST', signal: AbortSignal.timeout(12000),
    headers: { authorization: 'bearer ' + await credential('apple'), 'apns-push-type': 'alert',
      'apns-topic': 'com.seupaulo.delivery', 'apns-priority': '10',
      'apns-expiration': String(expires), 'apns-collapse-id': job.event_id },
    body: JSON.stringify({ aps: { alert: { title: job.title, body: job.body }, sound: 'default' },
      appPush: job.event_id, route: job.route }),
  });
  if (response.ok) return 'sent';
  const error = await response.json();
  if (error.reason === 'ExpiredProviderToken') tokens.delete('apple');
  return response.status === 410 || error.reason === 'BadDeviceToken' ? 'invalid' : 'retry';
}

Deno.serve(async request => {
  const supplied = request.headers.get('x-order-live-secret') || '';
  const fingerprint = Deno.env.get('ORDER_LIVE_WORKER_SECRET_SHA256');
  const raw = Deno.env.get('ORDER_LIVE_WORKER_SECRET');
  if (request.method !== 'POST' || !supplied || supplied.length > 512)
    return new Response(null, { status: 403 });
  // Hosted deployments keep the raw credential in Vault and send it over TLS.
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(supplied));
  const hex = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
  if (fingerprint ? hex !== fingerprint : !raw || supplied !== raw)
    return new Response(null, { status: 403 });
  const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
  const db = createClient(env('SUPABASE_URL'), keys.default || Object.values(keys)[0] || env('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.rpc('claim_order_live');
  if (error) return new Response(null, { status: 503 });
  // A lease expires if this invocation fails before acknowledging a snapshot.
  const live = Promise.all((data as Job[]).map(async job => {
    let result: Result = 'retry';
    try { result = await send(job); } catch { /* transient transport/configuration failure */ }
    if (result === 'retry') console.warn('Envio pendente', job.platform);
    const ack = await db.rpc('finish_order_live', { p_lease: job.lease, p_revision: job.revision, p_result: result });
    return !ack.error && result !== 'retry';
  }));
  const alerts = db.rpc('claim_app_push').then(async ({ data: rows, error }) => {
    if (error) {
      console.error('Falha ao consultar fila de push', error.code);
      return [];
    }
    return Promise.all((rows as Alert[]).map(async job => {
      let result: Result = 'retry';
      try { result = await sendAlert(job); } catch { /* retry within the event expiry */ }
      if (result === 'retry') console.warn('Push pendente', job.platform);
      const ack = await db.rpc('finish_app_push', { p_lease: job.lease, p_result: result });
      return !ack.error && result !== 'retry';
    }));
  });
  const emails = db.rpc('claim_transaction_email').then(async ({ data: rows, error }) => {
    if (error) {
      console.error('Falha ao consultar fila de e-mail', error.code);
      return [];
    }
    return Promise.all((rows as EmailJob[]).map(async job => {
      let result: Result = 'retry';
      try { result = await sendTransactionEmail(job); } catch { /* retry without delaying checkout */ }
      if (result !== 'sent') console.warn('Resultado do e-mail', job.kind, result);
      const ack = await db.rpc('finish_transaction_email', { p_lease: job.lease, p_result: result });
      return !ack.error && result !== 'retry';
    }));
  });
  const [finished, appPush, email] = await Promise.all([live, alerts, emails]);
  return Response.json({ processed: finished.length, pending: finished.filter(ok => !ok).length,
    pushProcessed: appPush.length, pushPending: appPush.filter(ok => !ok).length,
    emailProcessed: email.length, emailPending: email.filter(ok => !ok).length });
});
