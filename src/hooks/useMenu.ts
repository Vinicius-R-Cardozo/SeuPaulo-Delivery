import { useEffect, useState } from 'react';
import type { Category, Product } from '@/types';
import { repository } from '@/services';

/** Carrega categorias e produtos do cardápio. */
export function useMenu() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([repository.getCategories(), repository.getProducts()]).then(([c, p]) => {
      if (!active) return;
      setCategories(c);
      setProducts(p);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  return { categories, products, loading };
}
