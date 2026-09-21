import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { CATEGORIES, PRODUCTS } from '../src/data/menu.ts';
const __dirname = dirname(fileURLToPath(import.meta.url));
const out = resolve(__dirname, '../backend/seed_menu.json');
writeFileSync(out, JSON.stringify({ categories: CATEGORIES, products: PRODUCTS }, null, 2), 'utf8');
console.log('seed_menu.json:', CATEGORIES.length, 'categorias,', PRODUCTS.length, 'produtos');
