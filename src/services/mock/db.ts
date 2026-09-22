import type {
  Address,
  AppNotification,
  Coupon,
  Driver,
  DriverApplication,
  Order,
  Profile,
} from '@/types';
import { CATEGORIES, PRODUCTS } from '@/data/menu';
import { RESTAURANT } from '@/data/restaurant';
import type { Product } from '@/types';

/**
 * Estado persistido do backend mock (localStorage).
 * ATENÇÃO: as senhas aqui são texto puro apenas porque este é um backend de
 * demonstração local. Em produção a autenticação é feita pelo Supabase Auth,
 * que faz o hash das senhas — veja src/services/supabase.
 */
export interface MockState {
  version: number;
  profiles: Profile[];
  credentials: Record<string, string>; // email -> senha (somente mock)
  products: Product[];
  addresses: Address[];
  coupons: Coupon[];
  orders: Order[];
  drivers: Driver[];
  driverApplications: DriverApplication[];
  notifications: AppNotification[];
}

const STORAGE_KEY = 'spd_mock_v1';
const SCHEMA_VERSION = 2;

const daysAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString();

function seed(): MockState {
  const admin: Profile = {
    id: 'u-admin',
    role: 'admin',
    fullName: 'Paulo Administrador',
    email: 'admin@seupaulo.com',
    phone: '(31) 7352-9146',
    createdAt: daysAgo(120),
  };
  const customer: Profile = {
    id: 'u-cliente',
    role: 'customer',
    fullName: 'Maria Cliente',
    email: 'cliente@seupaulo.com',
    phone: '(31) 98888-1234',
    createdAt: daysAgo(30),
  };
  const driverProfile: Profile = {
    id: 'u-entregador',
    role: 'driver',
    fullName: 'João Entregador',
    email: 'entregador@seupaulo.com',
    phone: '(31) 97777-5678',
    createdAt: daysAgo(20),
  };
  const driverPending: Profile = {
    id: 'u-entregador2',
    role: 'driver',
    fullName: 'Carlos Novato',
    email: 'entregador2@seupaulo.com',
    phone: '(31) 96666-4321',
    createdAt: daysAgo(2),
  };

  const drivers: Driver[] = [
    {
      id: driverProfile.id,
      vehicleType: 'moto',
      plate: 'PWA1B23',
      model: 'Honda CG 160',
      color: 'Vermelha',
      status: 'approved',
      online: true,
      location: { lat: RESTAURANT.location.lat + 0.004, lng: RESTAURANT.location.lng - 0.003 },
      rating: 4.9,
      totalDeliveries: 342,
      createdAt: daysAgo(20),
    },
    {
      id: driverPending.id,
      vehicleType: 'moto',
      plate: 'QXR4C56',
      model: 'Yamaha Factor 150',
      color: 'Preta',
      status: 'pending',
      online: false,
      location: null,
      rating: 0,
      totalDeliveries: 0,
      createdAt: daysAgo(2),
    },
  ];

  const homeAddress: Address = {
    id: 'a-casa',
    userId: customer.id,
    label: 'casa',
    street: 'R. das Acácias',
    number: '245',
    complement: 'Apto 102',
    reference: 'Portão azul, ao lado da padaria',
    neighborhood: 'Angola',
    city: 'Betim',
    state: 'MG',
    zip: '32653-100',
    lat: RESTAURANT.location.lat + 0.012,
    lng: RESTAURANT.location.lng + 0.009,
    isDefault: true,
    createdAt: daysAgo(30),
  };
  const workAddress: Address = {
    id: 'a-trabalho',
    userId: customer.id,
    label: 'trabalho',
    street: 'Av. Governador Valadares',
    number: '1200',
    complement: 'Sala 3',
    neighborhood: 'Centro',
    city: 'Betim',
    state: 'MG',
    zip: '32600-000',
    lat: RESTAURANT.location.lat - 0.02,
    lng: RESTAURANT.location.lng + 0.016,
    isDefault: false,
    createdAt: daysAgo(15),
  };

  const coupons: Coupon[] = [
    {
      code: 'BEMVINDO10',
      description: '10% de desconto no primeiro pedido',
      type: 'percent',
      value: 10,
      minSubtotal: 30,
      maxUses: 1000,
      usedCount: 0,
      expiresAt: daysAgo(-90),
      active: true,
    },
    {
      code: 'SEUPAULO',
      description: 'R$ 15 off em pedidos acima de R$ 80',
      type: 'fixed',
      value: 15,
      minSubtotal: 80,
      maxUses: 500,
      usedCount: 0,
      expiresAt: daysAgo(-60),
      active: true,
    },
    {
      code: 'PROMOCAO',
      description: '20% off na semana do boteco',
      type: 'percent',
      value: 20,
      minSubtotal: 50,
      maxUses: 200,
      usedCount: 0,
      expiresAt: daysAgo(-30),
      active: true,
    },
  ];

  // Um pedido histórico entregue, para popular "Meus pedidos".
  const pastOrder: Order = {
    id: 'o-hist-1',
    code: '#K7P2',
    customerId: customer.id,
    customerName: customer.fullName,
    customerPhone: customer.phone,
    items: [
      {
        id: 'ci-1',
        product: PRODUCTS.find((p) => p.id === 'p-frango')!,
        quantity: 1,
        addons: [{ groupId: 'g-tam-porcao', groupName: 'Tamanho', optionId: 't-inteira', optionName: 'Porção inteira', price: 18 }],
        unitPrice: 62.9,
      },
      {
        id: 'ci-2',
        product: PRODUCTS.find((p) => p.id === 'p-brahma')!,
        quantity: 3,
        addons: [],
        unitPrice: 12.9,
      },
    ],
    fulfillment: 'delivery',
    address: homeAddress,
    subtotal: 101.6,
    deliveryFee: 6.9,
    discount: 0,
    total: 108.5,
    paymentMethod: 'pix',
    paymentStatus: 'approved',
    status: 'delivered',
    statusHistory: [
      { status: 'received', at: daysAgo(7) },
      { status: 'confirmed', at: daysAgo(7) },
      { status: 'preparing', at: daysAgo(7) },
      { status: 'ready', at: daysAgo(7) },
      { status: 'on_the_way', at: daysAgo(7) },
      { status: 'delivered', at: daysAgo(7) },
    ],
    driverId: driverProfile.id,
    driverLocation: null,
    etaMinutes: null,
    createdAt: daysAgo(7),
    updatedAt: daysAgo(7),
  };

  // Candidatura de exemplo (aguardando revisão manual) para popular o painel.
  const pendingApplication: DriverApplication = {
    id: 'app-carlos',
    userId: driverPending.id,
    vehicle: 'moto',
    status: 'manual_review',
    adminConfirmed: false,
    fullName: driverPending.fullName,
    cpf: '39053344705',
    rg: 'MG-12.345.678',
    birthDate: '15/04/1996',
    email: driverPending.email,
    phone: driverPending.phone,
    address: {
      zip: '32604-148',
      street: 'Rua Milton Vieira Pinto',
      number: '16',
      neighborhood: 'Angola',
      city: 'Betim',
      state: 'MG',
    },
    cnh: { number: '04812345678', category: 'AB', expiresAt: '10/12/2030' },
    moto: { brand: 'Yamaha', model: 'Factor 150', year: '2021', color: 'Preta', plate: 'QXR4C56' },
    bike: null,
    documents: [],
    autoAnalysis: {
      recommendation: 'manual_review',
      confidence: null,
      provider: 'triagem-interna',
      analyzedAt: daysAgo(2),
      checks: [
        { id: 'id:selfie:quality', label: 'Qualidade da selfie', status: 'pass' },
        {
          id: 'id:facematch',
          label: 'Selfie corresponde ao documento',
          status: 'skipped',
          detail: 'Comparação facial não configurada — verificar na revisão manual.',
        },
        {
          id: 'doc:cnh_front:ocr',
          label: 'Leitura automática (OCR) dos campos',
          status: 'skipped',
          detail: 'OCR não configurado — conferência manual.',
        },
      ],
    },
    reviews: [
      { at: daysAgo(2), by: driverPending.id, action: 'submitted', status: 'under_analysis' },
      { at: daysAgo(2), by: 'auto', action: 'auto_analysis', status: 'manual_review' },
    ],
    createdAt: daysAgo(2),
    updatedAt: daysAgo(2),
  };

  return {
    version: SCHEMA_VERSION,
    profiles: [admin, customer, driverProfile, driverPending],
    credentials: {
      'admin@seupaulo.com': 'Senha123',
      'cliente@seupaulo.com': 'Senha123',
      'entregador@seupaulo.com': 'Senha123',
      'entregador2@seupaulo.com': 'Senha123',
    },
    products: PRODUCTS,
    addresses: [homeAddress, workAddress],
    coupons,
    orders: [pastOrder],
    drivers,
    driverApplications: [pendingApplication],
    notifications: [],
  };
}

/* ------------------------- Persistência ------------------------- */

let state: MockState | null = null;
type Listener = () => void;
const listeners = new Set<Listener>();

function readStorage(): MockState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MockState;
    if (parsed.version !== SCHEMA_VERSION) return null;
    // O cardápio e as categorias são sempre a fonte estática mais recente,
    // exceto produtos criados/editados pelo admin (persistidos).
    return parsed;
  } catch {
    return null;
  }
}

function ensure(): MockState {
  if (state) return state;
  state = readStorage() ?? seed();
  persist();
  return state;
}

function persist(): void {
  if (!state) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota — ignora no mock */
  }
}

/** Aplica uma mutação, persiste e notifica os assinantes. */
export function mutate(fn: (s: MockState) => void): void {
  const s = ensure();
  fn(s);
  persist();
  listeners.forEach((l) => l());
}

export function getState(): MockState {
  return ensure();
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Reseta o backend mock ao estado inicial (usado no README/onboarding). */
export function resetMock(): void {
  state = seed();
  persist();
  listeners.forEach((l) => l());
}

export const CATEGORIES_SEED = CATEGORIES;
