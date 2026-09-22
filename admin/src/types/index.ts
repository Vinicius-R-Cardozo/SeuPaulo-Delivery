/**
 * Modelo de domínio do Seu Paulo Delivery.
 * Tipos compartilhados entre os três ambientes (cliente, entregador, admin)
 * e entre a camada mock (localStorage) e a integração com o Supabase.
 */

export type Role = 'customer' | 'driver' | 'admin';

export interface Profile {
  id: string;
  role: Role;
  fullName: string;
  email: string;
  phone: string;
  createdAt: string;
  avatarUrl?: string | null;
}

/* ----------------------------- Endereços ----------------------------- */

export type AddressLabel = 'casa' | 'trabalho' | 'outro';

export interface Address {
  id: string;
  userId: string;
  label: AddressLabel;
  street: string;
  number: string;
  complement?: string;
  reference?: string;
  neighborhood: string;
  city: string;
  state: string;
  zip?: string;
  lat: number;
  lng: number;
  isDefault: boolean;
  createdAt: string;
}

/* ------------------------------ Cardápio ------------------------------ */

export type CategorySlug =
  | 'mais-pedidos'
  | 'petiscos'
  | 'porcoes'
  | 'pratos'
  | 'lanches'
  | 'drinks'
  | 'cervejas'
  | 'bebidas';

export interface Category {
  id: string;
  slug: CategorySlug;
  name: string;
  emoji: string;
  sortOrder: number;
}

export interface AddonOption {
  id: string;
  name: string;
  price: number;
}

/**
 * Grupo de personalização de um produto.
 * - `single`: escolha única (ex.: ponto da carne, tamanho)
 * - `multiple`: vários itens (ex.: adicionais, remover ingredientes)
 */
export interface AddonGroup {
  id: string;
  name: string;
  type: 'single' | 'multiple';
  required: boolean;
  min: number;
  max: number;
  options: AddonOption[];
}

export interface Product {
  id: string;
  categorySlug: CategorySlug;
  name: string;
  description: string;
  price: number;
  image: string;
  available: boolean;
  serves?: string;
  tags?: string[];
  popular?: boolean;
  isNew?: boolean;
  addonGroups: AddonGroup[];
}

/* ------------------------------ Carrinho ------------------------------ */

export interface SelectedAddon {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  price: number;
}

export interface CartItem {
  id: string; // uid da linha do carrinho (produto + adicionais formam linhas distintas)
  product: Product;
  quantity: number;
  addons: SelectedAddon[];
  notes?: string;
  /** Preço unitário já com adicionais. */
  unitPrice: number;
}

/* -------------------------------- Cupons ------------------------------ */

export type CouponType = 'percent' | 'fixed';

export interface Coupon {
  code: string;
  description: string;
  type: CouponType;
  value: number;
  minSubtotal: number;
  maxUses: number;
  usedCount: number;
  expiresAt: string;
  active: boolean;
}

/* -------------------------------- Pedidos ----------------------------- */

export type OrderStatus =
  | 'received' // 🟡 Pedido recebido
  | 'confirmed' // 🟠 Pedido confirmado
  | 'preparing' // 👨‍🍳 Em preparo
  | 'ready' // 📦 Pronto para entrega
  | 'on_the_way' // 🛵 Saiu para entrega
  | 'arrived' // 🛎️ Motorista chegou (aguardando código)
  | 'delivered' // 🟢 Entregue
  | 'cancelled'; // ⚫ Cancelado

export type FulfillmentType = 'delivery' | 'pickup';

export type PaymentMethod = 'pix' | 'card' | 'cash';

export type PaymentStatus = 'pending' | 'approved' | 'failed' | 'refunded';

export interface OrderStatusEvent {
  status: OrderStatus;
  at: string;
  note?: string;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Order {
  id: string;
  code: string; // código curto legível: #A1B2
  customerId: string;
  customerName: string;
  customerPhone: string;
  items: CartItem[];
  fulfillment: FulfillmentType;
  address: Address | null; // null quando retirada no local
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  couponCode?: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  changeFor?: number; // troco para (dinheiro)
  status: OrderStatus;
  statusHistory: OrderStatusEvent[];
  driverId: string | null;
  driverLocation: LatLng | null;
  etaMinutes: number | null;
  /** Código de entrega (visível só para o cliente, perto da entrega). */
  deliveryCode?: string | null;
  deliveredAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------ Entregador ---------------------------- */

export type DriverStatus = 'pending' | 'approved' | 'rejected' | 'blocked';

// 'carro' foi descontinuado no cadastro; mantido no union apenas para não
// quebrar dados antigos. Novos cadastros usam DeliveryVehicle (bike/moto).
export type VehicleType = 'moto' | 'carro' | 'bicicleta';

export interface Driver {
  id: string; // = Profile.id
  vehicleType: VehicleType;
  plate: string;
  model: string;
  color: string;
  status: DriverStatus;
  online: boolean;
  location: LatLng | null;
  rating: number;
  totalDeliveries: number;
  createdAt: string;
}

/* ------------------ Cadastro de entregador (onboarding) ------------------ */

export type DeliveryVehicle = 'bicicleta' | 'moto';

export type BikeKind = 'convencional' | 'eletrica';

export type DriverApplicationStatus =
  | 'pending_documents'
  | 'under_analysis'
  | 'manual_review'
  | 'approved'
  | 'rejected'
  | 'needs_resubmission';

export type DocumentKind =
  | 'selfie'
  | 'id_document'
  | 'cnh_front'
  | 'cnh_back'
  | 'vehicle_doc'
  | 'vehicle_photo'
  | 'plate_photo'
  | 'bike_photo';

export interface ApplicationDocument {
  kind: DocumentKind;
  path: string;
  uploadedAt: string;
  ocr?: Record<string, string> | null;
}

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'skipped';

export interface VerificationCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail?: string;
}

export interface AutoAnalysisResult {
  recommendation: 'auto_approve' | 'manual_review' | 'reject';
  confidence: number | null;
  checks: VerificationCheck[];
  provider: string;
  analyzedAt: string;
}

export type ReviewAction =
  | 'submitted'
  | 'auto_analysis'
  | 'approved'
  | 'rejected'
  | 'resubmission_requested';

export interface ReviewEvent {
  at: string;
  by: string;
  action: ReviewAction;
  status: DriverApplicationStatus;
  reason?: string;
}

export interface ApplicationAddress {
  zip: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
}

export interface CnhInfo {
  number: string;
  category: string;
  expiresAt: string;
}

export interface MotoInfo {
  brand: string;
  model: string;
  year: string;
  color: string;
  plate: string;
  renavam?: string;
}

export interface BikeInfo {
  kind: BikeKind;
  brand?: string;
  model?: string;
  color: string;
}

export interface DriverApplication {
  id: string;
  userId: string;
  vehicle: DeliveryVehicle;
  status: DriverApplicationStatus;
  /** true = confirmado por um admin; false = aprovado automaticamente e aguardando a mini-aprovação. */
  adminConfirmed: boolean;
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
  documents: ApplicationDocument[];
  autoAnalysis: AutoAnalysisResult | null;
  reviews: ReviewEvent[];
  createdAt: string;
  updatedAt: string;
}

/* ---------------------------- Notificações ---------------------------- */

export type NotificationAudience = Role;

export interface AppNotification {
  id: string;
  userId: string;
  audience: NotificationAudience;
  title: string;
  body: string;
  orderId?: string;
  read: boolean;
  createdAt: string;
}
