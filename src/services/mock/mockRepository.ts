import type {
  Address,
  AppNotification,
  ApplicationDocument,
  Category,
  Coupon,
  Driver,
  DriverApplication,
  DriverApplicationStatus,
  DriverStatus,
  LatLng,
  Order,
  OrderStatus,
  Product,
  Profile,
  VehicleType,
} from '@/types';
import type {
  AuthSession,
  CreateOrderInput,
  DataRepository,
  DriverApplicationInput,
  DriverRegistration,
  ReviewDecision,
  SignUpInput,
  Unsubscribe,
} from '@/services/types';
import { CATEGORIES_SEED, getState, mutate, subscribe } from './db';
import { RESTAURANT } from '@/data/restaurant';
import { uid, orderCode } from '@/utils/id';
import { estimateEtaMinutes, pointAlongRoute } from '@/utils/geo';
import { getDeliveryRoute } from '@/services/routing';
import { verificationProvider } from '@/services/verification';
import { validateEmail } from '@/utils/validation';

/** Código de verificação de e-mail: 6 dígitos, válido por 5 minutos. */
const CODE_TTL_MS = 5 * 60 * 1000;
const genCode = () => String(Math.floor(100000 + Math.random() * 900000));

/**
 * "Envio" do código no backend mock: como não há e-mail em dev, publicamos o
 * código só para a própria tela mostrar um aviso de desenvolvimento. O fluxo
 * real (Supabase + Resend) manda por e-mail e NUNCA expõe o código ao front.
 */
function devDeliverCode(email: string, code: string): void {
  if (typeof window === 'undefined') return;
  console.info(`[dev] Código de verificação para ${email}: ${code}`);
  // Guarda o último código para a tela de verificação ler ao montar (dev only).
  (window as unknown as { __SPD_DEV_CODE?: { email: string; code: string } }).__SPD_DEV_CODE = {
    email,
    code,
  };
  window.dispatchEvent(new CustomEvent('spd:dev-code', { detail: { email, code } }));
}
import { toCapturedFile } from '@/components/onboarding/capture';

/** Recomendação da triagem → status inicial da candidatura. */
function statusFromRecommendation(
  rec: 'auto_approve' | 'manual_review' | 'reject',
): DriverApplicationStatus {
  if (rec === 'auto_approve') return 'approved';
  if (rec === 'reject') return 'rejected';
  return 'manual_review';
}

const SESSION_KEY = 'spd_session_v1';
const wait = (ms = 220) => new Promise((r) => setTimeout(r, ms));

function pushNotification(n: Omit<AppNotification, 'id' | 'read' | 'createdAt'>): void {
  mutate((s) => {
    s.notifications.unshift({
      ...n,
      id: uid('n'),
      read: false,
      createdAt: new Date().toISOString(),
    });
  });
}

/* ----------------- Simulador de rota em tempo real ----------------- */
/** Guarda os timers ativos de animação do entregador por pedido. */
const routeTimers = new Map<string, ReturnType<typeof setInterval>>();

function stopRouteSim(orderId: string): void {
  const t = routeTimers.get(orderId);
  if (t) {
    clearInterval(t);
    routeTimers.delete(orderId);
  }
}

/**
 * Anima o marcador do entregador do restaurante até o cliente, atualizando
 * `driverLocation` e `etaMinutes` do pedido — é o que a tela de acompanhamento
 * do cliente e o mapa do entregador leem em tempo real.
 */
async function startRouteSim(orderId: string): Promise<void> {
  stopRouteSim(orderId);
  const order = getState().orders.find((o) => o.id === orderId);
  if (!order || !order.address) return;

  const dest = { lat: order.address.lat, lng: order.address.lng };
  // Rota REAL por ruas, sempre partindo do Seu Paulo.
  const routeResult = await getDeliveryRoute(dest, RESTAURANT.location);
  // Pode ter mudado de status enquanto buscava a rota.
  const still = getState().orders.find((o) => o.id === orderId);
  if (!still || still.status !== 'on_the_way') return;

  const route = routeResult.coordinates;
  const totalEta = routeResult.durationMin;
  const startedAt = Date.now();
  // A entrega simulada dura ~90s para caber numa demonstração.
  const durationMs = 90_000;

  const tick = () => {
    const progress = Math.min(1, (Date.now() - startedAt) / durationMs);
    const loc = pointAlongRoute(route, progress);
    const eta = Math.max(1, Math.round(totalEta * (1 - progress)));
    mutate((st) => {
      const o = st.orders.find((x) => x.id === orderId);
      if (!o || o.status !== 'on_the_way') return;
      o.driverLocation = loc;
      o.etaMinutes = eta;
      o.updatedAt = new Date().toISOString();
      const d = st.drivers.find((dr) => dr.id === o.driverId);
      if (d) d.location = loc;
    });
    if (progress >= 1) stopRouteSim(orderId);
  };

  tick();
  routeTimers.set(orderId, setInterval(tick, 1500));
}

function retomarSimulacoes(): void {
  // Ao recarregar a página, retoma pedidos que estavam a caminho.
  getState().orders.forEach((o) => {
    if (o.status === 'on_the_way' && o.address) void startRouteSim(o.id);
  });
}

/* --------------------------- Repositório --------------------------- */

class MockRepository implements DataRepository {
  readonly backendName = 'Mock (localStorage)';

  constructor() {
    if (typeof window !== 'undefined') retomarSimulacoes();
  }

  /* ---- Auth ---- */
  async getSession(): Promise<AuthSession | null> {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const { userId } = JSON.parse(raw) as { userId: string };
      const profile = getState().profiles.find((p) => p.id === userId);
      return profile ? { profile } : null;
    } catch {
      return null;
    }
  }

  async signIn(email: string, password: string, role?: Profile['role']): Promise<AuthSession> {
    await wait();
    const s = getState();
    const key = email.trim().toLowerCase();
    const profile = s.profiles.find((p) => p.email.toLowerCase() === key);
    if (!profile || s.credentials[profile.email] !== password) {
      throw new Error('E-mail ou senha incorretos.');
    }
    if (role && profile.role !== role) {
      throw new Error('Esta conta não tem acesso a este ambiente.');
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: profile.id }));
    return { profile };
  }

  async signUp(input: SignUpInput): Promise<AuthSession> {
    await wait();
    const key = input.email.trim().toLowerCase();
    if (getState().profiles.some((p) => p.email.toLowerCase() === key)) {
      throw new Error('Já existe uma conta com este e-mail.');
    }
    const profile: Profile = {
      id: uid('u'),
      role: input.role,
      fullName: input.fullName.trim(),
      email: input.email.trim(),
      phone: input.phone.trim(),
      createdAt: new Date().toISOString(),
    };
    mutate((s) => {
      s.profiles.push(profile);
      s.credentials[profile.email] = input.password;
      if (input.role === 'driver' && input.driver) {
        s.drivers.push({
          id: profile.id,
          vehicleType: input.driver.vehicleType,
          plate: input.driver.plate.toUpperCase(),
          model: input.driver.model,
          color: input.driver.color,
          status: 'pending',
          online: false,
          location: null,
          rating: 0,
          totalDeliveries: 0,
          createdAt: profile.createdAt,
        });
      }
    });
    if (input.role === 'driver') {
      pushNotification({
        userId: 'u-admin',
        audience: 'admin',
        title: 'Novo entregador cadastrado',
        body: `${profile.fullName} aguarda aprovação.`,
      });
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: profile.id }));
    return { profile };
  }

  async signOut(): Promise<void> {
    localStorage.removeItem(SESSION_KEY);
  }

  async requestPasswordReset(email: string): Promise<void> {
    await wait();
    // No mock apenas validamos que o e-mail existe; o "envio" é simulado.
    const exists = getState().profiles.some(
      (p) => p.email.toLowerCase() === email.trim().toLowerCase(),
    );
    if (!exists) throw new Error('Não encontramos uma conta com este e-mail.');
  }

  async resetPassword(email: string, newPassword: string): Promise<void> {
    await wait();
    mutate((s) => {
      const profile = s.profiles.find((p) => p.email.toLowerCase() === email.trim().toLowerCase());
      if (!profile) throw new Error('Conta não encontrada.');
      s.credentials[profile.email] = newPassword;
    });
  }

  async updateProfile(userId: string, patch: Partial<Profile>): Promise<Profile> {
    await wait();
    let updated: Profile | undefined;
    mutate((s) => {
      const p = s.profiles.find((x) => x.id === userId);
      if (!p) throw new Error('Conta não encontrada.');
      Object.assign(p, patch);
      updated = p;
    });
    return updated!;
  }

  async changePassword(userId: string, current: string, next: string): Promise<void> {
    await wait();
    mutate((s) => {
      const p = s.profiles.find((x) => x.id === userId);
      if (!p) throw new Error('Conta não encontrada.');
      if (s.credentials[p.email] !== current) throw new Error('Senha atual incorreta.');
      s.credentials[p.email] = next;
    });
  }

  async getProfileById(id: string): Promise<Profile | null> {
    return getState().profiles.find((p) => p.id === id) ?? null;
  }

  async getCustomers(): Promise<Profile[]> {
    return getState().profiles.filter((p) => p.role === 'customer');
  }

  /* ---- Verificação de e-mail no cadastro do cliente ---- */
  async startCustomerSignup(input: SignUpInput): Promise<{ expiresAt: string }> {
    await wait();
    const emailErr = validateEmail(input.email);
    if (emailErr) throw new Error(emailErr);
    const key = input.email.trim().toLowerCase();
    if (getState().profiles.some((p) => p.email.toLowerCase() === key)) {
      throw new Error('Já existe uma conta com este e-mail.');
    }
    const now = Date.now();
    const code = genCode();
    const expiresAt = new Date(now + CODE_TTL_MS).toISOString();
    mutate((s) => {
      // Invalida qualquer código anterior para este e-mail.
      s.pendingSignups = s.pendingSignups.filter((p) => p.email.toLowerCase() !== key);
      s.pendingSignups.push({
        attemptId: uid('att'),
        email: input.email.trim(),
        fullName: input.fullName.trim(),
        phone: input.phone.trim(),
        password: input.password,
        code,
        createdAt: new Date(now).toISOString(),
        expiresAt,
        attempts: 0,
      });
    });
    devDeliverCode(input.email.trim(), code);
    return { expiresAt };
  }

  async verifyCustomerEmail(email: string, code: string): Promise<void> {
    await wait(150);
    const key = email.trim().toLowerCase();
    const clean = (code || '').replace(/\D/g, '');
    const pending = getState().pendingSignups.find((p) => p.email.toLowerCase() === key);
    if (!pending || Date.now() > new Date(pending.expiresAt).getTime()) {
      throw new Error('Este código expirou. Solicite um novo código para continuar.');
    }
    if (pending.code !== clean) {
      mutate((s) => {
        const p = s.pendingSignups.find((x) => x.email.toLowerCase() === key);
        if (p) p.attempts += 1;
      });
      throw new Error(
        'Código incorreto. Verifique o código enviado para seu e-mail e tente novamente.',
      );
    }
    // Código correto e no prazo → cria a conta ativa e consome o código.
    const profile: Profile = {
      id: uid('u'),
      role: 'customer',
      fullName: pending.fullName,
      email: pending.email,
      phone: pending.phone,
      createdAt: new Date().toISOString(),
    };
    mutate((s) => {
      if (s.profiles.some((p) => p.email.toLowerCase() === key)) {
        throw new Error('Esta conta já foi criada. Faça login.');
      }
      s.profiles.push(profile);
      s.credentials[profile.email] = pending.password;
      s.pendingSignups = s.pendingSignups.filter((p) => p.email.toLowerCase() !== key);
    });
  }

  async resendCustomerCode(email: string): Promise<{ expiresAt: string }> {
    await wait();
    const key = email.trim().toLowerCase();
    const pending = getState().pendingSignups.find((p) => p.email.toLowerCase() === key);
    if (!pending) {
      throw new Error('Cadastro não encontrado. Comece o cadastro novamente.');
    }
    const now = Date.now();
    const code = genCode(); // novo código: o anterior deixa de valer
    const expiresAt = new Date(now + CODE_TTL_MS).toISOString();
    mutate((s) => {
      const p = s.pendingSignups.find((x) => x.email.toLowerCase() === key);
      if (p) {
        p.code = code;
        p.expiresAt = expiresAt;
        p.createdAt = new Date(now).toISOString();
        p.attempts = 0;
      }
    });
    devDeliverCode(pending.email, code);
    return { expiresAt };
  }

  /* ---- Cardápio ---- */
  async getCategories(): Promise<Category[]> {
    return [...CATEGORIES_SEED];
  }
  async getProducts(): Promise<Product[]> {
    return [...getState().products];
  }
  async getProduct(id: string): Promise<Product | null> {
    return getState().products.find((p) => p.id === id) ?? null;
  }
  async upsertProduct(product: Product): Promise<Product> {
    await wait();
    mutate((s) => {
      const i = s.products.findIndex((p) => p.id === product.id);
      if (i >= 0) s.products[i] = product;
      else s.products.unshift(product);
    });
    return product;
  }
  async deleteProduct(id: string): Promise<void> {
    await wait();
    mutate((s) => {
      s.products = s.products.filter((p) => p.id !== id);
    });
  }
  async setProductAvailability(id: string, available: boolean): Promise<void> {
    mutate((s) => {
      const p = s.products.find((x) => x.id === id);
      if (p) p.available = available;
    });
  }

  /* ---- Endereços ---- */
  async getAddresses(userId: string): Promise<Address[]> {
    return getState().addresses.filter((a) => a.userId === userId);
  }
  async saveAddress(address: Address): Promise<Address> {
    await wait();
    mutate((s) => {
      const i = s.addresses.findIndex((a) => a.id === address.id);
      if (address.isDefault) {
        s.addresses.forEach((a) => {
          if (a.userId === address.userId) a.isDefault = false;
        });
      }
      if (i >= 0) s.addresses[i] = address;
      else s.addresses.push(address);
    });
    return address;
  }
  async deleteAddress(id: string): Promise<void> {
    await wait();
    mutate((s) => {
      s.addresses = s.addresses.filter((a) => a.id !== id);
    });
  }
  async setDefaultAddress(userId: string, addressId: string): Promise<void> {
    mutate((s) => {
      s.addresses.forEach((a) => {
        if (a.userId === userId) a.isDefault = a.id === addressId;
      });
    });
  }

  /* ---- Cupons ---- */
  async getCoupons(): Promise<Coupon[]> {
    return [...getState().coupons];
  }
  async validateCoupon(code: string, subtotal: number): Promise<Coupon> {
    await wait(150);
    const coupon = getState().coupons.find(
      (c) => c.code.toUpperCase() === code.trim().toUpperCase(),
    );
    if (!coupon) throw new Error('Cupom não encontrado.');
    if (!coupon.active) throw new Error('Cupom inativo.');
    if (new Date(coupon.expiresAt).getTime() < Date.now()) throw new Error('Cupom expirado.');
    if (coupon.usedCount >= coupon.maxUses) throw new Error('Cupom esgotado.');
    if (subtotal < coupon.minSubtotal) {
      throw new Error(
        `Pedido mínimo de R$ ${coupon.minSubtotal.toFixed(2).replace('.', ',')} para este cupom.`,
      );
    }
    return coupon;
  }

  /* ---- Pedidos ---- */
  async createOrder(input: CreateOrderInput): Promise<Order> {
    await wait();
    const iso = new Date().toISOString();
    // Arquitetura de pagamento: pix/cartão são "aprovados" pelo gateway mock;
    // dinheiro fica pendente (pago na entrega). A integração real fica isolada
    // em services/payments (ver README).
    const paymentStatus = input.paymentMethod === 'cash' ? 'pending' : 'approved';
    const order: Order = {
      id: uid('o'),
      code: orderCode(),
      customerId: input.customer.id,
      customerName: input.customer.fullName,
      customerPhone: input.customer.phone,
      items: input.items,
      fulfillment: input.fulfillment,
      address: input.address,
      subtotal: input.subtotal,
      deliveryFee: input.deliveryFee,
      discount: input.discount,
      total: input.total,
      couponCode: input.couponCode,
      paymentMethod: input.paymentMethod,
      paymentStatus,
      changeFor: input.changeFor,
      status: 'received',
      statusHistory: [{ status: 'received', at: iso }],
      driverId: null,
      driverLocation: null,
      etaMinutes: input.address
        ? estimateEtaMinutes({ lat: input.address.lat, lng: input.address.lng })
        : RESTAURANT.avgPrepMinutes,
      // Código de entrega único gerado no ato do pedido (6 dígitos).
      deliveryCode: String(Math.floor(100000 + Math.random() * 900000)),
      deliveredAt: null,
      createdAt: iso,
      updatedAt: iso,
    };
    mutate((s) => {
      s.orders.unshift(order);
      if (input.couponCode) {
        const c = s.coupons.find((x) => x.code === input.couponCode);
        if (c) c.usedCount += 1;
      }
    });
    pushNotification({
      userId: 'u-admin',
      audience: 'admin',
      title: 'Novo pedido recebido',
      body: `${order.code} — ${order.customerName} • R$ ${order.total.toFixed(2)}`,
      orderId: order.id,
    });
    // Notificação persistente para o cliente (pedido recebido).
    pushNotification({
      userId: order.customerId,
      audience: 'customer',
      title: `Pedido ${order.code}`,
      body: 'Pedido recebido! Estamos preparando tudo. 🟡',
      orderId: order.id,
    });
    return order;
  }

  async getDeliveryCode(orderId: string): Promise<string | null> {
    const o = getState().orders.find((x) => x.id === orderId);
    return o?.deliveryCode ?? null;
  }

  async confirmDelivery(orderId: string, code: string): Promise<{ ok: boolean; error?: string }> {
    await wait(150);
    const clean = (code || '').replace(/\D/g, '');
    const session = await this.getSession();
    const driverId = session?.profile.id ?? null;
    let result: { ok: boolean; error?: string } = { ok: false, error: 'Pedido não encontrado.' };
    mutate((s) => {
      const o = s.orders.find((x) => x.id === orderId);
      if (!o) return;
      if (!o.driverId || o.driverId !== driverId) {
        result = { ok: false, error: 'Você não é o entregador deste pedido.' };
        return;
      }
      if (o.status === 'delivered') {
        result = { ok: false, error: 'Pedido já foi entregue.' };
        return;
      }
      if (o.status !== 'on_the_way' && o.status !== 'arrived') {
        result = { ok: false, error: 'O pedido ainda não está em entrega.' };
        return;
      }
      if (o.deliveryCode !== clean) {
        result = { ok: false, error: 'Código de entrega inválido.' };
        return;
      }
      const now = new Date().toISOString();
      o.status = 'delivered';
      o.deliveredAt = now;
      o.updatedAt = now;
      o.paymentStatus = 'approved';
      o.etaMinutes = 0;
      o.statusHistory.push({ status: 'delivered', at: now });
      const d = s.drivers.find((dr) => dr.id === o.driverId);
      if (d) d.totalDeliveries += 1;
      result = { ok: true };
    });
    if (result.ok) {
      stopRouteSim(orderId);
      const o = getState().orders.find((x) => x.id === orderId);
      if (o) {
        pushNotification({
          userId: o.customerId,
          audience: 'customer',
          title: `Pedido ${o.code}`,
          body: 'Pedido entregue com sucesso ✅',
          orderId: o.id,
        });
      }
    }
    return result;
  }

  async getOrder(id: string): Promise<Order | null> {
    return getState().orders.find((o) => o.id === id) ?? null;
  }
  async getOrdersByCustomer(customerId: string): Promise<Order[]> {
    return getState().orders.filter((o) => o.customerId === customerId);
  }
  async getOrdersByDriver(driverId: string): Promise<Order[]> {
    return getState().orders.filter((o) => o.driverId === driverId);
  }
  async getAllOrders(): Promise<Order[]> {
    return [...getState().orders];
  }
  async getAvailableDeliveries(): Promise<Order[]> {
    return getState().orders.filter(
      (o) => o.fulfillment === 'delivery' && o.driverId === null && o.status === 'ready',
    );
  }

  async updateOrderStatus(id: string, status: OrderStatus, note?: string): Promise<Order> {
    await wait(120);
    // Regra de segurança: "entregue" só pela confirmação de código (confirmDelivery).
    if (status === 'delivered') {
      throw new Error('A entrega só pode ser confirmada com o código do cliente.');
    }
    let updated: Order | undefined;
    mutate((s) => {
      const o = s.orders.find((x) => x.id === id);
      if (!o) throw new Error('Pedido não encontrado.');
      o.status = status;
      o.updatedAt = new Date().toISOString();
      o.statusHistory.push({ status, at: o.updatedAt, note });
      updated = o;
    });
    // Notifica o cliente sobre a mudança.
    const labels: Partial<Record<OrderStatus, string>> = {
      confirmed: 'Seu pedido foi confirmado! 🍻',
      preparing: 'A cozinha já está no fogo 👨‍🍳',
      ready: 'Pedido pronto! Já já sai pra entrega 📦',
      on_the_way: 'Seu pedido está a caminho 🛵',
      arrived: 'O entregador chegou. Informe o código de entrega. 🔔',
      cancelled: 'Seu pedido foi cancelado.',
    };
    if (updated && labels[status]) {
      pushNotification({
        userId: updated.customerId,
        audience: 'customer',
        title: `Pedido ${updated.code}`,
        body: labels[status]!,
        orderId: updated.id,
      });
    }
    if (status === 'on_the_way') void startRouteSim(id);
    if (status === 'cancelled') stopRouteSim(id);
    return updated!;
  }

  async assignDriver(orderId: string, driverId: string): Promise<Order> {
    await wait(120);
    let updated: Order | undefined;
    mutate((s) => {
      const o = s.orders.find((x) => x.id === orderId);
      if (!o) throw new Error('Pedido não encontrado.');
      o.driverId = driverId;
      o.updatedAt = new Date().toISOString();
      updated = o;
    });
    pushNotification({
      userId: driverId,
      audience: 'driver',
      title: 'Pedido atribuído a você',
      body: `${updated!.code} — retire no ${RESTAURANT.name}.`,
      orderId,
    });
    return updated!;
  }

  async cancelOrder(id: string, reason?: string): Promise<Order> {
    return this.updateOrderStatus(id, 'cancelled', reason);
  }

  async updateDriverLocation(orderId: string, location: LatLng): Promise<void> {
    mutate((s) => {
      const o = s.orders.find((x) => x.id === orderId);
      if (o) {
        o.driverLocation = location;
        o.updatedAt = new Date().toISOString();
      }
    });
  }

  /* ---- Entregadores ---- */
  async getDrivers(): Promise<Driver[]> {
    return [...getState().drivers];
  }
  async getDriver(id: string): Promise<Driver | null> {
    return getState().drivers.find((d) => d.id === id) ?? null;
  }
  async setDriverStatus(id: string, status: DriverStatus): Promise<Driver> {
    await wait(120);
    let updated: Driver | undefined;
    mutate((s) => {
      const d = s.drivers.find((x) => x.id === id);
      if (!d) throw new Error('Entregador não encontrado.');
      d.status = status;
      updated = d;
    });
    pushNotification({
      userId: id,
      audience: 'driver',
      title: 'Status do cadastro atualizado',
      body:
        status === 'approved'
          ? 'Cadastro aprovado! Você já pode receber entregas. 🟢'
          : status === 'rejected'
            ? 'Seu cadastro foi reprovado.'
            : 'Seu acesso foi bloqueado.',
    });
    return updated!;
  }
  async setDriverOnline(id: string, online: boolean): Promise<Driver> {
    let updated: Driver | undefined;
    mutate((s) => {
      const d = s.drivers.find((x) => x.id === id);
      if (!d) throw new Error('Entregador não encontrado.');
      d.online = online;
      updated = d;
    });
    return updated!;
  }
  async setDriverLocation(id: string, location: LatLng): Promise<Driver> {
    let updated: Driver | undefined;
    mutate((s) => {
      const d = s.drivers.find((x) => x.id === id);
      if (!d) throw new Error('Entregador não encontrado.');
      d.location = location;
      updated = d;
    });
    return updated!;
  }

  /* ---- Cadastro/onboarding de entregador ---- */
  async registerDriver(input: DriverApplicationInput): Promise<DriverRegistration> {
    await wait(400);
    const emailKey = input.email.trim().toLowerCase();
    const cpfKey = input.cpf.replace(/\D/g, '');
    const st = getState();
    if (st.profiles.some((p) => p.email.toLowerCase() === emailKey)) {
      throw new Error('Já existe uma conta com este e-mail.');
    }
    if (st.driverApplications.some((a) => a.cpf.replace(/\D/g, '') === cpfKey)) {
      throw new Error('Já existe um cadastro de entregador com este CPF.');
    }

    const iso = new Date().toISOString();
    const profile: Profile = {
      id: uid('u'),
      role: 'driver',
      fullName: input.fullName.trim(),
      email: input.email.trim(),
      phone: input.phone.trim(),
      createdAt: iso,
    };

    // No mock, guardamos a própria dataUrl como "caminho" do arquivo.
    const documents: ApplicationDocument[] = input.documents.map((m) => ({
      kind: m.kind,
      path: m.dataUrl,
      uploadedAt: iso,
      ocr: null,
    }));

    // Triagem automática (metadados dos arquivos; nunca afirma autenticidade).
    const analysis = await verificationProvider.analyze({
      vehicle: input.vehicle,
      files: input.documents.map(toCapturedFile),
      claimed: {
        cnh: input.cnh ? { ...input.cnh } : undefined,
        moto: input.moto ? { ...input.moto } : undefined,
      },
    });
    const status = statusFromRecommendation(analysis.recommendation);

    const vehicleType: VehicleType = input.vehicle;
    const application: DriverApplication = {
      id: uid('app'),
      userId: profile.id,
      vehicle: input.vehicle,
      status,
      // Auto-aprovado pela triagem ainda aguarda a mini-aprovação do admin.
      adminConfirmed: false,
      fullName: profile.fullName,
      cpf: input.cpf,
      rg: input.rg,
      birthDate: input.birthDate,
      email: profile.email,
      phone: profile.phone,
      address: input.address,
      cnh: input.cnh ?? null,
      moto: input.moto ?? null,
      bike: input.bike ?? null,
      documents,
      autoAnalysis: analysis,
      reviews: [
        { at: iso, by: profile.id, action: 'submitted', status: 'under_analysis' },
        { at: iso, by: 'auto', action: 'auto_analysis', status },
      ],
      createdAt: iso,
      updatedAt: iso,
    };

    mutate((s) => {
      s.profiles.push(profile);
      s.credentials[profile.email] = input.password;
      s.driverApplications.unshift(application);
      s.drivers.push({
        id: profile.id,
        vehicleType,
        plate: (input.moto?.plate ?? '').toUpperCase() || 'N/A',
        model:
          input.vehicle === 'moto'
            ? `${input.moto?.brand ?? ''} ${input.moto?.model ?? ''}`.trim()
            : `Bicicleta ${input.bike?.kind === 'eletrica' ? 'elétrica' : 'convencional'}`,
        color: (input.moto?.color ?? input.bike?.color ?? '').trim(),
        status: status === 'approved' ? 'approved' : 'pending',
        online: false,
        location: null,
        rating: 0,
        totalDeliveries: 0,
        createdAt: iso,
      });
    });

    pushNotification({
      userId: 'u-admin',
      audience: 'admin',
      title: 'Nova solicitação de entregador',
      body:
        status === 'approved'
          ? `${profile.fullName} passou na triagem e já está operando — confirme o cadastro.`
          : `${profile.fullName} (${input.vehicle === 'moto' ? 'Moto' : 'Bicicleta'}) enviou o cadastro para análise.`,
    });
    localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: profile.id }));
    return { profile, application };
  }

  async getDriverApplication(userId: string): Promise<DriverApplication | null> {
    const apps = getState().driverApplications.filter((a) => a.userId === userId);
    // a mais recente
    return apps.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  }

  async getDriverApplications(): Promise<DriverApplication[]> {
    return [...getState().driverApplications].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }

  async reviewDriverApplication(
    id: string,
    decision: ReviewDecision,
    adminId: string,
  ): Promise<DriverApplication> {
    await wait(200);
    const needsReason = decision.action === 'reject' || decision.action === 'request_resubmission';
    if (needsReason && !decision.reason?.trim()) {
      throw new Error('Informe o motivo da decisão.');
    }
    const nextStatus: DriverApplicationStatus =
      decision.action === 'approve' || decision.action === 'confirm'
        ? 'approved'
        : decision.action === 'reject'
          ? 'rejected'
          : 'needs_resubmission';
    let updated: DriverApplication | undefined;
    mutate((s) => {
      const app = s.driverApplications.find((a) => a.id === id);
      if (!app) throw new Error('Solicitação não encontrada.');
      const now = new Date().toISOString();
      app.status = nextStatus;
      // Aprovar/confirmar marca a mini-aprovação como feita pelo admin.
      if (decision.action === 'approve' || decision.action === 'confirm') {
        app.adminConfirmed = true;
      }
      app.updatedAt = now;
      app.reviews.push({
        at: now,
        by: adminId,
        action:
          decision.action === 'reject'
            ? 'rejected'
            : decision.action === 'request_resubmission'
              ? 'resubmission_requested'
              : 'approved',
        status: nextStatus,
        reason:
          decision.reason?.trim() ??
          (decision.action === 'confirm' ? 'Aprovação confirmada pelo administrador.' : undefined),
      });
      const driver = s.drivers.find((d) => d.id === app.userId);
      if (driver) {
        driver.status =
          nextStatus === 'approved' ? 'approved' : nextStatus === 'rejected' ? 'rejected' : 'pending';
      }
      updated = app;
    });

    // 'confirm' não muda a situação do entregador (já estava operando) — não avisa.
    if (decision.action !== 'confirm') {
      const messages: Record<DriverApplicationStatus, string> = {
        approved: 'Cadastro aprovado! Você já pode receber entregas. 🟢',
        rejected: `Cadastro reprovado. ${decision.reason ?? ''}`.trim(),
        needs_resubmission: `Precisamos de um novo envio. ${decision.reason ?? ''}`.trim(),
        pending_documents: 'Faltam documentos no seu cadastro.',
        under_analysis: 'Seu cadastro está em análise.',
        manual_review: 'Seu cadastro está em análise.',
      };
      pushNotification({
        userId: updated!.userId,
        audience: 'driver',
        title: 'Status do cadastro atualizado',
        body: messages[nextStatus],
      });
    }
    return updated!;
  }

  async getDocumentUrl(path: string): Promise<string | null> {
    // No mock, o "caminho" já é a própria dataUrl da imagem.
    return path || null;
  }

  /* ---- Notificações ---- */
  async getNotifications(userId: string): Promise<AppNotification[]> {
    return getState().notifications.filter((n) => n.userId === userId);
  }
  async markNotificationRead(id: string): Promise<void> {
    mutate((s) => {
      const n = s.notifications.find((x) => x.id === id);
      if (n) n.read = true;
    });
  }

  /* ---- Realtime (via pub/sub do store) ----
     Importante: emitimos CÓPIAS rasas. O store mock muta objetos no lugar, e o
     React ignora setState com a mesma referência — sem clonar, a tela do cliente
     não re-renderizaria a cada atualização de localização do entregador. */
  subscribeOrder(orderId: string, cb: (order: Order) => void): Unsubscribe {
    const emit = () => {
      const o = getState().orders.find((x) => x.id === orderId);
      if (o) cb({ ...o });
    };
    emit();
    return subscribe(emit);
  }
  subscribeOrders(cb: (orders: Order[]) => void): Unsubscribe {
    const emit = () => cb(getState().orders.map((o) => ({ ...o })));
    emit();
    return subscribe(emit);
  }
  subscribeAvailableDeliveries(cb: (orders: Order[]) => void): Unsubscribe {
    const emit = () =>
      cb(
        getState()
          .orders.filter((o) => o.fulfillment === 'delivery' && o.driverId === null && o.status === 'ready')
          .map((o) => ({ ...o })),
      );
    emit();
    return subscribe(emit);
  }
}

export const mockRepository = new MockRepository();
