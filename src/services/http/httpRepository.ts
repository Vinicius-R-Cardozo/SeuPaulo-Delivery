import type {
  Address,
  AppNotification,
  Category,
  Coupon,
  Driver,
  DriverApplication,
  DriverStatus,
  LatLng,
  Order,
  OrderStatus,
  Product,
  Profile,
  Role,
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

/**
 * Backend HTTP (FastAPI). Implementa o mesmo contrato DataRepository usado pela
 * UI, agora contra a API real. O tempo real é feito por polling — simples e
 * robusto através de túneis (ngrok) e redes móveis.
 */

const TOKEN_KEY = 'spd_token';

function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export class HttpRepository implements DataRepository {
  readonly backendName = 'FastAPI (HTTP)';
  private base: string;

  constructor(baseUrl: string) {
    this.base = baseUrl.replace(/\/$/, '');
  }

  private async request<T>(
    path: string,
    options: { method?: string; body?: unknown; auth?: boolean } = {},
  ): Promise<T> {
    const { method = 'GET', body, auth = true } = options;
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth) {
      const token = getToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let message = 'Erro na comunicação com o servidor.';
      try {
        const data = await res.json();
        if (typeof data?.detail === 'string') message = data.detail;
      } catch {
        /* keep default */
      }
      throw new Error(message);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  /* ---- Auth ---- */
  async getSession(): Promise<AuthSession | null> {
    if (!getToken()) return null;
    try {
      const { profile } = await this.request<{ profile: Profile }>('/auth/me');
      return { profile };
    } catch {
      setToken(null);
      return null;
    }
  }

  async signIn(email: string, password: string, role?: Role): Promise<AuthSession> {
    const data = await this.request<{ token: string; profile: Profile }>('/auth/signin', {
      method: 'POST',
      auth: false,
      body: { email, password, role },
    });
    setToken(data.token);
    return { profile: data.profile };
  }

  async signUp(input: SignUpInput): Promise<AuthSession> {
    const data = await this.request<{ token: string; profile: Profile }>('/auth/signup', {
      method: 'POST',
      auth: false,
      body: input,
    });
    setToken(data.token);
    return { profile: data.profile };
  }

  async signOut(): Promise<void> {
    setToken(null);
  }

  async requestPasswordReset(email: string): Promise<void> {
    await this.request('/auth/reset-request', { method: 'POST', auth: false, body: { email } });
  }

  async resetPassword(email: string, newPassword: string): Promise<void> {
    await this.request('/auth/reset', { method: 'POST', auth: false, body: { email, newPassword } });
  }

  async updateProfile(_userId: string, patch: Partial<Profile>): Promise<Profile> {
    return this.request<Profile>('/auth/profile', { method: 'PATCH', body: patch });
  }

  async changePassword(_userId: string, current: string, next: string): Promise<void> {
    await this.request('/auth/change-password', { method: 'POST', body: { current, next } });
  }

  async getProfileById(id: string): Promise<Profile | null> {
    try {
      return await this.request<Profile>(`/auth/users/${id}`);
    } catch {
      return null;
    }
  }

  async getCustomers(): Promise<Profile[]> {
    return this.request<Profile[]>('/auth/customers');
  }

  /* ---- Cardápio ---- */
  getCategories(): Promise<Category[]> {
    return this.request<Category[]>('/categories', { auth: false });
  }
  getProducts(): Promise<Product[]> {
    return this.request<Product[]>('/products', { auth: false });
  }
  async getProduct(id: string): Promise<Product | null> {
    try {
      return await this.request<Product>(`/products/${id}`, { auth: false });
    } catch {
      return null;
    }
  }
  upsertProduct(product: Product): Promise<Product> {
    return this.request<Product>('/products', { method: 'PUT', body: product });
  }
  async deleteProduct(id: string): Promise<void> {
    await this.request(`/products/${id}`, { method: 'DELETE' });
  }
  async setProductAvailability(id: string, available: boolean): Promise<void> {
    await this.request(`/products/${id}/availability`, { method: 'PATCH', body: { available } });
  }

  /* ---- Endereços ---- */
  getAddresses(_userId: string): Promise<Address[]> {
    return this.request<Address[]>('/addresses');
  }
  saveAddress(address: Address): Promise<Address> {
    return this.request<Address>('/addresses', { method: 'PUT', body: address });
  }
  async deleteAddress(id: string): Promise<void> {
    await this.request(`/addresses/${id}`, { method: 'DELETE' });
  }
  async setDefaultAddress(_userId: string, addressId: string): Promise<void> {
    await this.request(`/addresses/${addressId}/default`, { method: 'POST' });
  }

  /* ---- Cupons ---- */
  getCoupons(): Promise<Coupon[]> {
    return this.request<Coupon[]>('/coupons', { auth: false });
  }
  validateCoupon(code: string, subtotal: number): Promise<Coupon> {
    return this.request<Coupon>('/coupons/validate', {
      method: 'POST',
      auth: false,
      body: { code, subtotal },
    });
  }

  /* ---- Pedidos ---- */
  createOrder(input: CreateOrderInput): Promise<Order> {
    return this.request<Order>('/orders', {
      method: 'POST',
      body: {
        items: input.items,
        fulfillment: input.fulfillment,
        address: input.address,
        subtotal: input.subtotal,
        deliveryFee: input.deliveryFee,
        discount: input.discount,
        total: input.total,
        couponCode: input.couponCode,
        paymentMethod: input.paymentMethod,
        changeFor: input.changeFor,
      },
    });
  }
  async getOrder(id: string): Promise<Order | null> {
    try {
      return await this.request<Order>(`/orders/${id}`);
    } catch {
      return null;
    }
  }
  async getOrdersByCustomer(customerId: string): Promise<Order[]> {
    const all = await this.request<Order[]>('/orders');
    return all.filter((o) => o.customerId === customerId);
  }
  async getOrdersByDriver(driverId: string): Promise<Order[]> {
    const all = await this.request<Order[]>('/orders');
    return all.filter((o) => o.driverId === driverId);
  }
  getAllOrders(): Promise<Order[]> {
    return this.request<Order[]>('/orders');
  }
  getAvailableDeliveries(): Promise<Order[]> {
    return this.request<Order[]>('/orders/available');
  }
  updateOrderStatus(id: string, status: OrderStatus, note?: string): Promise<Order> {
    return this.request<Order>(`/orders/${id}/status`, { method: 'PATCH', body: { status, note } });
  }
  assignDriver(orderId: string, driverId: string): Promise<Order> {
    return this.request<Order>(`/orders/${orderId}/assign`, { method: 'POST', body: { driverId } });
  }
  cancelOrder(id: string): Promise<Order> {
    return this.request<Order>(`/orders/${id}/cancel`, { method: 'POST' });
  }
  async getDeliveryCode(orderId: string): Promise<string | null> {
    try {
      const r = await this.request<{ code: string | null }>(`/orders/${orderId}/delivery-code`);
      return r.code ?? null;
    } catch {
      return null;
    }
  }
  async confirmDelivery(orderId: string, code: string): Promise<{ ok: boolean; error?: string }> {
    try {
      return await this.request<{ ok: boolean; error?: string }>(
        `/orders/${orderId}/confirm-delivery`,
        { method: 'POST', body: { code } },
      );
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
  async updateDriverLocation(orderId: string, location: LatLng): Promise<void> {
    await this.request(`/orders/${orderId}/driver-location`, { method: 'POST', body: location });
  }

  /* ---- Entregadores ---- */
  getDrivers(): Promise<Driver[]> {
    return this.request<Driver[]>('/drivers');
  }
  async getDriver(id: string): Promise<Driver | null> {
    try {
      return await this.request<Driver>(`/drivers/${id}`);
    } catch {
      return null;
    }
  }
  setDriverStatus(id: string, status: DriverStatus): Promise<Driver> {
    return this.request<Driver>(`/drivers/${id}/status`, { method: 'PATCH', body: { status } });
  }
  setDriverOnline(id: string, online: boolean): Promise<Driver> {
    return this.request<Driver>(`/drivers/${id}/online`, { method: 'POST', body: { online } });
  }
  setDriverLocation(id: string, location: LatLng): Promise<Driver> {
    return this.request<Driver>(`/drivers/${id}/location`, { method: 'POST', body: location });
  }

  /* ---- Cadastro/onboarding de entregador ---- */
  async registerDriver(input: DriverApplicationInput): Promise<DriverRegistration> {
    // multipart: os arquivos vão como binário; o restante como JSON.
    const fd = new FormData();
    const { documents, ...rest } = input;
    fd.append('payload', JSON.stringify(rest));
    for (const doc of documents) {
      fd.append('files', doc.blob, `${doc.kind}.jpg`);
      fd.append('kinds', doc.kind);
    }
    const res = await fetch(`${this.base}/drivers/apply`, { method: 'POST', body: fd });
    if (!res.ok) {
      let message = 'Não foi possível enviar o cadastro.';
      try {
        const data = await res.json();
        if (typeof data?.detail === 'string') message = data.detail;
      } catch {
        /* keep default */
      }
      throw new Error(message);
    }
    const data = (await res.json()) as { token: string; profile: Profile; application: DriverApplication };
    setToken(data.token);
    return { profile: data.profile, application: data.application };
  }
  async getDriverApplication(userId: string): Promise<DriverApplication | null> {
    try {
      return await this.request<DriverApplication>(`/drivers/${userId}/application`);
    } catch {
      return null;
    }
  }
  getDriverApplications(): Promise<DriverApplication[]> {
    return this.request<DriverApplication[]>('/drivers/applications');
  }
  reviewDriverApplication(
    id: string,
    decision: ReviewDecision,
    _adminId: string,
  ): Promise<DriverApplication> {
    return this.request<DriverApplication>(`/drivers/applications/${id}/review`, {
      method: 'POST',
      body: decision,
    });
  }
  async getDocumentUrl(path: string): Promise<string | null> {
    try {
      const r = await this.request<{ url: string }>(
        `/drivers/documents?path=${encodeURIComponent(path)}`,
      );
      return r.url ?? null;
    } catch {
      return null;
    }
  }

  /* ---- Notificações ---- */
  getNotifications(_userId: string): Promise<AppNotification[]> {
    return this.request<AppNotification[]>('/notifications');
  }
  async markNotificationRead(id: string): Promise<void> {
    await this.request(`/notifications/${id}/read`, { method: 'POST' });
  }

  /* ---- Realtime (polling) ---- */
  private poll<T>(fetcher: () => Promise<T>, cb: (v: T) => void, intervalMs: number): Unsubscribe {
    let active = true;
    const tick = async () => {
      if (!active) return;
      try {
        const v = await fetcher();
        if (active) cb(v);
      } catch {
        /* silencioso — tenta de novo no próximo ciclo */
      }
    };
    void tick();
    const timer = setInterval(tick, intervalMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }

  subscribeOrder(orderId: string, cb: (order: Order) => void): Unsubscribe {
    return this.poll(
      async () => (await this.getOrder(orderId))!,
      (o) => o && cb(o),
      2000,
    );
  }
  subscribeOrders(cb: (orders: Order[]) => void): Unsubscribe {
    return this.poll(() => this.getAllOrders(), cb, 2500);
  }
  subscribeAvailableDeliveries(cb: (orders: Order[]) => void): Unsubscribe {
    return this.poll(() => this.getAvailableDeliveries(), cb, 3000);
  }
}
