/**
 * Gera supabase/migrations/0003_seed.sql a partir dos dados reais do cardápio
 * (src/data/menu.ts). Rode com: npm run gen:seed
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
-- Seu Paulo Delivery — Seed do cardápio (gerado automaticamente).
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


const out = resolve(__dirname, '../supabase/migrations/0003_seed.sql');
writeFileSync(out, sql, 'utf8');
console.log(`Seed gerado: ${out} (${CATEGORIES.length} categorias, ${PRODUCTS.length} produtos)`);
