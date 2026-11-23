import { useEffect, useMemo, useState } from 'react';
import type { Category, Product } from '@/types';
import { repository } from '@/services';

/** Carrega categorias e produtos do cardápio. */
export function useMenu() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([repository.getCategories(), repository.getProducts()])
      .then(([c, p]) => {
        if (!active) return;
        setCategories(c);
        setProducts(p);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const sections = useMemo(() => {
    const available = new Map<string, Product[]>();
    for (const product of products) {
      if (!product.available) continue;
      const items = available.get(product.categorySlug);
      if (items) items.push(product);
      else available.set(product.categorySlug, [product]);
    }

    return categories.flatMap((category) => {
      const items = available.get(category.slug);
      return category.slug !== 'mais-pedidos' && items ? [{ category, items }] : [];
    });
  }, [categories, products]);

  return { sections, products, loading, error };
}
