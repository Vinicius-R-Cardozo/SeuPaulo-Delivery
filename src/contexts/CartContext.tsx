import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { CartItem, Coupon, Product, SelectedAddon } from '@/types';
import { uid } from '@/utils/id';

interface AddToCartArgs {
  product: Product;
  quantity: number;
  addons: SelectedAddon[];
  notes?: string;
}

interface CartContextValue {
  items: CartItem[];
  coupon: Coupon | null;
  itemCount: number;
  subtotal: number;
  discount: number;
  addItem: (args: AddToCartArgs) => void;
  updateQuantity: (lineId: string, quantity: number) => void;
  updateNotes: (lineId: string, notes: string) => void;
  removeItem: (lineId: string) => void;
  clear: () => void;
  applyCoupon: (coupon: Coupon) => void;
  removeCoupon: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = 'spd_cart_v1';

function computeUnitPrice(product: Product, addons: SelectedAddon[]): number {
  return product.price + addons.reduce((sum, a) => sum + a.price, 0);
}

/** Duas linhas são iguais se produto + adicionais + observação coincidem. */
function sameConfig(item: CartItem, args: AddToCartArgs): boolean {
  if (item.product.id !== args.product.id) return false;
  if ((item.notes ?? '') !== (args.notes ?? '')) return false;
  if (item.addons.length !== args.addons.length) return false;
  const a = item.addons.map((x) => x.optionId).sort().join(',');
  const b = args.addons.map((x) => x.optionId).sort().join(',');
  return a === b;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as CartItem[]) : [];
    } catch {
      return [];
    }
  });
  const [coupon, setCoupon] = useState<Coupon | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* ignore */
    }
  }, [items]);

  const addItem = useCallback((args: AddToCartArgs) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => sameConfig(i, args));
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], quantity: copy[idx].quantity + args.quantity };
        return copy;
      }
      const line: CartItem = {
        id: uid('ci'),
        product: args.product,
        quantity: args.quantity,
        addons: args.addons,
        notes: args.notes,
        unitPrice: computeUnitPrice(args.product, args.addons),
      };
      return [...prev, line];
    });
  }, []);

  const updateQuantity = useCallback((lineId: string, quantity: number) => {
    setItems((prev) =>
      quantity <= 0
        ? prev.filter((i) => i.id !== lineId)
        : prev.map((i) => (i.id === lineId ? { ...i, quantity } : i)),
    );
  }, []);

  const updateNotes = useCallback((lineId: string, notes: string) => {
    setItems((prev) => prev.map((i) => (i.id === lineId ? { ...i, notes } : i)));
  }, []);

  const removeItem = useCallback((lineId: string) => {
    setItems((prev) => prev.filter((i) => i.id !== lineId));
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    setCoupon(null);
  }, []);

  const subtotal = useMemo(
    () => items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
    [items],
  );

  const discount = useMemo(() => {
    if (!coupon) return 0;
    if (subtotal < coupon.minSubtotal) return 0;
    const raw = coupon.type === 'percent' ? (subtotal * coupon.value) / 100 : coupon.value;
    return Math.min(raw, subtotal);
  }, [coupon, subtotal]);

  const itemCount = useMemo(() => items.reduce((sum, i) => sum + i.quantity, 0), [items]);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      coupon,
      itemCount,
      subtotal,
      discount,
      addItem,
      updateQuantity,
      updateNotes,
      removeItem,
      clear,
      applyCoupon: setCoupon,
      removeCoupon: () => setCoupon(null),
    }),
    [items, coupon, itemCount, subtotal, discount, addItem, updateQuantity, updateNotes, removeItem, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart deve ser usado dentro de CartProvider.');
  return ctx;
}
