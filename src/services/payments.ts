import type { PaymentMethod, PaymentStatus } from '@/types';

/**
 * Camada de pagamentos ISOLADA.
 *
 * IMPORTANTE: este módulo NÃO processa pagamentos de verdade. Ele apenas
 * define o contrato e um provedor de demonstração. A cobrança real (PIX,
 * cartão) deve ser feita por um gateway no BACKEND (Mercado Pago, Stripe,
 * Asaas), nunca no frontend, e confirmada por webhook que atualiza
 * `orders.payment_status`. Ver README › Sistema de pagamentos.
 */

export interface PaymentIntent {
  orderId: string;
  amount: number;
  method: PaymentMethod;
  /** dados específicos do método (ex.: QR do PIX) preenchidos pelo provedor */
  pixQrCode?: string;
  pixCopyPaste?: string;
  status: PaymentStatus;
}

export interface PaymentProvider {
  readonly name: string;
  createIntent(orderId: string, amount: number, method: PaymentMethod): Promise<PaymentIntent>;
}

/** Provedor de demonstração — simula a criação de uma cobrança. */
class DemoPaymentProvider implements PaymentProvider {
  readonly name = 'demo';

  async createIntent(
    orderId: string,
    amount: number,
    method: PaymentMethod,
  ): Promise<PaymentIntent> {
    await new Promise((r) => setTimeout(r, 300));
    if (method === 'pix') {
      return {
        orderId,
        amount,
        method,
        status: 'pending',
        pixCopyPaste:
          '00020126360014BR.GOV.BCB.PIX0114+5531735291460216Seu Paulo Buteco5204000053039865802BR6009BETIM62070503***6304DEMO',
        pixQrCode: 'demo-qr',
      };
    }
    // Cartão/dinheiro: no demo consideramos aprovado/na entrega.
    return { orderId, amount, method, status: method === 'cash' ? 'pending' : 'approved' };
  }
}

export const paymentProvider: PaymentProvider = new DemoPaymentProvider();
