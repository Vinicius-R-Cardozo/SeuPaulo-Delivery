/** Emite o SQL do catálogo a partir dos PDFs transcritos em src/data/menu.ts. */
import { CATEGORIES, PRODUCTS } from '../src/data/menu.ts';

const marker = '-- Catálogo gerado por npm run gen:seed a partir de src/data/menu.ts.';
const q = (s: string) => "'" + s.replaceAll("'", "''") + "'";
const categories = CATEGORIES.map(({ id, slug, name, emoji, sortOrder }) =>
  '  (' + [q(id), q(slug), q(name), q(emoji), sortOrder].join(', ') + ')',
);
const products = PRODUCTS.map(({ id, categorySlug, name, description, price, image, available, addonGroups, availableWeekdays }) => {
  const weekdays = availableWeekdays ? 'array[' + availableWeekdays.join(',') + ']::smallint[]' : 'null';
  return '  (' + [
    q(id), q(categorySlug), q(name), q(description), price.toFixed(2), q(image), available,
    q(JSON.stringify(addonGroups)) + '::jsonb', weekdays,
  ].join(', ') + ')';
});

const sql = [
  marker,
  'insert into public.categories (id, slug, name, emoji, sort_order) values',
  categories.join(',\n'),
  'on conflict (slug) do update set name = excluded.name;',
  '',
  'insert into public.products (id, category_slug, name, description, price, image, available, addon_groups, available_weekdays) values',
  products.join(',\n'),
  'on conflict (id) do nothing;',
  '',
].join('\n');
process.stdout.write(sql);
