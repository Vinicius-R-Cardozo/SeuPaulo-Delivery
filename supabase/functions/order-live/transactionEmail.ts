type EmailKind = 'order_received' | 'order_completed' | 'customer_verified' | 'driver_application_received'
  | 'driver_approved' | 'driver_rejected' | 'driver_resubmission';

export interface EmailJob {
  id: string;
  lease: string;
  email: string;
  kind: EmailKind;
  content: {
    code?: string;
    items?: { name: string; quantity: number; unitPrice: number }[];
    fulfillment?: 'delivery' | 'pickup';
    subtotal?: number;
    deliveryFee?: number;
    discount?: number;
    total?: number;
    paymentMethod?: 'cash' | 'card' | 'pix';
  };
}
export type EmailResult = 'sent' | 'retry' | 'invalid';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const methods = { cash: 'Dinheiro', card: 'Cartão', pix: 'Pix' };
const safe = (value: string) => value.replace(/[&<>"'{}]/g, char => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '{': '&#123;', '}': '&#125;' }[char]!
));
const price = (value: number) => currency.format(value);

const accountMessages = {
  customer_verified: ['Cadastro confirmado', 'Seu e-mail foi confirmado. Entre no app do Seu Paulo para fazer seu pedido.'],
  driver_application_received: ['Recebemos seu cadastro de entregador', 'Sua candidatura foi enviada para análise. Acompanhe a decisão no painel do entregador.'],
  driver_approved: ['Cadastro de entregador aprovado', 'Abra o painel do entregador. Você já pode ficar online para receber ofertas.'],
  driver_rejected: ['O resultado da análise do seu cadastro', 'Seu cadastro de entregador foi reprovado. Entre no app para consultar o motivo informado pela equipe.'],
  driver_resubmission: ['Precisamos de um novo envio para seu cadastro', 'Abra a área do entregador, confira o motivo informado e toque em Reenviar documentos para enviar as novas imagens pelo app.'],
} satisfies Record<Exclude<EmailKind, 'order_received' | 'order_completed'>, [string, string]>;

function receipt(job: EmailJob) {
  const order = job.content;
  const code = (order.code ?? '').replace(/[\r\n]/g, '').slice(0,32);
  const pickup = order.fulfillment === 'pickup';
  const complete = job.kind === 'order_completed';
  const subject = (complete ? (pickup ? 'Retirada confirmada' : 'Entrega confirmada') : 'Resumo do seu pedido') + ' ' + code;
  const intro = complete
    ? (pickup ? 'Sua retirada foi concluída.' : 'Seu pedido foi entregue.')
    : 'Recebemos seu pedido. Acompanhe a confirmação pelo restaurante no app.';
  const rows = (order.items ?? []).filter(item => Number.isFinite(item.quantity) && Number.isFinite(item.unitPrice))
    .map(item => `<tr><td style="padding:7px 0">${item.quantity} × ${safe(item.name)}</td><td style="text-align:right">${price(item.quantity * item.unitPrice)}</td></tr>`);
  const charges = [
    ['Subtotal', order.subtotal],
    !pickup && ['Taxa de entrega', order.deliveryFee],
    order.discount && ['Desconto', -order.discount],
    ['Total', order.total],
  ] as const;
  for (const entry of charges) {
    if (!entry || typeof entry[1] !== 'number') continue;
    rows.push(`<tr><td style="padding:7px 0">${entry[0]}</td><td style="text-align:right">${price(entry[1])}</td></tr>`);
  }
  const method = order.paymentMethod && methods[order.paymentMethod];
  const html = `<p>${safe(intro)}</p><table aria-label="Resumo do pedido" style="width:100%;border-collapse:collapse">${rows.join('')}</table>
    <p>${pickup ? 'Retirada no balcão' : 'Entrega'}${method ? ' · ' + method : ''}</p>
    <p style="font-size:13px;color:#695951">Resumo do pedido para conferência. Consulte o app para detalhes do pagamento.</p>`;
  return { subject, html };
}

export function renderTransactionEmail(job: EmailJob) {
  const message = job.kind === 'order_received' || job.kind === 'order_completed'
    ? receipt(job)
    : { subject: accountMessages[job.kind][0], html: `<p>${safe(accountMessages[job.kind][1])}</p>` };
  return {
    subject: message.subject,
    htmlContent: `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:22px;background:#f6efe6;font:16px/1.55 Arial,sans-serif;color:#241914">
      <div style="max-width:540px;margin:auto;background:#fff;padding:24px;border-top:5px solid #a42730;border-radius:8px">
        <p style="margin:0;color:#a42730;font-weight:bold">Seu Paulo Delivery</p>
        <h1 style="font-size:25px;line-height:1.18;margin:14px 0">${safe(message.subject)}</h1>
        ${message.html}
      </div></body></html>`,
  };
}

export async function sendTransactionEmail(job: EmailJob): Promise<EmailResult> {
  const apiKey = Deno.env.get('BREVO_API_KEY')?.trim();
  const sender = Deno.env.get('BREVO_FROM_EMAIL')?.trim();
  if (!apiKey || !sender) return 'retry';
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    signal: AbortSignal.timeout(10000),
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { email: sender, name: 'Seu Paulo Delivery' },
      to: [{ email: job.email }],
      headers: { idempotencyKey: job.id },
      ...renderTransactionEmail(job),
    }),
  });
  if (response.ok) return 'sent';
  const error = await response.json().catch(() => ({}));
  if (error.code === 'duplicate_parameter') return 'sent';
  if (response.status === 400 && error.code === 'invalid_parameter') return 'invalid';
  return 'retry';
}
