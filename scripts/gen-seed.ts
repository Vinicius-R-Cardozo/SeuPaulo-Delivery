/**
 * Gera supabase/migrations/0003_seed.sql a partir dos dados reais do cardápio
 * (src/data/menu.ts) e dos cupons. Rode com: npm run gen:seed
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { CATEGORIES, PRODUCTS } from '../src/data/menu.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const q = (s: string) => `'${String(s).replace(/'/g, "''")}'`;
const json = (v: unknown) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
const arr = (a: string[] = []) =>
  `array[${a.map((x) => q(x)).join(',')}]::text[]`;

let sql = `-- =====================================================================
-- Seu Paulo Delivery — Seed do cardápio e cupons (gerado automaticamente).
-- NÃO edite à mão: rode "npm run gen:seed". Rode após 0002_rls.sql.
-- =====================================================================

`;

sql += '-- Categorias\n';
for (const c of CATEGORIES) {
  sql += `insert into public.categories (id, slug, name, emoji, sort_order) values (${q(c.id)}, ${q(
    c.slug,
  )}, ${q(c.name)}, ${q(c.emoji)}, ${c.sortOrder}) on conflict (id) do update set name=excluded.name, emoji=excluded.emoji, sort_order=excluded.sort_order;\n`;
}

sql += '\n-- Produtos\n';
for (const p of PRODUCTS) {
  sql += `insert into public.products (id, category_slug, name, description, price, image, available, serves, tags, popular, is_new, addon_groups) values (${q(
    p.id,
  )}, ${q(p.categorySlug)}, ${q(p.name)}, ${q(p.description)}, ${p.price}, ${q(p.image)}, ${p.available}, ${
    p.serves ? q(p.serves) : 'null'
  }, ${arr(p.tags)}, ${!!p.popular}, ${!!p.isNew}, ${json(p.addonGroups)}) on conflict (id) do update set name=excluded.name, description=excluded.description, price=excluded.price, image=excluded.image, available=excluded.available, serves=excluded.serves, tags=excluded.tags, popular=excluded.popular, is_new=excluded.is_new, addon_groups=excluded.addon_groups;\n`;
}

sql += `
-- Cupons de exemplo
insert into public.coupons (code, description, type, value, min_subtotal, max_uses, used_count, expires_at, active) values
  ('BEMVINDO10', '10% de desconto no primeiro pedido', 'percent', 10, 30, 1000, 0, now() + interval '90 days', true),
  ('SEUPAULO',   'R$ 15 off em pedidos acima de R$ 80', 'fixed', 15, 80, 500, 0, now() + interval '60 days', true),
  ('PROMOCAO',   '20% off na semana do boteco', 'percent', 20, 50, 200, 0, now() + interval '30 days', true)
on conflict (code) do nothing;
`;

const out = resolve(__dirname, '../supabase/migrations/0003_seed.sql');
writeFileSync(out, sql, 'utf8');
console.log(`Seed gerado: ${out} (${CATEGORIES.length} categorias, ${PRODUCTS.length} produtos)`);
