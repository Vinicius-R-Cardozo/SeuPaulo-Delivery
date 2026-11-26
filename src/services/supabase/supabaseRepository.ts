import type {
  Address,
  AppNotification,
  ApplicationAddress,
  ApplicationDocument,
  AutoAnalysisResult,
  BikeInfo,
  Category,
  CnhInfo,
  Coupon,
  Driver,
  DriverApplication,
  DriverStatus,
  LatLng,
  MotoInfo,
  Order,
  OrderStatus,
  Product,
  Profile,
  ReviewEvent,
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
import type { CapturedMedia } from '@/components/onboarding/capture';
import { getSupabase, isSupabaseConfigured } from './client';
import { estimateEtaMinutes } from '@/utils/geo';
import { hasRole } from '@/utils/roles';
import { orderCode, uuid } from '@/utils/id';
import { RESTAURANT } from '@/data/restaurant';

const DOCS_BUCKET = 'driver-docs';

/*
 * Implementação real contra o Supabase (Postgres + Auth + Realtime).
 * Os nomes de tabela/coluna casam com supabase/migrations/0001_init.sql.
 * A segurança de verdade vem das políticas RLS — o frontend nunca é a
 * fronteira de confiança.
 */

/* --------------------------- Mapeadores --------------------------- */

type Row = Record<string, unknown>;

function toProfile(r: Row): Profile {
  return {
    id: r.id as string,
    role: r.role as Profile['role'],
    customerEnabled: r.customer_enabled === true,
    fullName: r.full_name as string,
    email: r.email as string,
    phone: (r.phone as string) ?? '',
    createdAt: r.created_at as string,
    avatarUrl: (r.avatar_url as string) ?? null,
  };
}

function toAddress(r: Row): Address {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    label: r.label as Address['label'],
    street: r.street as string,
    number: r.number as string,
    complement: (r.complement as string) ?? undefined,
    reference: (r.reference as string) ?? undefined,
    neighborhood: r.neighborhood as string,
    city: r.city as string,
    state: r.state as string,
    zip: (r.zip as string) ?? undefined,
    lat: Number(r.lat),
    lng: Number(r.lng),
    isDefault: Boolean(r.is_default),
    createdAt: r.created_at as string,
  };
}

function toProduct(r: Row): Product {
  return {
    id: r.id as string,
    categorySlug: r.category_slug as Product['categorySlug'],
    name: r.name as string,
    description: (r.description as string) ?? '',
    price: Number(r.price),
    image: (r.image as string) ?? '',
    available: Boolean(r.available),
    availableWeekdays: (r.available_weekdays as number[] | null) ?? null,
    serves: (r.serves as string) ?? undefined,
    tags: (r.tags as string[]) ?? [],
    popular: Boolean(r.popular),
    isNew: Boolean(r.is_new),
    addonGroups: (r.addon_groups as Product['addonGroups']) ?? [],
  };
}

function toCoupon(r: Row): Coupon {
  return {
    code: r.code as string,
    description: (r.description as string) ?? '',
    type: r.type as Coupon['type'],
    value: Number(r.value),
    minSubtotal: Number(r.min_subtotal),
    maxUses: Number(r.max_uses),
    usedCount: Number(r.used_count),
    expiresAt: r.expires_at as string,
    active: Boolean(r.active),
  };
}

function toDriver(r: Row): Driver {
  return {
    id: r.id as string,
    vehicleType: r.vehicle_type as Driver['vehicleType'],
    plate: r.plate as string,
    model: r.model as string,
    color: r.color as string,
    status: r.status as DriverStatus,
    online: Boolean(r.online),
    location:
      r.location_lat != null && r.location_lng != null
        ? { lat: Number(r.location_lat), lng: Number(r.location_lng) }
        : null,
    rating: Number(r.rating ?? 0),
    totalDeliveries: Number(r.total_deliveries ?? 0),
    createdAt: r.created_at as string,
  };
}

function toOrder(r: Row): Order {
  return {
    id: r.id as string,
    code: r.code as string,
    customerId: r.customer_id as string,
    customerName: r.customer_name as string,
    customerPhone: (r.customer_phone as string) ?? '',
    items: (r.items as Order['items']) ?? [],
    fulfillment: r.fulfillment as Order['fulfillment'],
    address: (r.address as Address) ?? null,
    subtotal: Number(r.subtotal),
    deliveryFee: Number(r.delivery_fee),
    discount: Number(r.discount),
    total: Number(r.total),
    couponCode: (r.coupon_code as string) ?? undefined,
    paymentMethod: r.payment_method as Order['paymentMethod'],
    paymentStatus: r.payment_status as Order['paymentStatus'],
    changeFor: r.change_for != null ? Number(r.change_for) : undefined,
    status: r.status as OrderStatus,
    statusHistory: (r.status_history as Order['statusHistory']) ?? [],
    driverId: (r.driver_id as string) ?? null,
    driverLocationAt: (r.driver_location_at as string) ?? null,
    driverLocation:
      r.driver_lat != null && r.driver_lng != null
        ? { lat: Number(r.driver_lat), lng: Number(r.driver_lng) }
        : null,
    etaMinutes: r.eta_minutes != null ? Number(r.eta_minutes) : null,
    deliveredAt: (r.delivered_at as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function toApplication(r: Row): DriverApplication {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    vehicle: r.vehicle as DriverApplication['vehicle'],
    status: r.status as DriverApplication['status'],
    adminConfirmed: Boolean(r.admin_confirmed),
    fullName: r.full_name as string,
    cpf: (r.cpf as string) ?? '',
    rg: (r.rg as string) ?? '',
    birthDate: (r.birth_date as string) ?? '',
    email: (r.email as string) ?? '',
    phone: (r.phone as string) ?? '',
    address: (r.address as ApplicationAddress) ?? {
      zip: '',
      street: '',
      number: '',
      neighborhood: '',
      city: '',
      state: '',
    },
    cnh: (r.cnh as CnhInfo) ?? null,
    moto: (r.moto as MotoInfo) ?? null,
    bike: (r.bike as BikeInfo) ?? null,
    documents: (r.documents as ApplicationDocument[]) ?? [],
    autoAnalysis: (r.auto_analysis as AutoAnalysisResult) ?? null,
    reviews: (r.reviews as ReviewEvent[]) ?? [],
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function toNotification(r: Row): AppNotification {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    audience: r.audience as AppNotification['audience'],
    title: r.title as string,
    body: r.body as string,
    orderId: (r.order_id as string) ?? undefined,
    read: Boolean(r.read),
    createdAt: r.created_at as string,
  };
}

/* --------------------------- Repositório --------------------------- */

class SupabaseRepository implements DataRepository {
  private get sb() {
    return getSupabase();
  }

  private async profileFromUser(userId: string): Promise<Profile> {
    const { data, error } = await this.sb.from('profiles').select('*').eq('id', userId).single();
    if (error) throw new Error(error.message);
    const profile = toProfile(data);
    if (profile.role === 'customer') {
      const driverApplication = await this.sb.from('driver_applications').select('id')
        .eq('user_id', userId).limit(1).maybeSingle();
      if (driverApplication.error) throw new Error(driverApplication.error.message);
      profile.driverEnabled = Boolean(driverApplication.data);
    }
    return profile;
  }

  /* ---- Auth ---- */
  async getSession(): Promise<AuthSession | null> {
    if (!isSupabaseConfigured) return null;
    const { data } = await this.sb.auth.getSession();
    if (!data.session) return null;
    const profile = await this.profileFromUser(data.session.user.id);
    return { profile };
  }

  async signIn(email: string, password: string, role?: Profile['role']): Promise<AuthSession> {
    const { data, error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error('E-mail ou senha incorretos.');
    // Cliente com e-mail ainda não verificado não entra como conta ativa.
    if (!data.user.email_confirmed_at) {
      await this.sb.auth.signOut();
      throw new Error('Confirme seu e-mail para entrar. Refaça o cadastro para receber um novo código.');
    }
    const profile = await this.profileFromUser(data.user.id);
    if (role && !hasRole(profile, role)) {
      await this.sb.auth.signOut();
      if (role === 'driver' && profile.role === 'customer')
        throw new Error('Complete o cadastro de entregador usando o e-mail e a senha da sua conta.');
      if (role === 'customer' && profile.role === 'driver')
        throw new Error('Ative o perfil de cliente em Criar conta, usando o e-mail e a senha da sua conta.');
      throw new Error('Esta conta não tem acesso a este ambiente.');
    }
    return { profile };
  }

  async signUp(input: SignUpInput): Promise<AuthSession> {
    const { data, error } = await this.sb.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: { full_name: input.fullName, phone: input.phone, role: input.role },
      },
    });
    if (error) {
      const m = error.message.toLowerCase();
      if (m.includes('rate limit')) {
        throw new Error(
          'Muitas tentativas de cadastro agora. Aguarde alguns minutos e tente de novo. ' +
            '(Dica: desative a confirmação de e-mail no Supabase para liberar o cadastro imediato.)',
        );
      }
      if (m.includes('already registered') || m.includes('already been registered')) {
        throw new Error('Já existe uma conta com este e-mail.');
      }
      throw new Error(error.message);
    }
    // Com a confirmação de e-mail LIGADA, o Supabase não devolve sessão no cadastro.
    // Sem sessão, o app não consegue operar (RLS). Avisamos de forma clara.
    if (!data.session) {
      throw new Error(
        'Conta criada, mas falta confirmar o e-mail. Para o cadastro entrar direto, ' +
          'desative a confirmação de e-mail no Supabase (Authentication → Providers → Email).',
      );
    }
    const userId = data.user!.id;
    // O gatilho handle_new_user cria a linha em profiles a partir do metadata.
    if (input.role === 'driver' && input.driver) {
      const { error: dErr } = await this.sb.from('drivers').insert({
        id: userId,
        vehicle_type: input.driver.vehicleType,
        plate: input.driver.plate.toUpperCase(),
        model: input.driver.model,
        color: input.driver.color,
        status: 'pending',
      });
      if (dErr) throw new Error(dErr.message);
    }
    const profile = await this.profileFromUser(userId);
    return { profile };
  }

  async signOut(): Promise<void> {
    await this.sb.auth.signOut();
  }

  async updateProfile(userId: string, patch: Partial<Profile>): Promise<Profile> {
    const { error } = await this.sb
      .from('profiles')
      .update({
        full_name: patch.fullName,
        phone: patch.phone,
        avatar_url: patch.avatarUrl,
      })
      .eq('id', userId);
    if (error) throw new Error(error.message);
    return this.profileFromUser(userId);
  }

  async changePassword(_userId: string, _current: string, next: string): Promise<void> {
    const { error } = await this.sb.auth.updateUser({ password: next });
    if (error) throw new Error(error.message);
  }

  async getProfileById(id: string): Promise<Profile | null> {
    const { data } = await this.sb.from('profiles').select('*').eq('id', id).maybeSingle();
    return data ? toProfile(data) : null;
  }

  async getCustomers(): Promise<Profile[]> {
    const { data, error } = await this.sb
      .from('profiles')
      .select('*')
      .or('role.eq.customer,and(role.eq.driver,customer_enabled.eq.true)')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data.map(toProfile);
  }

  /* ---- Verificação de e-mail no cadastro do cliente ---- */
  // A geração/validação do código roda na Edge Function `signup-code`
  // O código é guardado como HASH e nunca chega ao
  // frontend. Erros de negócio voltam como { error } (HTTP 200).
  private async callSignupFn<T>(body: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.sb.functions.invoke('signup-code', { body });
    if (error) {
      // tenta extrair a mensagem do corpo da resposta de erro
      let msg = 'Não foi possível concluir. Tente novamente.';
      try {
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === 'function') {
          const j = (await ctx.json()) as { error?: string };
          if (j?.error) msg = j.error;
        }
      } catch {
        /* mantém a mensagem padrão */
      }
      throw new Error(msg);
    }
    const res = data as { error?: string } & T;
    if (res && res.error) throw new Error(res.error);
    return res;
  }

  async startCustomerSignup(input: Parameters<DataRepository['startCustomerSignup']>[0]): Promise<{ expiresAt: string }> {
    return this.callSignupFn<{ expiresAt: string }>({
      action: 'request',
      email: input.email,
      password: input.password,
      fullName: input.fullName,
      phone: input.phone,
      legalAcceptance: input.legalAcceptance,
    });
  }

  async verifyCustomerEmail(email: string, code: string): Promise<void> {
    await this.callSignupFn({ action: 'verify', email, code });
  }

  async resendCustomerCode(email: string): Promise<{ expiresAt: string }> {
    return this.callSignupFn<{ expiresAt: string }>({ action: 'resend', email });
  }

  /* ---- Cardápio ---- */
  async getCategories(): Promise<Category[]> {
    const { data, error } = await this.sb.from('categories').select('*').order('sort_order');
    if (error) throw new Error(error.message);
    return data.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      emoji: r.emoji,
      sortOrder: r.sort_order,
    }));
  }
  async getProducts(): Promise<Product[]> {
    const { data, error } = await this.sb.from('products').select('*').order('name');
    if (error) throw new Error(error.message);
    return data.map(toProduct);
  }
  async getProduct(id: string): Promise<Product | null> {
    const { data } = await this.sb.from('products').select('*').eq('id', id).maybeSingle();
    return data ? toProduct(data) : null;
  }
  async upsertProduct(product: Product): Promise<Product> {
    const { data, error } = await this.sb
      .from('products')
      .upsert({
        id: product.id,
        category_slug: product.categorySlug,
        name: product.name,
        description: product.description,
        price: product.price,
        image: product.image,
        available: product.available,
        available_weekdays: product.availableWeekdays ?? null,
        serves: product.serves,
        tags: product.tags,
        popular: product.popular,
        is_new: product.isNew,
        addon_groups: product.addonGroups,
      })
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return toProduct(data);
  }
  async deleteProduct(id: string): Promise<void> {
    const { error } = await this.sb.from('products').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }
  async setProductAvailability(id: string, available: boolean): Promise<void> {
    const { error } = await this.sb.from('products').update({ available }).eq('id', id);
    if (error) throw new Error(error.message);
  }

  /* ---- Endereços ---- */
  async getAddresses(userId: string): Promise<Address[]> {
    const { data, error } = await this.sb
      .from('addresses')
      .select('*')
      .eq('user_id', userId)
      .order('created_at');
    if (error) throw new Error(error.message);
    return data.map(toAddress);
  }
  async saveAddress(address: Address): Promise<Address> {
    if (address.isDefault) {
      await this.sb.from('addresses').update({ is_default: false }).eq('user_id', address.userId);
    }
    const { data, error } = await this.sb
      .from('addresses')
      .upsert({
        id: address.id,
        user_id: address.userId,
        label: address.label,
        street: address.street,
        number: address.number,
        complement: address.complement,
        reference: address.reference,
        neighborhood: address.neighborhood,
        city: address.city,
        state: address.state,
        zip: address.zip,
        lat: address.lat,
        lng: address.lng,
        is_default: address.isDefault,
      })
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return toAddress(data);
  }
  async deleteAddress(id: string): Promise<void> {
    const { error } = await this.sb.from('addresses').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }
  async setDefaultAddress(userId: string, addressId: string): Promise<void> {
    await this.sb.from('addresses').update({ is_default: false }).eq('user_id', userId);
    await this.sb.from('addresses').update({ is_default: true }).eq('id', addressId);
  }

  /* ---- Cupons ---- */
  async getCoupons(): Promise<Coupon[]> {
    const { data, error } = await this.sb.from('coupons').select('*');
    if (error) throw new Error(error.message);
    return data.map(toCoupon);
  }
  async validateCoupon(code: string, subtotal: number): Promise<Coupon> {
    const { data } = await this.sb
      .from('coupons')
      .select('*')
      .ilike('code', code.trim())
      .maybeSingle();
    if (!data) throw new Error('Cupom não encontrado.');
    const c = toCoupon(data);
    if (!c.active) throw new Error('Cupom inativo.');
    if (new Date(c.expiresAt).getTime() < Date.now()) throw new Error('Cupom expirado.');
    if (c.usedCount >= c.maxUses) throw new Error('Cupom esgotado.');
    if (subtotal < c.minSubtotal)
      throw new Error(
        `Pedido mínimo de R$ ${c.minSubtotal.toFixed(2).replace('.', ',')} para este cupom.`,
      );
    return c;
  }

  /* ---- Pedidos ---- */
  async createOrder(input: CreateOrderInput): Promise<Order> {
    if (input.paymentMethod === 'pix') throw new Error('PIX indisponível no momento.');
    // Production validates prices, address ownership and coupons inside place_order.
    const request = {
      p_items: input.items.map(({ id, product, quantity, addons, notes }) => ({
        id, productId: product.id, quantity, notes,
        addons: addons.map(({ groupId, optionId }) => ({ groupId, optionId })),
      })),
      p_fulfillment: input.fulfillment,
      p_address_id: input.address?.id ?? null,
      p_payment_method: input.paymentMethod,
      p_coupon_code: input.couponCode ?? null,
      p_change_for: input.changeFor ?? null,
      p_expected_total: input.total,
      p_idempotency_key: input.idempotencyKey,
    };
    const placed = await this.sb.rpc('place_order', request);
    if (!placed.error) return toOrder(placed.data);
    // Older installations only support the RLS-protected insert path.
    if (placed.error.code !== 'PGRST202') throw new Error(placed.error.message);

    const productIds = [...new Set(input.items.map((item) => item.product.id))];
    if (productIds.length === 0) throw new Error('Adicione um item ao carrinho.');

    const { data: available, error: catalogError } = await this.sb
      .from('products')
      .select('id')
      .in('id', productIds)
      .eq('available', true);
    if (catalogError) throw new Error('Não foi possível confirmar a disponibilidade dos itens.');
    if (available.length !== productIds.length) {
      throw new Error('Remova os itens indisponíveis do carrinho para continuar.');
    }

    const iso = new Date().toISOString();
    const payload = {
      code: orderCode(),
      customer_id: input.customer.id,
      customer_name: input.customer.fullName,
      customer_phone: input.customer.phone,
      items: input.items,
      fulfillment: input.fulfillment,
      address: input.address,
      subtotal: input.subtotal,
      delivery_fee: input.deliveryFee,
      discount: input.discount,
      total: input.total,
      coupon_code: input.couponCode,
      payment_method: input.paymentMethod,
      payment_status: 'pending',
      change_for: input.changeFor,
      status: 'received' as OrderStatus,
      status_history: [{ status: 'received', at: iso }],
      eta_minutes: input.address
        ? estimateEtaMinutes({ lat: input.address.lat, lng: input.address.lng })
        : RESTAURANT.avgPrepMinutes,
    };
    const { data, error } = await this.sb.from('orders').insert(payload).select('*').single();
    if (error) throw new Error(error.message);
    return toOrder(data);
  }

  async getOrder(id: string): Promise<Order | null> {
    const { data } = await this.sb.from('orders').select('*').eq('id', id).maybeSingle();
    return data ? toOrder(data) : null;
  }
  async getOrdersByCustomer(customerId: string): Promise<Order[]> {
    const { data, error } = await this.sb
      .from('orders')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data.map(toOrder);
  }
  async getOrdersByDriver(driverId: string): Promise<Order[]> {
    const { data, error } = await this.sb
      .from('orders')
      .select('*')
      .eq('driver_id', driverId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data.map(toOrder);
  }
  async getAllOrders(): Promise<Order[]> {
    const { data, error } = await this.sb
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data.map(toOrder);
  }
  async getAvailableDeliveries(): Promise<Order[]> {
    const { data: { session } } = await this.sb.auth.getSession();
    if (!session) return [];
    const { data, error } = await this.sb
      .from('orders')
      .select('*')
      .is('driver_id', null)
      .neq('customer_id', session.user.id)
      .in('status', ['confirmed','preparing','ready'])
      .eq('fulfillment', 'delivery');
    if (error) throw new Error(error.message);
    return data.map(toOrder);
  }

  async updateOrderStatus(id: string, status: OrderStatus, note?: string): Promise<Order> {
    const { data, error } = await this.sb.rpc('advance_order', {
      p_order_id: id, p_status: status, p_note: note ?? null,
    });
    if (error) throw new Error(error.message);
    return toOrder(data);
  }

  async cancelOrder(id: string, reason?: string): Promise<Order> {
    return this.updateOrderStatus(id, 'cancelled', reason);
  }

  async getDeliveryCode(orderId: string): Promise<string | null> {
    const { data } = await this.sb
      .from('order_delivery_codes')
      .select('code')
      .eq('order_id', orderId)
      .maybeSingle();
    return (data?.code as string) ?? null;
  }

  async confirmDelivery(orderId: string, code: string): Promise<{ ok: boolean; error?: string }> {
    // A validação (motorista atribuído + código + status) acontece no backend
    // (função confirm_delivery, SECURITY DEFINER). O frontend só repassa.
    const { data, error } = await this.sb.rpc('confirm_delivery', {
      p_order_id: orderId,
      p_code: code,
    });
    if (error) return { ok: false, error: error.message };
    const res = data as { ok: boolean; error?: string } | null;
    return res ?? { ok: false, error: 'Resposta inválida do servidor.' };
  }



  /* ---- Entregadores ---- */
  async getDrivers(): Promise<Driver[]> {
    const { data, error } = await this.sb.from('drivers').select('*');
    if (error) throw new Error(error.message);
    return data.map(toDriver);
  }
  async getDriver(id: string): Promise<Driver | null> {
    const { data, error } = await this.sb.from('drivers').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toDriver(data) : null;
  }
  async setDriverStatus(id: string, status: DriverStatus): Promise<Driver> {
    const { data, error } = await this.sb
      .from('drivers')
      .update({ status })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return toDriver(data);
  }
  async setDriverOnline(id: string, online: boolean): Promise<Driver> {
    const { data, error } = await this.sb
      .from('drivers')
      .update({ online })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return toDriver(data);
  }
  async setDriverLocation(id: string, location: LatLng): Promise<Driver> {
    const { data, error } = await this.sb
      .from('drivers')
      .update({ location_lat: location.lat, location_lng: location.lng })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return toDriver(data);
  }

  /* ---- Cadastro/onboarding de entregador ---- */
  async registerDriver(input: DriverApplicationInput): Promise<DriverRegistration> {
    // Reuse a verified customer identity or create an identity for a new driver.
    const credentials = await this.callSignupFn<{ access_token: string; refresh_token: string }>({
      action: 'driver-account', email: input.email, password: input.password,
      fullName: input.fullName, phone: input.phone,
      legalAcceptance: input.legalAcceptance,
    });
    const { data, error } = await this.sb.auth.setSession(credentials);
    if (error || !data.user) throw new Error('Não foi possível entrar na conta. Tente novamente.');
    const userId = data.user.id;
    const { data: existing, error: lookupError } = await this.sb.from('driver_applications')
      .select('id').eq('user_id', userId).limit(1).maybeSingle();
    if (lookupError) throw new Error(lookupError.message);
    if (existing) throw new Error('Seu cadastro de entregador já foi enviado. Entre para acompanhar.');

    // 2. Cria o entregador como pendente (só o admin aprova).
    const { error: dErr } = await this.sb.from('drivers').insert({
      id: userId,
      vehicle_type: input.vehicle,
      plate: (input.moto?.plate ?? '').toUpperCase() || 'N/A',
      model:
        input.vehicle === 'moto'
          ? `${input.moto?.brand ?? ''} ${input.moto?.model ?? ''}`.trim()
          : `Bicicleta ${input.bike?.kind === 'eletrica' ? 'elétrica' : 'convencional'}`,
      color: (input.moto?.color ?? input.bike?.color ?? '').trim(),
      status: 'pending',
    });
    if (dErr && !dErr.message.toLowerCase().includes('duplicate')) {
      throw new Error(dErr.message);
    }

    // 3. Envia os documentos para o bucket PRIVADO (pasta = id do usuário).
    const nowIso = new Date().toISOString();
    const documents: ApplicationDocument[] = [];
    const submission = uuid();
    for (const m of input.documents) {
      const path = `${userId}/${submission}/${m.kind}.jpg`;
      const { error: upErr } = await this.sb.storage
        .from(DOCS_BUCKET)
        .upload(path, m.blob, { contentType: m.mime, upsert: true });
      if (upErr) throw new Error(`Falha ao enviar o arquivo (${m.kind}): ${upErr.message}`);
      documents.push({ kind: m.kind, path, uploadedAt: nowIso, ocr: null });
    }

    // O painel recebe a candidatura pendente para análise dos documentos.
    const reviews: ReviewEvent[] = [
      { at: nowIso, by: userId, action: 'submitted', status: 'manual_review' },
    ];

    const { data: appRow, error: appErr } = await this.sb
      .from('driver_applications')
      .insert({
        user_id: userId,
        vehicle: input.vehicle,
        status: 'manual_review',
        admin_confirmed: false,
        full_name: input.fullName,
        cpf: input.cpf.replace(/\D/g, ''),
        birth_date: input.birthDate,
        email: data.user.email,
        phone: input.phone,
        address: input.address,
        cnh: input.cnh,
        moto: input.moto ?? null,
        bike: input.bike ?? null,
        documents,
        reviews,
      })
      .select('*')
      .single();
    if (appErr) {
      if (appErr.code === '23505' && appErr.message.includes('driver_applications_one_per_user')) {
        throw new Error('Seu cadastro de entregador já foi enviado. Entre para acompanhar.');
      }
      if (appErr.code === '23505') {
        throw new Error('Já existe um cadastro de entregador com este CPF.');
      }
      throw new Error(appErr.message);
    }

    const profile = await this.profileFromUser(userId);
    return { profile, application: toApplication(appRow) };
  }

  async resubmitDriverDocuments(application: DriverApplication, documents: CapturedMedia[]): Promise<DriverApplication> {
    const uploadId = uuid();
    for (const document of documents) {
      const path = `${application.userId}/reenvios/${uploadId}/${document.kind}.jpg`;
      const { error } = await this.sb.storage
        .from(DOCS_BUCKET)
        .upload(path, document.blob, { contentType: document.mime, upsert: false });
      if (error) throw new Error('Não foi possível enviar as imagens. Verifique sua conexão e tente novamente.');
    }

    const { data, error } = await this.sb.rpc('resubmit_driver_documents', {
      p_application: application.id,
      p_expected_updated_at: application.updatedAt,
      p_upload: uploadId,
      p_kinds: documents.map((document) => document.kind),
    });
    if (error?.code === 'P0001') throw new Error(error.message);
    if (error || !data) throw new Error('Não foi possível confirmar o reenvio. Tente novamente.');
    return toApplication(data as Row);
  }

  async getDriverApplication(userId: string): Promise<DriverApplication | null> {
    const { data } = await this.sb
      .from('driver_applications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ? toApplication(data) : null;
  }

  async getDriverApplications(): Promise<DriverApplication[]> {
    const { data, error } = await this.sb
      .from('driver_applications')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data.map(toApplication);
  }

  async reviewDriverApplication(
    id: string,
    decision: ReviewDecision,
    _adminId: string,
  ): Promise<DriverApplication> {
    const { data, error } = await this.sb.rpc('review_driver_application', {
      p_id: id,
      p_action: decision.action,
      p_reason: decision.reason ?? null,
    });
    if (error) throw new Error(error.message);
    return toApplication(data as Row);
  }

  async getDocumentUrl(path: string): Promise<string | null> {
    const { data, error } = await this.sb.storage.from(DOCS_BUCKET).createSignedUrl(path, 3600);
    if (error) return null;
    return data?.signedUrl ?? null;
  }

  /* ---- Notificações ---- */
  async getNotifications(userId: string): Promise<AppNotification[]> {
    const { data, error } = await this.sb
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data.map(toNotification);
  }
  async markNotificationRead(id: string): Promise<void> {
    await this.sb.from('notifications').update({ read: true }).eq('id', id);
  }

  /* ---- Realtime ---- */
  private tableFeed<T>(
    table: 'orders' | 'drivers',
    name: string,
    read: () => Promise<T>,
    cb: (value: T) => void,
    filter?: string,
    fallbackMs = table === 'drivers' ? 5000 : 10000,
  ): Unsubscribe {
    let active = true;
    let reading = false;
    let again = false;
    const refresh = async () => {
      if (!active || document.hidden) return;
      if (reading) { again = true; return; }
      reading = true;
      try {
        const value = await read();
        if (active) cb(value);
      } catch {
        // A reconnect, visibility change or the periodic refresh will retry.
      } finally {
        reading = false;
        if (again) { again = false; void refresh(); }
      }
    };
    const channel = this.sb.channel(name)
      .on('postgres_changes', { event: '*', schema: 'public', table, filter }, refresh)
      .subscribe(state => { if (state === 'SUBSCRIBED') void refresh(); });
    void refresh();
    const timer = window.setInterval(refresh, fallbackMs);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('online', refresh);
      void this.sb.removeChannel(channel);
    };
  }
  subscribeDriver(id: string, cb: (driver: Driver | null) => void): Unsubscribe {
    return this.tableFeed('drivers', 'driver:' + id, () => this.getDriver(id), cb, 'id=eq.' + id);
  }
  subscribeOrder(orderId: string, cb: (order: Order | null) => void): Unsubscribe {
    return this.tableFeed('orders', 'order:' + orderId, () => this.getOrder(orderId), cb, 'id=eq.' + orderId);
  }
  subscribeOrders(cb: (orders: Order[]) => void): Unsubscribe {
    return this.tableFeed('orders', 'orders:all', () => this.getAllOrders(), cb);
  }
  subscribeAvailableDeliveries(cb: (orders: Order[]) => void): Unsubscribe {
    return this.tableFeed('orders', 'orders:available', () => this.getAvailableDeliveries(), cb, undefined, 4000);
  }
}

let instance: SupabaseRepository | null = null;
export function getSupabaseRepository(): DataRepository {
  if (!instance) instance = new SupabaseRepository();
  return instance;
}
