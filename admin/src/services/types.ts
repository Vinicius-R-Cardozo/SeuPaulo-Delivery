import type {
  Address,
  AppNotification,
  Category,
  Coupon,
  Driver,
  Order,
  OrderStatus,
  Product,
  Profile,
  Role,
  CartItem,
  FulfillmentType,
  PaymentMethod,
  LatLng,
  DriverStatus,
  DeliveryVehicle,
  DriverApplication,
  ApplicationAddress,
  CnhInfo,
  MotoInfo,
  BikeInfo,
  DocumentKind,
} from '@/types';

export interface AuthSession {
  profile: Profile;
}

/* ------------------ Cadastro de entregador (onboarding) ------------------ */

export interface CapturedDocument {
  kind: DocumentKind;
  blob: Blob;
  dataUrl: string;
  mime: string;
  sizeBytes: number;
  width: number;
  height: number;
}

export interface DriverApplicationInput {
  password: string;
  vehicle: DeliveryVehicle;
  fullName: string;
  cpf: string;
  rg: string;
  birthDate: string;
  email: string;
  phone: string;
  address: ApplicationAddress;
  cnh?: CnhInfo | null;
  moto?: MotoInfo | null;
  bike?: BikeInfo | null;
  documents: CapturedDocument[];
}

export interface DriverRegistration {
  profile: Profile;
  application: DriverApplication;
}

export interface ReviewDecision {
  // 'confirm' = mini-aprovação de um cadastro já aprovado automaticamente.
  action: 'approve' | 'confirm' | 'reject' | 'request_resubmission';
  reason?: string;
}

export interface SignUpInput {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  role: Role;
  /** dados extras do entregador */
  driver?: {
    vehicleType: Driver['vehicleType'];
    plate: string;
    model: string;
    color: string;
  };
}

export interface CreateOrderInput {
  customer: Profile;
  items: CartItem[];
  fulfillment: FulfillmentType;
  address: Address | null;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  couponCode?: string;
  paymentMethod: PaymentMethod;
  changeFor?: number;
}

export type Unsubscribe = () => void;

/**
 * Contrato único de dados. A UI só conhece esta interface — nunca o Supabase
 * nem o localStorage diretamente. Isso permite trocar o backend por env var.
 */
export interface DataRepository {
  /* ---- Auth ---- */
  getSession(): Promise<AuthSession | null>;
  signIn(email: string, password: string, role?: Role): Promise<AuthSession>;
  signUp(input: SignUpInput): Promise<AuthSession>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  resetPassword(email: string, newPassword: string): Promise<void>;
  updateProfile(userId: string, patch: Partial<Profile>): Promise<Profile>;
  changePassword(userId: string, current: string, next: string): Promise<void>;
  getProfileById(id: string): Promise<Profile | null>;
  getCustomers(): Promise<Profile[]>;

  /* ---- Cardápio ---- */
  getCategories(): Promise<Category[]>;
  getProducts(): Promise<Product[]>;
  getProduct(id: string): Promise<Product | null>;
  upsertProduct(product: Product): Promise<Product>;
  deleteProduct(id: string): Promise<void>;
  setProductAvailability(id: string, available: boolean): Promise<void>;

  /* ---- Endereços ---- */
  getAddresses(userId: string): Promise<Address[]>;
  saveAddress(address: Address): Promise<Address>;
  deleteAddress(id: string): Promise<void>;
  setDefaultAddress(userId: string, addressId: string): Promise<void>;

  /* ---- Cupons ---- */
  getCoupons(): Promise<Coupon[]>;
  validateCoupon(code: string, subtotal: number): Promise<Coupon>;

  /* ---- Pedidos ---- */
  createOrder(input: CreateOrderInput): Promise<Order>;
  getOrder(id: string): Promise<Order | null>;
  getOrdersByCustomer(customerId: string): Promise<Order[]>;
  getOrdersByDriver(driverId: string): Promise<Order[]>;
  getAllOrders(): Promise<Order[]>;
  /** pedidos prontos e ainda sem entregador atribuído */
  getAvailableDeliveries(): Promise<Order[]>;
  updateOrderStatus(id: string, status: OrderStatus, note?: string): Promise<Order>;
  assignDriver(orderId: string, driverId: string): Promise<Order>;
  cancelOrder(id: string, reason?: string): Promise<Order>;
  /** Código de entrega do pedido — só o cliente dono consegue ler (RLS). */
  getDeliveryCode(orderId: string): Promise<string | null>;
  /** Confirma a entrega validando o código no backend (não no frontend). */
  confirmDelivery(orderId: string, code: string): Promise<{ ok: boolean; error?: string }>;
  updateDriverLocation(orderId: string, location: LatLng): Promise<void>;

  /* ---- Entregadores ---- */
  getDrivers(): Promise<Driver[]>;
  getDriver(id: string): Promise<Driver | null>;
  setDriverStatus(id: string, status: DriverStatus): Promise<Driver>;
  setDriverOnline(id: string, online: boolean): Promise<Driver>;
  setDriverLocation(id: string, location: LatLng): Promise<Driver>;

  /* ---- Cadastro/onboarding de entregador ---- */
  registerDriver(input: DriverApplicationInput): Promise<DriverRegistration>;
  getDriverApplication(userId: string): Promise<DriverApplication | null>;
  getDriverApplications(): Promise<DriverApplication[]>;
  reviewDriverApplication(
    id: string,
    decision: ReviewDecision,
    adminId: string,
  ): Promise<DriverApplication>;
  getDocumentUrl(path: string): Promise<string | null>;

  /* ---- Notificações ---- */
  getNotifications(userId: string): Promise<AppNotification[]>;
  markNotificationRead(id: string): Promise<void>;

  /* ---- Realtime ---- */
  subscribeOrder(orderId: string, cb: (order: Order) => void): Unsubscribe;
  subscribeOrders(cb: (orders: Order[]) => void): Unsubscribe;
  subscribeAvailableDeliveries(cb: (orders: Order[]) => void): Unsubscribe;

  /** Nome legível do backend ativo (para debug/README). */
  readonly backendName: string;
}
